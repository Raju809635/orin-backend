const mongoose = require("mongoose");
const Availability = require("../models/Availability");
const Session = require("../models/Session");
const Notification = require("../models/Notification");
const User = require("../models/User");
const MentorProfile = require("../models/MentorProfile");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { createAuditLog } = require("../services/auditService");
const {
  createRazorpayOrder,
  verifyRazorpaySignature,
  razorpayKeyId
} = require("../services/paymentService");
const {
  paymentMode,
  orinUpiId,
  orinQrImageUrl,
  manualPaymentWindowMinutes,
  publicBaseUrl
} = require("../config/env");
const { uploadImageFromPath, safeUnlink } = require("../services/externalStorageService");

const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const PLATFORM_FEE_PERCENT = 30;
const MENTOR_SHARE_PERCENT = 70;

function toScheduledDate(date, time) {
  return new Date(`${date}T${time}:00.000Z`);
}

function inTimeRange(time, start, end) {
  return time >= start && time < end;
}

function getBaseUrl(req) {
  if (publicBaseUrl) return publicBaseUrl.replace(/\/+$/, "");
  const protocol = req.headers["x-forwarded-proto"] || req.protocol || "http";
  return `${protocol}://${req.get("host")}`;
}

function createPaymentDueAt() {
  return new Date(Date.now() + manualPaymentWindowMinutes * 60 * 1000);
}

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function buildRevenueSnapshot(amount) {
  const totalAmount = Math.max(roundMoney(amount), 0);
  const platformFeeAmount = roundMoney((totalAmount * PLATFORM_FEE_PERCENT) / 100);
  const mentorPayoutAmount = roundMoney(totalAmount - platformFeeAmount);

  return {
    totalAmount,
    platformFeePercent: PLATFORM_FEE_PERCENT,
    mentorSharePercent: MENTOR_SHARE_PERCENT,
    platformFeeAmount,
    mentorPayoutAmount
  };
}

function getResolvedPayoutStatus(session) {
  if (session?.payoutStatus) return session.payoutStatus;
  const isPaid = ["paid", "verified"].includes(String(session?.paymentStatus || ""));
  const isCompleted = String(session?.sessionStatus || "") === "completed" || String(session?.status || "") === "completed";
  return isPaid && isCompleted ? "pending" : "not_ready";
}

function getResolvedMentorConfirmationStatus(session) {
  if (session?.mentorPayoutConfirmationStatus) return session.mentorPayoutConfirmationStatus;
  if (getResolvedPayoutStatus(session) === "paid") return "pending";
  if (getResolvedPayoutStatus(session) === "issue_reported") return "issue_reported";
  return "not_ready";
}

function buildSessionFinancials(session = {}) {
  const snapshot = buildRevenueSnapshot(session.amount);
  return {
    amount: snapshot.totalAmount,
    platformFeePercent: Number(session.platformFeePercent || snapshot.platformFeePercent),
    mentorSharePercent: Number(session.mentorSharePercent || snapshot.mentorSharePercent),
    platformFeeAmount: roundMoney(session.platformFeeAmount || snapshot.platformFeeAmount),
    mentorPayoutAmount: roundMoney(session.mentorPayoutAmount || snapshot.mentorPayoutAmount),
    payoutStatus: getResolvedPayoutStatus(session),
    mentorPayoutConfirmationStatus: getResolvedMentorConfirmationStatus(session)
  };
}

function sessionFinancialPayload(amount) {
  const snapshot = buildRevenueSnapshot(amount);
  return {
    amount: snapshot.totalAmount,
    platformFeePercent: snapshot.platformFeePercent,
    mentorSharePercent: snapshot.mentorSharePercent,
    platformFeeAmount: snapshot.platformFeeAmount,
    mentorPayoutAmount: snapshot.mentorPayoutAmount
  };
}

async function getMentorPayoutProfiles(mentorIds = []) {
  if (!mentorIds.length) return new Map();
  const rows = await MentorProfile.find({ userId: { $in: mentorIds } })
    .select("userId payoutUpiId payoutQrCodeUrl payoutPhoneNumber phoneNumber title company")
    .lean();

  return new Map(
    rows.map((item) => [
      String(item.userId),
      {
        upiId: item.payoutUpiId || "",
        qrCodeUrl: item.payoutQrCodeUrl || "",
        phoneNumber: item.payoutPhoneNumber || item.phoneNumber || "",
        title: item.title || "",
        company: item.company || ""
      }
    ])
  );
}

function enrichSessionForPayout(session, mentorPaymentDetails = null) {
  const financials = buildSessionFinancials(session);
  const isPaid = ["paid", "verified"].includes(String(session?.paymentStatus || ""));
  const isCompleted = String(session?.sessionStatus || "") === "completed" || String(session?.status || "") === "completed";
  const hasMentorPaymentDetails = Boolean(
    mentorPaymentDetails?.upiId || mentorPaymentDetails?.qrCodeUrl || mentorPaymentDetails?.phoneNumber
  );

  return {
    ...session,
    ...financials,
    mentorPaymentDetails: mentorPaymentDetails || {
      upiId: "",
      qrCodeUrl: "",
      phoneNumber: "",
      title: "",
      company: ""
    },
    payoutEligible: isPaid && isCompleted,
    hasMentorPaymentDetails,
    canAdminMarkPayoutPaid:
      isPaid &&
      isCompleted &&
      hasMentorPaymentDetails &&
      ["pending", "issue_reported"].includes(financials.payoutStatus),
    canMentorConfirmPayout:
      financials.payoutStatus === "paid" &&
      ["pending", "issue_reported"].includes(financials.mentorPayoutConfirmationStatus)
  };
}

async function getSessionAmountForMentor(mentorId) {
  const mentorProfile = await MentorProfile.findOne({ userId: mentorId }).select("sessionPrice").lean();
  const profilePrice = Number(mentorProfile?.sessionPrice || 0);
  if (profilePrice > 0) return profilePrice;

  const mentorUser = await User.findById(mentorId).select("sessionPrice").lean();
  const userPrice = Number(mentorUser?.sessionPrice || 0);
  if (userPrice > 0) return userPrice;

  return 499;
}

async function validateSlot({ mentorId, date, time, durationMinutes }) {
  const blockedDate = await Availability.findOne({
    mentorId,
    isBlockedDate: true,
    blockedDate: date
  });

  if (blockedDate) {
    throw new ApiError(400, "Mentor is unavailable on selected date");
  }

  const dayLabel = weekdayLabels[new Date(`${date}T00:00:00.000Z`).getUTCDay()];
  const weeklySlots = await Availability.find({
    mentorId,
    isBlockedDate: false,
    day: dayLabel
  });

  const slotMatch = weeklySlots.find((slot) => {
    const sessionEndHourMin = (() => {
      const [h, m] = time.split(":").map(Number);
      const total = h * 60 + m + durationMinutes;
      const eh = String(Math.floor(total / 60)).padStart(2, "0");
      const em = String(total % 60).padStart(2, "0");
      return `${eh}:${em}`;
    })();
    return inTimeRange(time, slot.startTime, slot.endTime) && sessionEndHourMin <= slot.endTime;
  });

  if (!slotMatch) {
    throw new ApiError(400, "Selected time is outside mentor availability");
  }
}

async function ensurePaymentWindowOpen(session) {
  if (!session.paymentDueAt) return;
  if (new Date(session.paymentDueAt).getTime() < Date.now()) {
    if (session.status !== "cancelled" || session.paymentStatus !== "rejected") {
      session.status = "cancelled";
      session.paymentStatus = "rejected";
      session.paymentRejectReason = "Payment window expired";
      await session.save();
    }
    throw new ApiError(400, "Payment window expired. Please book again.");
  }
}

async function expireOverduePendingSessions() {
  await Session.updateMany(
    {
      paymentStatus: "pending",
      status: "payment_pending",
      paymentDueAt: { $lt: new Date() }
    },
    {
      $set: {
        status: "cancelled",
        paymentStatus: "rejected",
        paymentRejectReason: "Payment window expired"
      }
    }
  );
}

exports.bookSession = asyncHandler(async (req, res) => {
  const { mentorId, date, time, durationMinutes, notes } = req.body;

  if (!mongoose.Types.ObjectId.isValid(mentorId)) throw new ApiError(400, "Invalid mentor id");
  if (mentorId === req.user.id) throw new ApiError(400, "Cannot book session with yourself");

  const mentor = await User.findOne({ _id: mentorId, role: "mentor", approvalStatus: "approved" });
  if (!mentor) throw new ApiError(404, "Mentor not found");

  await validateSlot({ mentorId, date, time, durationMinutes });

  const scheduledStart = toScheduledDate(date, time);

  const conflict = await Session.findOne({
    mentorId,
    scheduledStart,
    status: { $in: ["pending", "payment_pending", "approved", "confirmed"] }
  });
  if (conflict) throw new ApiError(409, "This slot is already booked");

  const amount = await getSessionAmountForMentor(mentorId);

  const session = await Session.create({
    studentId: req.user.id,
    mentorId,
    date,
    time,
    durationMinutes,
    scheduledStart,
    ...sessionFinancialPayload(amount),
    paymentStatus: "pending",
    sessionStatus: "booked",
    notes: notes || "",
    status: "pending"
  });

  await createAuditLog({
    req,
    actorId: req.user.id,
    action: "session.book",
    entityType: "Session",
    entityId: session._id,
    metadata: { mentorId, date, time, durationMinutes }
  });

  res.status(201).json({
    message: "Session booking request created",
    session
  });
});

exports.createSessionOrder = asyncHandler(async (req, res) => {
  await expireOverduePendingSessions();

  const { mentorId, date, time, durationMinutes, notes } = req.body;

  if (!mongoose.Types.ObjectId.isValid(mentorId)) throw new ApiError(400, "Invalid mentor id");
  if (mentorId === req.user.id) throw new ApiError(400, "Cannot book session with yourself");

  const mentor = await User.findOne({ _id: mentorId, role: "mentor", approvalStatus: "approved" });
  if (!mentor) throw new ApiError(404, "Mentor not found");

  await validateSlot({ mentorId, date, time, durationMinutes });

  const scheduledStart = toScheduledDate(date, time);

  const conflict = await Session.findOne({
    mentorId,
    scheduledStart,
    status: { $in: ["pending", "payment_pending", "approved", "confirmed"] }
  });
  if (conflict) throw new ApiError(409, "This slot is already booked");

  const amount = await getSessionAmountForMentor(mentorId);

  if (paymentMode === "manual") {
    const paymentDueAt = createPaymentDueAt();
    const session = await Session.create({
      studentId: req.user.id,
      mentorId,
      date,
      time,
      durationMinutes,
      scheduledStart,
      ...sessionFinancialPayload(amount),
      currency: "INR",
      paymentMode: "manual",
      paymentStatus: "pending",
      sessionStatus: "booked",
      notes: notes || "",
      status: "payment_pending",
      paymentDueAt
    });

    await createAuditLog({
      req,
      actorId: req.user.id,
      action: "session.manual_payment.create",
      entityType: "Session",
      entityId: session._id,
      metadata: { mentorId, date, time, amount }
    });

    return res.status(201).json({
      message: "Manual payment required",
      mode: "manual",
      session,
      paymentInstructions: {
        upiId: orinUpiId,
        qrImageUrl: orinQrImageUrl,
        amount,
        currency: "INR",
        dueAt: paymentDueAt
      }
    });
  }

  const order = await createRazorpayOrder({
    amount,
    currency: "INR",
    receipt: `orin_sess_${Date.now()}`,
    notes: {
      studentId: req.user.id,
      mentorId,
      date,
      time
    }
  });

  const paymentDueAt = createPaymentDueAt();

  const session = await Session.create({
    studentId: req.user.id,
    mentorId,
    date,
    time,
    durationMinutes,
    scheduledStart,
    ...sessionFinancialPayload(amount),
    currency: "INR",
    orderId: order.id,
    paymentMode: "razorpay",
    paymentStatus: "pending",
    sessionStatus: "booked",
    notes: notes || "",
    status: "payment_pending",
    paymentDueAt
  });

  await createAuditLog({
    req,
    actorId: req.user.id,
    action: "session.order.create",
    entityType: "Session",
    entityId: session._id,
    metadata: { orderId: order.id, amount }
  });

  res.status(201).json({
    message: "Razorpay order created",
    mode: "razorpay",
    session,
    order: {
      id: order.id,
      amount: order.amount,
      currency: order.currency
    },
    razorpayKeyId,
    paymentInstructions: {
      amount,
      currency: "INR",
      dueAt: paymentDueAt
    }
  });
});

exports.retrySessionPaymentOrder = asyncHandler(async (req, res) => {
  await expireOverduePendingSessions();

  const session = await Session.findOne({ _id: req.params.id, studentId: req.user.id });
  if (!session) throw new ApiError(404, "Session not found");

  if (session.paymentMode !== "razorpay") {
    throw new ApiError(400, "Only Razorpay sessions can be retried here");
  }

  if (["paid", "verified"].includes(session.paymentStatus) || session.sessionStatus === "confirmed") {
    throw new ApiError(400, "This session is already paid and confirmed");
  }

  if (session.status === "cancelled") {
    throw new ApiError(400, "Payment window expired. Please book again.");
  }

  await ensurePaymentWindowOpen(session);

  const order = await createRazorpayOrder({
    amount: session.amount,
    currency: session.currency || "INR",
    receipt: `orin_sess_retry_${Date.now()}`,
    notes: {
      sessionId: String(session._id),
      studentId: req.user.id,
      mentorId: String(session.mentorId),
      date: session.date,
      time: session.time
    }
  });

  const paymentDueAt = createPaymentDueAt();
  session.orderId = order.id;
  session.paymentStatus = "pending";
  session.status = "payment_pending";
  session.paymentRejectReason = "";
  session.paymentDueAt = paymentDueAt;
  await session.save();

  await createAuditLog({
    req,
    actorId: req.user.id,
    action: "session.order.retry",
    entityType: "Session",
    entityId: session._id,
    metadata: { orderId: order.id, amount: session.amount }
  });

  res.status(200).json({
    message: "Razorpay order refreshed",
    mode: "razorpay",
    session,
    order: {
      id: order.id,
      amount: order.amount,
      currency: order.currency
    },
    razorpayKeyId,
    paymentInstructions: {
      amount: session.amount,
      currency: session.currency || "INR",
      dueAt: paymentDueAt
    }
  });
});

exports.verifySessionPayment = asyncHandler(async (req, res) => {
  const { sessionId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

  if (!mongoose.Types.ObjectId.isValid(sessionId)) throw new ApiError(400, "Invalid session id");

  const session = await Session.findOne({ _id: sessionId, studentId: req.user.id });
  if (!session) throw new ApiError(404, "Session not found");

  if (session.paymentMode === "manual") {
    throw new ApiError(400, "Manual payment sessions are verified by admin");
  }

  await ensurePaymentWindowOpen(session);

  if (session.paymentStatus === "paid") {
    return res.status(200).json({ message: "Payment already verified", session });
  }

  if (session.orderId !== razorpay_order_id) {
    throw new ApiError(400, "Order id mismatch");
  }

  const valid = verifyRazorpaySignature({
    orderId: razorpay_order_id,
    paymentId: razorpay_payment_id,
    signature: razorpay_signature
  });

  if (!valid) {
    throw new ApiError(400, "Invalid payment signature");
  }

  session.paymentStatus = "paid";
  session.paymentId = razorpay_payment_id;
  session.paymentSignature = razorpay_signature;
  session.sessionStatus = "confirmed";
  session.status = "confirmed";
  session.payoutStatus = "not_ready";
  session.mentorPayoutConfirmationStatus = "not_ready";
  session.paymentRejectReason = "";
  session.paymentDueAt = null;
  await session.save();

  await createAuditLog({
    req,
    actorId: req.user.id,
    action: "session.payment.verify",
    entityType: "Session",
    entityId: session._id,
    metadata: { orderId: razorpay_order_id, paymentId: razorpay_payment_id }
  });

  res.status(200).json({
    message: "Payment verified and session confirmed",
    session
  });
});

exports.submitManualPaymentProof = asyncHandler(async (req, res) => {
  await expireOverduePendingSessions();

  const session = await Session.findOne({ _id: req.params.id, studentId: req.user.id });
  if (!session) throw new ApiError(404, "Session not found");
  if (session.paymentMode !== "manual") throw new ApiError(400, "This session is not in manual payment mode");

  await ensurePaymentWindowOpen(session);

  if (!["payment_pending", "pending"].includes(session.status)) {
    throw new ApiError(400, "Payment proof can be submitted only for pending payment sessions");
  }

  let screenshotUrl = (req.body.paymentScreenshot || "").trim();
  if (req.file?.filename) {
    screenshotUrl = `${getBaseUrl(req)}/uploads/payment-screenshots/${req.file.filename}`;
    if (req.file?.path) {
      try {
        const uploaded = await uploadImageFromPath(req.file.path, { folder: "orin/manual-payments" });
        screenshotUrl = uploaded.url;
        await safeUnlink(req.file.path);
      } catch (err) {
        const msg = String(err?.message || "");
        // If Cloudinary isn't configured, keep local fallback for dev.
        // If it IS configured but upload failed, surface the error so production doesn't store dead local paths.
        if (!msg.toLowerCase().includes("cloudinary is not configured")) {
          throw err;
        }
      }
    }
  }
  if (!screenshotUrl) {
    throw new ApiError(400, "Payment screenshot is required");
  }

  session.paymentScreenshot = screenshotUrl;
  session.transactionReference = (req.body.transactionReference || "").trim();
  session.paymentStatus = "waiting_verification";
  session.status = "pending";
  session.paymentRejectReason = "";
  await session.save();

  await createAuditLog({
    req,
    actorId: req.user.id,
    action: "session.manual_payment.submit",
    entityType: "Session",
    entityId: session._id
  });

  res.status(200).json({
    message: "Payment submitted. Awaiting admin verification.",
    session
  });
});

exports.getPendingManualPayments = asyncHandler(async (_req, res) => {
  await expireOverduePendingSessions();

  const sessions = await Session.find({
    paymentMode: "manual",
    paymentStatus: "waiting_verification",
    status: { $in: ["pending", "payment_pending"] }
  })
    .populate("studentId", "name email")
    .populate("mentorId", "name email")
    .sort({ updatedAt: -1 })
    .lean();

  res.status(200).json(sessions.map((session) => ({ ...session, ...buildSessionFinancials(session) })));
});

exports.reviewManualPayment = asyncHandler(async (req, res) => {
  const session = await Session.findById(req.params.id);
  if (!session) throw new ApiError(404, "Session not found");
  if (session.paymentMode !== "manual") throw new ApiError(400, "Session is not manual payment mode");
  if (session.paymentStatus !== "waiting_verification") {
    throw new ApiError(400, "Session is not waiting for payment verification");
  }

  const action = req.body.action;
  if (action === "verify") {
    session.paymentStatus = "verified";
    session.verifiedByAdmin = true;
    session.verifiedAt = new Date();
    session.sessionStatus = "confirmed";
    session.status = "confirmed";
    session.payoutStatus = "not_ready";
    session.mentorPayoutConfirmationStatus = "not_ready";
    session.paymentRejectReason = "";
  } else {
    session.paymentStatus = "rejected";
    session.status = "cancelled";
    session.sessionStatus = "booked";
    session.paymentRejectReason = (req.body.rejectReason || "").trim();
  }

  await session.save();

  const notifyMessage =
    action === "verify"
      ? `Your payment is verified. Session is confirmed for ${session.date} ${session.time}. Please wait for mentor meet link.`
      : `Your session payment was rejected.${session.paymentRejectReason ? ` Reason: ${session.paymentRejectReason}` : ""}`;

  await Notification.insertMany([
    {
      title: action === "verify" ? "Payment Verified" : "Payment Rejected",
      message: notifyMessage,
      type: "booking",
      sentBy: req.user.id,
      targetRole: "student",
      recipient: session.studentId
    },
    {
      title: action === "verify" ? "Session Confirmed" : "Session Payment Rejected",
      message:
        action === "verify"
          ? `Student payment is verified for session on ${session.date} ${session.time}. Please prepare and share meet link near session time.`
          : "A student's manual payment was rejected. Session has been cancelled.",
      type: "booking",
      sentBy: req.user.id,
      targetRole: "mentor",
      recipient: session.mentorId
    }
  ]);

  await createAuditLog({
    req,
    actorId: req.user.id,
    action: action === "verify" ? "session.manual_payment.verify" : "session.manual_payment.reject",
    entityType: "Session",
    entityId: session._id,
    metadata: {
      rejectReason: session.paymentRejectReason || ""
    }
  });

  res.status(200).json({
    message: action === "verify" ? "Payment verified" : "Payment rejected",
    session
  });
});

exports.updateSessionMeetingLink = asyncHandler(async (req, res) => {
  const session = await Session.findOne({ _id: req.params.id, mentorId: req.user.id });
  if (!session) throw new ApiError(404, "Session not found");

  const isConfirmedPaid =
    (session.paymentStatus === "paid" || session.paymentStatus === "verified") &&
    session.sessionStatus === "confirmed";

  if (!isConfirmedPaid) {
    throw new ApiError(400, "Meeting link can be set only for confirmed paid sessions");
  }

  const now = Date.now();
  const sessionStart = new Date(session.scheduledStart).getTime();
  const earliestAllowed = sessionStart - 5 * 60 * 1000;

  if (now < earliestAllowed) {
    throw new ApiError(400, "Meeting link can be set only in the last 5 minutes before session start");
  }

  session.meetingLink = req.body.meetingLink;
  await session.save();

  await Notification.create({
    title: "Meeting Link Available",
    message: "Your mentor has added the session meet link. You can join now.",
    type: "booking",
    sentBy: req.user.id,
    targetRole: "student",
    recipient: session.studentId
  });

  await createAuditLog({
    req,
    actorId: req.user.id,
    action: "session.meeting_link.update",
    entityType: "Session",
    entityId: session._id
  });

  res.status(200).json({
    message: "Meeting link updated",
    session
  });
});

exports.approveSession = asyncHandler(async (req, res) => {
  const session = await Session.findOneAndUpdate(
    { _id: req.params.id, mentorId: req.user.id, status: "pending" },
    { status: "approved" },
    { new: true }
  )
    .populate("studentId", "name email")
    .populate("mentorId", "name email");

  if (!session) throw new ApiError(404, "Pending session not found");

  await createAuditLog({
    req,
    actorId: req.user.id,
    action: "session.approve",
    entityType: "Session",
    entityId: session._id
  });

  res.status(200).json({ message: "Session approved", session });
});

exports.rejectSession = asyncHandler(async (req, res) => {
  const session = await Session.findOneAndUpdate(
    { _id: req.params.id, mentorId: req.user.id, status: "pending" },
    { status: "rejected" },
    { new: true }
  )
    .populate("studentId", "name email")
    .populate("mentorId", "name email");

  if (!session) throw new ApiError(404, "Pending session not found");

  await createAuditLog({
    req,
    actorId: req.user.id,
    action: "session.reject",
    entityType: "Session",
    entityId: session._id
  });

  res.status(200).json({ message: "Session rejected", session });
});

exports.cancelSession = asyncHandler(async (req, res) => {
  const session = await Session.findById(req.params.id);
  if (!session) throw new ApiError(404, "Session not found");

  const isStudent = session.studentId.toString() === req.user.id;
  const isMentor = session.mentorId.toString() === req.user.id;
  if (!isStudent && !isMentor) throw new ApiError(403, "Not authorized for this session");

  const isUnpaidPendingPayment =
    ["pending", "rejected"].includes(session.paymentStatus || "") &&
    ["payment_pending", "pending"].includes(session.status || "");

  if (session.status === "cancelled" && isUnpaidPendingPayment) {
    return res.status(200).json({ message: "Session already cancelled", session });
  }

  if (!["pending", "payment_pending", "approved", "rejected"].includes(session.status)) {
    throw new ApiError(400, "Only pending/payment_pending/approved/rejected sessions can be cancelled");
  }

  if (isStudent) {
    if (!isUnpaidPendingPayment) {
      const diffMs = session.scheduledStart.getTime() - Date.now();
      if (diffMs < 2 * 60 * 60 * 1000) {
        throw new ApiError(400, "Students can cancel only at least 2 hours before session");
      }
    }
  }

  const previousStatus = session.status;
  session.status = "cancelled";
  if (isUnpaidPendingPayment && session.paymentStatus === "pending") {
    session.paymentStatus = "rejected";
    session.paymentRejectReason = session.paymentRejectReason || "Cancelled by student";
  }
  await session.save();

  await createAuditLog({
    req,
    actorId: req.user.id,
    action: "session.cancel",
    entityType: "Session",
    entityId: session._id,
    metadata: { previousStatus }
  });

  res.status(200).json({ message: "Session cancelled", session });
});

exports.rescheduleSession = asyncHandler(async (req, res) => {
  const session = await Session.findById(req.params.id);
  if (!session) throw new ApiError(404, "Session not found");

  const isStudent = session.studentId.toString() === req.user.id;
  const isMentor = session.mentorId.toString() === req.user.id;
  if (!isStudent && !isMentor) throw new ApiError(403, "Not authorized for this session");

  if (!["pending", "approved"].includes(session.status)) {
    throw new ApiError(400, "Only pending/approved sessions can be rescheduled");
  }

  const { date, time, durationMinutes } = req.body;
  await validateSlot({ mentorId: session.mentorId.toString(), date, time, durationMinutes });

  const scheduledStart = toScheduledDate(date, time);
  const conflict = await Session.findOne({
    _id: { $ne: session._id },
    mentorId: session.mentorId,
    scheduledStart,
    status: { $in: ["pending", "payment_pending", "approved", "confirmed"] }
  });
  if (conflict) throw new ApiError(409, "Selected slot is already booked");

  session.date = date;
  session.time = time;
  session.durationMinutes = durationMinutes;
  session.scheduledStart = scheduledStart;
  session.status = "pending";
  await session.save();

  await createAuditLog({
    req,
    actorId: req.user.id,
    action: "session.reschedule",
    entityType: "Session",
    entityId: session._id,
    metadata: { date, time, durationMinutes }
  });

  res.status(200).json({ message: "Session rescheduled and moved to pending", session });
});

exports.completeSession = asyncHandler(async (req, res) => {
  const session = await Session.findOne({ _id: req.params.id, mentorId: req.user.id });
  if (!session) throw new ApiError(404, "Session not found");

  if (!["paid", "verified"].includes(String(session.paymentStatus || ""))) {
    throw new ApiError(400, "Only paid sessions can be marked complete");
  }

  if (session.sessionStatus === "completed" || session.status === "completed") {
    return res.status(200).json({ message: "Session already completed", session });
  }

  if (session.sessionStatus !== "confirmed" || session.status !== "confirmed") {
    throw new ApiError(400, "Only confirmed sessions can be completed");
  }

  if (new Date(session.scheduledStart).getTime() > Date.now()) {
    throw new ApiError(400, "Session can be completed only after the scheduled start time");
  }

  session.sessionStatus = "completed";
  session.status = "completed";
  session.payoutStatus = "pending";
  session.mentorPayoutConfirmationStatus = "not_ready";
  await session.save();

  await Notification.insertMany([
    {
      title: "Session Completed",
      message: `Your session on ${session.date} ${session.time} was marked completed by the mentor.`,
      type: "booking",
      sentBy: req.user.id,
      targetRole: "student",
      recipient: session.studentId
    },
    {
      title: "Payout Ready",
      message: "This paid session is now ready for ORIN payout processing.",
      type: "booking",
      sentBy: req.user.id,
      targetRole: "mentor",
      recipient: session.mentorId
    }
  ]);

  await createAuditLog({
    req,
    actorId: req.user.id,
    action: "session.complete",
    entityType: "Session",
    entityId: session._id
  });

  res.status(200).json({
    message: "Session marked as completed",
    session: enrichSessionForPayout(session.toObject())
  });
});

exports.getAdminSessionPayouts = asyncHandler(async (_req, res) => {
  await expireOverduePendingSessions();

  const sessions = await Session.find({
    paymentStatus: { $in: ["paid", "verified"] }
  })
    .populate("studentId", "name email")
    .populate("mentorId", "name email")
    .populate("payoutPaidBy", "name email role")
    .sort({ updatedAt: -1, scheduledStart: -1 })
    .lean();

  const mentorProfileMap = await getMentorPayoutProfiles(
    [...new Set(sessions.map((item) => String(item.mentorId?._id || item.mentorId || "")).filter(Boolean))]
  );

  const enriched = sessions.map((session) => {
    const mentorId = String(session.mentorId?._id || session.mentorId || "");
    return enrichSessionForPayout(session, mentorProfileMap.get(mentorId) || null);
  });

  res.status(200).json(enriched);
});

exports.markSessionPayoutPaid = asyncHandler(async (req, res) => {
  const session = await Session.findById(req.params.id);
  if (!session) throw new ApiError(404, "Session not found");

  const mentorProfile = await MentorProfile.findOne({ userId: session.mentorId })
    .select("payoutUpiId payoutQrCodeUrl payoutPhoneNumber phoneNumber")
    .lean();

  const payoutDetails = {
    upiId: mentorProfile?.payoutUpiId || "",
    qrCodeUrl: mentorProfile?.payoutQrCodeUrl || "",
    phoneNumber: mentorProfile?.payoutPhoneNumber || mentorProfile?.phoneNumber || ""
  };

  if (!["paid", "verified"].includes(String(session.paymentStatus || ""))) {
    throw new ApiError(400, "Session payment is not verified");
  }

  if (!(session.sessionStatus === "completed" || session.status === "completed")) {
    throw new ApiError(400, "Session must be completed before payout");
  }

  if (!(payoutDetails.upiId || payoutDetails.qrCodeUrl || payoutDetails.phoneNumber)) {
    throw new ApiError(400, "Mentor payout setup is missing");
  }

  const resolvedPayoutStatus = getResolvedPayoutStatus(session);
  if (!["pending", "issue_reported"].includes(resolvedPayoutStatus)) {
    throw new ApiError(400, "Payout is not pending");
  }

  session.payoutStatus = "paid";
  session.mentorPayoutConfirmationStatus = "pending";
  session.payoutPaidAt = new Date();
  session.payoutPaidBy = req.user.id;
  session.payoutNote = String(req.body?.note || "").trim();
  session.payoutReference = String(req.body?.reference || "").trim();
  session.mentorPayoutIssueNote = "";
  await session.save();

  await Notification.create({
    title: "Mentor Payout Sent",
    message: "ORIN marked your session payout as sent. Please confirm after you receive it.",
    type: "booking",
    sentBy: req.user.id,
    targetRole: "mentor",
    recipient: session.mentorId
  });

  await createAuditLog({
    req,
    actorId: req.user.id,
    action: "session.payout.mark_paid",
    entityType: "Session",
    entityId: session._id,
    metadata: {
      reference: session.payoutReference || "",
      note: session.payoutNote || ""
    }
  });

  res.status(200).json({
    message: "Mentor payout marked as paid",
    session: enrichSessionForPayout(session.toObject(), payoutDetails)
  });
});

exports.getMentorPayouts = asyncHandler(async (req, res) => {
  await expireOverduePendingSessions();

  const sessions = await Session.find({
    mentorId: req.user.id,
    paymentStatus: { $in: ["paid", "verified"] }
  })
    .populate("studentId", "name email")
    .populate("payoutPaidBy", "name email role")
    .sort({ scheduledStart: -1, updatedAt: -1 })
    .lean();

  const mentorProfile = await MentorProfile.findOne({ userId: req.user.id })
    .select("payoutUpiId payoutQrCodeUrl payoutPhoneNumber phoneNumber")
    .lean();

  const mentorPaymentDetails = {
    upiId: mentorProfile?.payoutUpiId || "",
    qrCodeUrl: mentorProfile?.payoutQrCodeUrl || "",
    phoneNumber: mentorProfile?.payoutPhoneNumber || mentorProfile?.phoneNumber || ""
  };

  const enriched = sessions.map((session) => enrichSessionForPayout(session, mentorPaymentDetails));

  const summary = enriched.reduce(
    (acc, session) => {
      acc.totalSessions += 1;
      acc.lifetimeGross += Number(session.amount || 0);
      acc.platformFees += Number(session.platformFeeAmount || 0);
      acc.mentorEarnings += Number(session.mentorPayoutAmount || 0);

      if (session.payoutStatus === "pending") acc.pendingPayoutAmount += Number(session.mentorPayoutAmount || 0);
      if (session.payoutStatus === "paid") acc.paidOutAmount += Number(session.mentorPayoutAmount || 0);
      if (session.mentorPayoutConfirmationStatus === "confirmed") acc.confirmedReceivedAmount += Number(session.mentorPayoutAmount || 0);
      if (session.payoutStatus === "issue_reported" || session.mentorPayoutConfirmationStatus === "issue_reported") {
        acc.issueAmount += Number(session.mentorPayoutAmount || 0);
      }
      return acc;
    },
    {
      totalSessions: 0,
      lifetimeGross: 0,
      platformFees: 0,
      mentorEarnings: 0,
      pendingPayoutAmount: 0,
      paidOutAmount: 0,
      confirmedReceivedAmount: 0,
      issueAmount: 0,
      payoutSetupComplete: Boolean(mentorPaymentDetails.upiId || mentorPaymentDetails.qrCodeUrl || mentorPaymentDetails.phoneNumber)
    }
  );

  Object.keys(summary).forEach((key) => {
    if (key !== "totalSessions" && key !== "payoutSetupComplete") {
      summary[key] = roundMoney(summary[key]);
    }
  });

  res.status(200).json({
    summary,
    payoutSetup: mentorPaymentDetails,
    sessions: enriched
  });
});

exports.confirmMentorPayoutReceived = asyncHandler(async (req, res) => {
  const session = await Session.findOne({ _id: req.params.id, mentorId: req.user.id });
  if (!session) throw new ApiError(404, "Session not found");

  if (getResolvedPayoutStatus(session) !== "paid") {
    throw new ApiError(400, "Payout is not marked as paid yet");
  }

  session.mentorPayoutConfirmationStatus = "confirmed";
  session.mentorPayoutConfirmedAt = new Date();
  session.mentorPayoutIssueNote = "";
  await session.save();

  await Notification.create({
    title: "Mentor Confirmed Payout",
    message: "A mentor confirmed payout receipt for a completed session.",
    type: "booking",
    sentBy: req.user.id,
    targetRole: "admin"
  });

  await createAuditLog({
    req,
    actorId: req.user.id,
    action: "session.payout.confirm_received",
    entityType: "Session",
    entityId: session._id
  });

  res.status(200).json({
    message: "Payout marked as received",
    session: enrichSessionForPayout(session.toObject())
  });
});

exports.reportMentorPayoutIssue = asyncHandler(async (req, res) => {
  const session = await Session.findOne({ _id: req.params.id, mentorId: req.user.id });
  if (!session) throw new ApiError(404, "Session not found");

  if (getResolvedPayoutStatus(session) !== "paid") {
    throw new ApiError(400, "Only paid-out sessions can be reported here");
  }

  const note = String(req.body?.issueNote || "").trim();
  if (!note) throw new ApiError(400, "Issue note is required");

  session.payoutStatus = "issue_reported";
  session.mentorPayoutConfirmationStatus = "issue_reported";
  session.mentorPayoutIssueNote = note;
  await session.save();

  await Notification.create({
    title: "Mentor Payout Issue",
    message: `A mentor reported a payout issue for session on ${session.date} ${session.time}.`,
    type: "booking",
    sentBy: req.user.id,
    targetRole: "admin"
  });

  await createAuditLog({
    req,
    actorId: req.user.id,
    action: "session.payout.report_issue",
    entityType: "Session",
    entityId: session._id,
    metadata: { issueNote: note }
  });

  res.status(200).json({
    message: "Payout issue reported",
    session: enrichSessionForPayout(session.toObject())
  });
});

exports.getStudentSessions = asyncHandler(async (req, res) => {
  await expireOverduePendingSessions();

  const sessions = await Session.find({ studentId: req.user.id })
    .populate("mentorId", "name email primaryCategory subCategory")
    .sort({ scheduledStart: 1 })
    .lean();

  const visibleSessions = sessions.filter((session) => {
    const hiddenCancelledManualPayment =
      session.status === "cancelled" &&
      ["pending", "rejected"].includes(session.paymentStatus || "");

    return !hiddenCancelledManualPayment;
  });

  const enrichedSessions = visibleSessions.map((session) => {
    const isManual = session.paymentMode === "manual";
    const needsPayment =
      Boolean(isManual) &&
      ["pending", "waiting_verification", "rejected"].includes(session.paymentStatus || "");

    return {
      ...session,
      ...buildSessionFinancials(session),
      paymentInstructions: needsPayment
        ? {
            upiId: orinUpiId || "",
            qrImageUrl: orinQrImageUrl || "",
            amount: session.amount || 0,
            currency: session.currency || "INR",
            dueAt: session.paymentDueAt || null
          }
        : null
    };
  });

  res.status(200).json(enrichedSessions);
});

exports.getMentorSessions = asyncHandler(async (req, res) => {
  await expireOverduePendingSessions();

  const mentorProfile = await MentorProfile.findOne({ userId: req.user.id })
    .select("payoutUpiId payoutQrCodeUrl payoutPhoneNumber phoneNumber title company")
    .lean();

  const sessions = await Session.find({ mentorId: req.user.id })
    .populate("studentId", "name email")
    .populate("payoutPaidBy", "name email role")
    .sort({ scheduledStart: 1 })
    .lean();

  const mentorPaymentDetails = {
    upiId: mentorProfile?.payoutUpiId || "",
    qrCodeUrl: mentorProfile?.payoutQrCodeUrl || "",
    phoneNumber: mentorProfile?.payoutPhoneNumber || mentorProfile?.phoneNumber || "",
    title: mentorProfile?.title || "",
    company: mentorProfile?.company || ""
  };

  res.status(200).json(sessions.map((session) => enrichSessionForPayout(session, mentorPaymentDetails)));
});
