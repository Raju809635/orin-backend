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
  manualPaymentWindowMinutes
} = require("../config/env");

const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function toScheduledDate(date, time) {
  return new Date(`${date}T${time}:00.000Z`);
}

function inTimeRange(time, start, end) {
  return time >= start && time < end;
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

function ensurePaymentWindowOpen(session) {
  if (!session.paymentDueAt) return;
  if (new Date(session.paymentDueAt).getTime() < Date.now()) {
    if (session.status !== "cancelled") {
      session.status = "cancelled";
      session.paymentStatus = "rejected";
      session.paymentRejectReason = "Payment window expired";
    }
    throw new ApiError(400, "Payment window expired. Please book again.");
  }
}

async function expireOverdueManualSessions() {
  await Session.updateMany(
    {
      paymentMode: "manual",
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
    amount,
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
  await expireOverdueManualSessions();

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
    const paymentDueAt = new Date(Date.now() + manualPaymentWindowMinutes * 60 * 1000);
    const session = await Session.create({
      studentId: req.user.id,
      mentorId,
      date,
      time,
      durationMinutes,
      scheduledStart,
      amount,
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

  const session = await Session.create({
    studentId: req.user.id,
    mentorId,
    date,
    time,
    durationMinutes,
    scheduledStart,
    amount,
    currency: "INR",
    orderId: order.id,
    paymentMode: "razorpay",
    paymentStatus: "pending",
    sessionStatus: "booked",
    notes: notes || "",
    status: "pending"
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
    razorpayKeyId
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
  session.status = "approved";
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
  await expireOverdueManualSessions();

  const session = await Session.findOne({ _id: req.params.id, studentId: req.user.id });
  if (!session) throw new ApiError(404, "Session not found");
  if (session.paymentMode !== "manual") throw new ApiError(400, "This session is not in manual payment mode");

  ensurePaymentWindowOpen(session);

  if (!["payment_pending", "pending"].includes(session.status)) {
    throw new ApiError(400, "Payment proof can be submitted only for pending payment sessions");
  }

  session.paymentScreenshot = req.body.paymentScreenshot;
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
  await expireOverdueManualSessions();

  const sessions = await Session.find({
    paymentMode: "manual",
    paymentStatus: "waiting_verification",
    status: { $in: ["pending", "payment_pending"] }
  })
    .populate("studentId", "name email")
    .populate("mentorId", "name email")
    .sort({ updatedAt: -1 })
    .lean();

  res.status(200).json(sessions);
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
      ? "Your session payment is verified. Session is confirmed."
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
          ? "A student's manual payment was verified. Session is now confirmed."
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

  session.meetingLink = req.body.meetingLink;
  await session.save();

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

  if (!["pending", "approved"].includes(session.status)) {
    throw new ApiError(400, "Only pending/approved sessions can be cancelled");
  }

  if (isStudent) {
    const diffMs = session.scheduledStart.getTime() - Date.now();
    if (diffMs < 2 * 60 * 60 * 1000) {
      throw new ApiError(400, "Students can cancel only at least 2 hours before session");
    }
  }

  const previousStatus = session.status;
  session.status = "cancelled";
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

exports.getStudentSessions = asyncHandler(async (req, res) => {
  await expireOverdueManualSessions();

  const sessions = await Session.find({ studentId: req.user.id })
    .populate("mentorId", "name email primaryCategory subCategory")
    .sort({ scheduledStart: 1 })
    .lean();

  const enrichedSessions = sessions.map((session) => {
    const isManual = session.paymentMode === "manual";
    const needsPayment =
      isManual &&
      ["pending", "waiting_verification", "rejected"].includes(session.paymentStatus || "");

    return {
      ...session,
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
  await expireOverdueManualSessions();

  const sessions = await Session.find({ mentorId: req.user.id })
    .populate("studentId", "name email")
    .sort({ scheduledStart: 1 })
    .lean();
  res.status(200).json(sessions);
});
