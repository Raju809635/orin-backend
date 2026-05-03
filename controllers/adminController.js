const mongoose = require("mongoose");
const User = require("../models/User");
const Booking = require("../models/Booking");
const Session = require("../models/Session");
const Notification = require("../models/Notification");
const AuditLog = require("../models/AuditLog");
const StudentProfile = require("../models/StudentProfile");
const MentorProfile = require("../models/MentorProfile");
const CollaborateApplication = require("../models/CollaborateApplication");
const FeedPost = require("../models/FeedPost");
const Connection = require("../models/Connection");
const UserFollow = require("../models/UserFollow");
const MentorGroup = require("../models/MentorGroup");
const MentorLiveSession = require("../models/MentorLiveSession");
const MentorLiveSessionBooking = require("../models/MentorLiveSessionBooking");
const MentorSprint = require("../models/MentorSprint");
const MentorSprintEnrollment = require("../models/MentorSprintEnrollment");
const CommunityChallenge = require("../models/CommunityChallenge");
const CommunityChallengeSubmission = require("../models/CommunityChallengeSubmission");
const CareerOpportunity = require("../models/CareerOpportunity");
const KnowledgeResource = require("../models/KnowledgeResource");
const CertificationTrack = require("../models/CertificationTrack");
const CertificationRequest = require("../models/CertificationRequest");
const OrinCertification = require("../models/OrinCertification");
const CertificateTemplate = require("../models/CertificateTemplate");
const Bootcamp = require("../models/Bootcamp");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { issueCertificate } = require("../utils/certificateService");

function roundCurrency(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function getResolvedSprintPayoutStatus(enrollment = {}, sprint = null) {
  if (enrollment?.payoutStatus && enrollment.payoutStatus !== "not_ready") return enrollment.payoutStatus;
  const isPaid = String(enrollment?.paymentStatus || "") === "paid";
  const hasEnded = sprint?.endDate ? new Date(sprint.endDate).getTime() <= Date.now() : false;
  return isPaid && hasEnded ? "pending" : "not_ready";
}

function getResolvedSprintMentorConfirmationStatus(enrollment = {}, sprint = null) {
  if (enrollment?.mentorPayoutConfirmationStatus && enrollment.mentorPayoutConfirmationStatus !== "not_ready") {
    return enrollment.mentorPayoutConfirmationStatus;
  }
  const payoutStatus = getResolvedSprintPayoutStatus(enrollment, sprint);
  if (payoutStatus === "paid") return "pending";
  if (payoutStatus === "issue_reported") return "issue_reported";
  return "not_ready";
}

function enrichSprintPayoutRecord(enrollment = {}, sprint = null, mentorPaymentDetails = null) {
  const hasEnded = sprint?.endDate ? new Date(sprint.endDate).getTime() <= Date.now() : false;
  const payoutStatus = getResolvedSprintPayoutStatus(enrollment, sprint);
  const mentorPayoutConfirmationStatus = getResolvedSprintMentorConfirmationStatus(enrollment, sprint);
  const hasMentorPaymentDetails = Boolean(
    mentorPaymentDetails?.upiId || mentorPaymentDetails?.qrCodeUrl || mentorPaymentDetails?.phoneNumber
  );

  return {
    ...enrollment,
    payoutStatus,
    mentorPayoutConfirmationStatus,
    payoutEligible: String(enrollment.paymentStatus || "") === "paid" && hasEnded,
    hasMentorPaymentDetails,
    canAdminMarkPayoutPaid:
      String(enrollment.paymentStatus || "") === "paid" &&
      hasEnded &&
      hasMentorPaymentDetails &&
      ["pending", "issue_reported"].includes(payoutStatus),
    mentorPaymentDetails: mentorPaymentDetails || {
      upiId: "",
      qrCodeUrl: "",
      phoneNumber: "",
      title: "",
      company: ""
    }
  };
}

exports.getPendingMentors = asyncHandler(async (req, res) => {
  const mentors = await User.find({
    role: "mentor",
    approvalStatus: "pending"
  })
    .select("name email role approvalStatus primaryCategory subCategory specializations createdAt")
    .lean();

  const profiles = await MentorProfile.find({ userId: { $in: mentors.map((mentor) => mentor._id) } })
    .select("userId mentorOrgRole institutionName institutionType institutionDistrict assignedClasses institutionPermissions phoneNumber")
    .lean();
  const profileByUserId = new Map(profiles.map((profile) => [String(profile.userId), profile]));

  res.status(200).json(
    mentors.map((mentor) => ({
      ...mentor,
      mentorProfile: profileByUserId.get(String(mentor._id)) || null
    }))
  );
});

exports.approveMentor = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(400, "Invalid mentor id");
  }

  const mentor = await User.findOneAndUpdate(
    { _id: id, role: "mentor" },
    { approvalStatus: "approved" },
    { new: true }
  ).select("name email role approvalStatus primaryCategory subCategory specializations");

  if (!mentor) {
    throw new ApiError(404, "Mentor not found");
  }

  res.status(200).json({
    message: "Mentor approved successfully",
    mentor
  });
});

exports.getStudents = asyncHandler(async (req, res) => {
  const students = await User.find({ role: "student" })
    .select("name email role createdAt updatedAt")
    .sort({ createdAt: -1 })
    .lean();

  res.status(200).json(students);
});

exports.getDemographics = asyncHandler(async (req, res) => {
  const [roleCounts, mentorCategoryCounts, bookingStatusCounts, topStudentStates, topStudentColleges, topMentorStates] = await Promise.all([
    User.aggregate([{ $group: { _id: "$role", count: { $sum: 1 } } }]),
    User.aggregate([
      { $match: { role: "mentor", approvalStatus: "approved" } },
      { $group: { _id: "$primaryCategory", count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]),
    Booking.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
    StudentProfile.aggregate([
      { $match: { state: { $exists: true, $nin: ["", null] } } },
      { $group: { _id: "$state", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 8 }
    ]),
    StudentProfile.aggregate([
      { $match: { collegeName: { $exists: true, $nin: ["", null] } } },
      { $group: { _id: "$collegeName", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 8 }
    ]),
    MentorProfile.aggregate([
      { $match: { state: { $exists: true, $nin: ["", null] } } },
      { $group: { _id: "$state", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 8 }
    ])
  ]);

  const [pendingMentors, approvedMentors, totalUsers, totalBookings, totalSessions, paidSessions, revenueRows] = await Promise.all([
    User.countDocuments({ role: "mentor", approvalStatus: "pending" }),
    User.countDocuments({ role: "mentor", approvalStatus: "approved" }),
    User.countDocuments(),
    Booking.countDocuments(),
    Session.countDocuments(),
    Session.countDocuments({ paymentStatus: "paid" }),
    Session.aggregate([
      { $match: { paymentStatus: "paid" } },
      { $group: { _id: null, total: { $sum: "$amount" } } }
    ])
  ]);

  const roleSummary = {
    students: 0,
    mentors: 0,
    admins: 0
  };

  roleCounts.forEach((row) => {
    if (row._id === "student") roleSummary.students = row.count;
    if (row._id === "mentor") roleSummary.mentors = row.count;
    if (row._id === "admin") roleSummary.admins = row.count;
  });

  const bookingSummary = {
    pending: 0,
    approved: 0,
    rejected: 0
  };

  bookingStatusCounts.forEach((row) => {
    if (row._id && Object.prototype.hasOwnProperty.call(bookingSummary, row._id)) {
      bookingSummary[row._id] = row.count;
    }
  });

  res.status(200).json({
    totals: {
      users: totalUsers,
      bookings: totalBookings,
      sessions: totalSessions,
      paidSessions,
      revenue: revenueRows?.[0]?.total || 0,
      pendingMentors,
      approvedMentors
    },
    roles: roleSummary,
    bookings: bookingSummary,
    mentorCategories: mentorCategoryCounts.map((row) => ({
      category: row._id || "Unspecified",
      count: row.count
    })),
    regionalReach: {
      studentStates: topStudentStates.map((row) => ({ name: row._id || "Unspecified", count: row.count })),
      studentColleges: topStudentColleges.map((row) => ({ name: row._id || "Unspecified", count: row.count })),
      mentorStates: topMentorStates.map((row) => ({ name: row._id || "Unspecified", count: row.count }))
    }
  });
});

exports.sendNotification = asyncHandler(async (req, res) => {
  const { title, message, type, targetRole, recipientUserId } = req.body;

  if (recipientUserId && !mongoose.Types.ObjectId.isValid(recipientUserId)) {
    throw new ApiError(400, "Invalid recipient user id");
  }

  if (recipientUserId) {
    const recipientUser = await User.findById(recipientUserId).select("_id role").lean();

    if (!recipientUser) {
      throw new ApiError(404, "Recipient user not found");
    }

    const notification = await Notification.create({
      title,
      message,
      type,
      sentBy: req.user.id,
      targetRole: recipientUser.role,
      recipient: recipientUser._id
    });

    return res.status(201).json({
      message: "Notification sent to user",
      notification
    });
  }

  const notification = await Notification.create({
    title,
    message,
    type,
    sentBy: req.user.id,
    targetRole: targetRole || "all"
  });

  return res.status(201).json({
    message: "Notification sent",
    notification
  });
});

exports.getNotifications = asyncHandler(async (req, res) => {
  const notifications = await Notification.find()
    .populate("sentBy", "name email")
    .populate("recipient", "name email role")
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();

  res.status(200).json(notifications);
});

exports.getMentorProfiles = asyncHandler(async (_req, res) => {
  const profiles = await MentorProfile.aggregate([
    {
      $lookup: {
        from: "users",
        localField: "userId",
        foreignField: "_id",
        as: "user"
      }
    },
    { $unwind: "$user" },
    {
      $match: {
        "user.role": "mentor",
        "user.isDeleted": { $ne: true }
      }
    },
    {
      $project: {
        _id: "$user._id",
        name: "$user.name",
        email: "$user.email",
        approvalStatus: "$user.approvalStatus",
        status: "$user.approvalStatus",
        createdAt: "$user.createdAt",
        profilePhotoUrl: "$profilePhotoUrl",
        phoneNumber: "$phoneNumber",
        title: "$title",
        company: "$company",
        experienceYears: "$experienceYears",
        primaryCategory: "$primaryCategory",
        subCategory: "$subCategory",
        specializations: "$specializations",
        sessionPrice: "$sessionPrice",
        about: "$about",
        linkedInUrl: "$linkedInUrl",
        payoutUpiId: "$payoutUpiId",
        payoutQrCodeUrl: "$payoutQrCodeUrl",
        payoutPhoneNumber: "$payoutPhoneNumber",
        weeklyAvailabilitySlots: "$weeklyAvailabilitySlots",
        rating: "$rating",
        totalSessionsConducted: "$totalSessionsConducted",
        mentorOrgRole: "$mentorOrgRole",
        institutionName: "$institutionName",
        institutionType: "$institutionType",
        institutionDistrict: "$institutionDistrict",
        institutionSource: "$institutionSource",
        assignedClasses: "$assignedClasses",
        institutionPermissions: "$institutionPermissions"
      }
    },
    { $sort: { approvalStatus: 1, createdAt: -1 } }
  ]);

  res.status(200).json(profiles);
});

exports.sendMentorDirectMessage = asyncHandler(async (req, res) => {
  const { title, message, recipientUserIds } = req.body;

  const uniqueIds = [...new Set(recipientUserIds)];

  const recipients = await User.find({
    _id: { $in: uniqueIds },
    role: "mentor",
    isDeleted: false
  })
    .select("_id role")
    .lean();

  if (recipients.length === 0) {
    throw new ApiError(404, "No valid mentor recipients found");
  }

  const docs = recipients.map((recipient) => ({
    title,
    message,
    type: "direct",
    sentBy: req.user.id,
    targetRole: recipient.role,
    recipient: recipient._id
  }));

  const created = await Notification.insertMany(docs);

  res.status(201).json({
    message: "Direct messages sent to mentors",
    sentCount: created.length
  });
});

exports.getAuditLogs = asyncHandler(async (req, res) => {
  const page = Math.max(Number(req.query.page || 1), 1);
  const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 200);
  const skip = (page - 1) * limit;

  const filter = {};

  if (req.query.action) {
    filter.action = req.query.action;
  }

  if (req.query.status) {
    filter.status = req.query.status;
  }

  if (req.query.actorId) {
    if (!mongoose.Types.ObjectId.isValid(req.query.actorId)) {
      throw new ApiError(400, "Invalid actorId");
    }
    filter.actorId = req.query.actorId;
  }

  if (req.query.entityType) {
    filter.entityType = req.query.entityType;
  }

  if (req.query.from || req.query.to) {
    filter.createdAt = {};
    if (req.query.from) filter.createdAt.$gte = new Date(req.query.from);
    if (req.query.to) filter.createdAt.$lte = new Date(req.query.to);
  }

  const [logs, total] = await Promise.all([
    AuditLog.find(filter)
      .populate("actorId", "name email role")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    AuditLog.countDocuments(filter)
  ]);

  res.status(200).json({
    page,
    limit,
    total,
    pages: Math.ceil(total / limit),
    logs
  });
});

exports.getCollaborateApplications = asyncHandler(async (req, res) => {
  const status = (req.query.status || "").toString().trim();
  const filter = {};

  if (status && ["pending", "approved", "rejected"].includes(status)) {
    filter.status = status;
  }

  const applications = await CollaborateApplication.find(filter)
    .populate("reviewedBy", "name email")
    .sort({ createdAt: -1 })
    .lean();

  res.status(200).json(applications);
});

exports.reviewCollaborateApplication = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { action, adminNotes } = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(400, "Invalid application id");
  }

  const nextStatus = action === "approve" ? "approved" : "rejected";

  const application = await CollaborateApplication.findByIdAndUpdate(
    id,
    {
      status: nextStatus,
      adminNotes: (adminNotes || "").trim(),
      reviewedBy: req.user.id,
      reviewedAt: new Date()
    },
    { new: true }
  )
    .populate("reviewedBy", "name email")
    .lean();

  if (!application) {
    throw new ApiError(404, "Application not found");
  }

  res.status(200).json({
    message: nextStatus === "approved" ? "Collaboration approved" : "Collaboration rejected",
    application
  });
});

exports.getNetworkAdminOverview = asyncHandler(async (_req, res) => {
  const now = new Date();
  const [posts, publicPosts, privatePosts, pendingConnections, acceptedConnections, totalFollows, activeGroups, activeChallenges, upcomingLives, activeBootcamps] =
    await Promise.all([
      FeedPost.countDocuments(),
      FeedPost.countDocuments({ visibility: "public" }),
      FeedPost.countDocuments({ visibility: "private" }),
      Connection.countDocuments({ status: "pending" }),
      Connection.countDocuments({ status: "accepted" }),
      UserFollow.countDocuments(),
      MentorGroup.countDocuments({ isActive: true }),
      CommunityChallenge.countDocuments({ isActive: true }),
      MentorLiveSession.countDocuments({ isCancelled: false, startsAt: { $gte: now } }),
      Bootcamp.countDocuments({ isActive: true, startsAt: { $gte: now } })
    ]);

  res.status(200).json({
    posts: {
      total: posts,
      public: publicPosts,
      private: privatePosts
    },
    network: {
      pendingConnections,
      acceptedConnections,
      follows: totalFollows
    },
    communities: {
      activeGroups,
      activeChallenges,
      upcomingLiveSessions: upcomingLives,
      activeBootcamps
    }
  });
});

exports.getNetworkAdminPosts = asyncHandler(async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit || 100), 1), 300);
  const posts = await FeedPost.find({})
    .populate("authorId", "name email role")
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  res.status(200).json(posts);
});

exports.deleteNetworkPostByAdmin = asyncHandler(async (req, res) => {
  const { postId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(postId)) throw new ApiError(400, "Invalid post id");

  const deleted = await FeedPost.findByIdAndDelete(postId).lean();
  if (!deleted) throw new ApiError(404, "Post not found");

  res.status(200).json({ message: "Post deleted" });
});

exports.getNetworkAdminConnections = asyncHandler(async (req, res) => {
  const status = (req.query.status || "").toString().trim();
  const filter = {};
  if (status && ["pending", "accepted", "rejected", "blocked"].includes(status)) {
    filter.status = status;
  }

  const list = await Connection.find(filter)
    .populate("requesterId", "name email role")
    .populate("recipientId", "name email role")
    .sort({ updatedAt: -1 })
    .limit(300)
    .lean();

  res.status(200).json(list);
});

exports.getNetworkAdminFollows = asyncHandler(async (_req, res) => {
  const follows = await UserFollow.find({})
    .populate("followerId", "name email role")
    .populate("followingId", "name email role")
    .sort({ createdAt: -1 })
    .limit(300)
    .lean();

  res.status(200).json(follows);
});

exports.getNetworkAdminMentorGroups = asyncHandler(async (_req, res) => {
  const groups = await MentorGroup.find({})
    .populate("mentorId", "name email role approvalStatus")
    .sort({ updatedAt: -1 })
    .limit(200)
    .lean();

  res.status(200).json(groups);
});

exports.toggleNetworkAdminMentorGroup = asyncHandler(async (req, res) => {
  const { groupId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(groupId)) throw new ApiError(400, "Invalid group id");

  const group = await MentorGroup.findById(groupId);
  if (!group) throw new ApiError(404, "Group not found");
  group.isActive = !group.isActive;
  await group.save();

  res.status(200).json({ message: group.isActive ? "Group activated" : "Group disabled", group });
});

exports.getNetworkAdminLiveSessions = asyncHandler(async (_req, res) => {
  const sessions = await MentorLiveSession.find({})
    .populate("mentorId", "name email role")
    .populate("reviewedBy", "name email role")
    .sort({ startsAt: -1 })
    .limit(200)
    .lean();

  const sessionIds = sessions.map((item) => item._id);
  const bookingStats = sessionIds.length
    ? await MentorLiveSessionBooking.aggregate([
      { $match: { liveSessionId: { $in: sessionIds } } },
      {
        $group: {
          _id: "$liveSessionId",
          totalBookings: { $sum: 1 },
          paidBookings: {
            $sum: {
              $cond: [{ $eq: ["$paymentStatus", "paid"] }, 1, 0]
            }
          },
          pendingBookings: {
            $sum: {
              $cond: [{ $eq: ["$paymentStatus", "pending"] }, 1, 0]
            }
          }
        }
      }
    ])
    : [];

  const bookingMap = new Map(
    bookingStats.map((item) => [
      String(item._id),
      {
        totalBookings: Number(item.totalBookings || 0),
        paidBookings: Number(item.paidBookings || 0),
        pendingBookings: Number(item.pendingBookings || 0)
      }
    ])
  );

  res.status(200).json(
    sessions.map((session) => ({
      ...session,
      bookingStats: bookingMap.get(String(session._id)) || {
        totalBookings: 0,
        paidBookings: 0,
        pendingBookings: 0
      }
    }))
  );
});

exports.toggleNetworkAdminLiveSession = asyncHandler(async (req, res) => {
  const { liveSessionId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(liveSessionId)) throw new ApiError(400, "Invalid live session id");

  const session = await MentorLiveSession.findById(liveSessionId);
  if (!session) throw new ApiError(404, "Live session not found");
  session.isCancelled = !session.isCancelled;
  await session.save();

  res.status(200).json({ message: session.isCancelled ? "Live session cancelled" : "Live session reopened", session });
});

exports.reviewNetworkAdminLiveSession = asyncHandler(async (req, res) => {
  const { liveSessionId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(liveSessionId)) throw new ApiError(400, "Invalid live session id");

  const action = String(req.body?.action || "").trim();
  if (!["approve", "reject"].includes(action)) throw new ApiError(400, "action must be approve or reject");

  const session = await MentorLiveSession.findById(liveSessionId);
  if (!session) throw new ApiError(404, "Live session not found");

  session.approvalStatus = action === "approve" ? "approved" : "rejected";
  session.adminReviewNote = String(req.body?.note || "").trim();
  session.reviewedBy = req.user.id;
  session.reviewedAt = new Date();
  if (req.body?.isPublic !== undefined) session.isPublic = Boolean(req.body.isPublic);
  await session.save();

  res.status(200).json({
    message: action === "approve" ? "Live session approved" : "Live session rejected",
    session
  });
});

exports.getNetworkAdminLiveSessionBookings = asyncHandler(async (_req, res) => {
  const rows = await MentorLiveSessionBooking.find({ paymentStatus: "paid" })
    .populate("studentId", "name email")
    .populate("mentorId", "name email role")
    .populate("liveSessionId", "title startsAt sessionMode price currency posterImageUrl")
    .sort({ createdAt: -1 })
    .limit(500)
    .lean();

  res.status(200).json(rows);
});

exports.deleteNetworkAdminLiveSession = asyncHandler(async (req, res) => {
  const { liveSessionId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(liveSessionId)) throw new ApiError(400, "Invalid live session id");

  const session = await MentorLiveSession.findByIdAndDelete(liveSessionId);
  if (!session) throw new ApiError(404, "Live session not found");

  await MentorLiveSessionBooking.deleteMany({ liveSessionId });

  res.status(200).json({ message: "Live session deleted", sessionId: liveSessionId });
});

exports.getNetworkAdminSprints = asyncHandler(async (_req, res) => {
  const sprints = await MentorSprint.find({})
    .populate("mentorId", "name email role")
    .populate("reviewedBy", "name email role")
    .sort({ startDate: -1 })
    .limit(200)
    .lean();

  const sprintIds = sprints.map((item) => item._id);
  const enrollmentStats = sprintIds.length
    ? await MentorSprintEnrollment.aggregate([
      { $match: { sprintId: { $in: sprintIds } } },
      {
        $group: {
          _id: "$sprintId",
          totalEnrollments: { $sum: 1 },
          paidEnrollments: {
            $sum: {
              $cond: [{ $eq: ["$paymentStatus", "paid"] }, 1, 0]
            }
          },
          pendingEnrollments: {
            $sum: {
              $cond: [{ $eq: ["$paymentStatus", "pending"] }, 1, 0]
            }
          },
          grossRevenue: {
            $sum: {
              $cond: [{ $eq: ["$paymentStatus", "paid"] }, "$amount", 0]
            }
          },
          orinRevenue: {
            $sum: {
              $cond: [{ $eq: ["$paymentStatus", "paid"] }, "$platformFeeAmount", 0]
            }
          },
          mentorRevenue: {
            $sum: {
              $cond: [{ $eq: ["$paymentStatus", "paid"] }, "$mentorPayoutAmount", 0]
            }
          },
          payoutPendingCount: {
            $sum: {
              $cond: [{ $eq: ["$payoutStatus", "pending"] }, 1, 0]
            }
          },
          payoutPaidCount: {
            $sum: {
              $cond: [{ $eq: ["$payoutStatus", "paid"] }, 1, 0]
            }
          },
          payoutIssueCount: {
            $sum: {
              $cond: [{ $eq: ["$payoutStatus", "issue_reported"] }, 1, 0]
            }
          }
        }
      }
    ])
    : [];

  const enrollmentMap = new Map(
    enrollmentStats.map((item) => [
      String(item._id),
      {
        totalEnrollments: Number(item.totalEnrollments || 0),
        paidEnrollments: Number(item.paidEnrollments || 0),
        pendingEnrollments: Number(item.pendingEnrollments || 0),
        grossRevenue: roundCurrency(item.grossRevenue || 0),
        orinRevenue: roundCurrency(item.orinRevenue || 0),
        mentorRevenue: roundCurrency(item.mentorRevenue || 0),
        payoutPendingCount: Number(item.payoutPendingCount || 0),
        payoutPaidCount: Number(item.payoutPaidCount || 0),
        payoutIssueCount: Number(item.payoutIssueCount || 0)
      }
    ])
  );

  res.status(200).json(
    sprints.map((sprint) => ({
      ...sprint,
      enrollmentStats: enrollmentMap.get(String(sprint._id)) || {
        totalEnrollments: 0,
        paidEnrollments: 0,
        pendingEnrollments: 0,
        grossRevenue: 0,
        orinRevenue: 0,
        mentorRevenue: 0,
        payoutPendingCount: 0,
        payoutPaidCount: 0,
        payoutIssueCount: 0
      }
    }))
  );
});

exports.toggleNetworkAdminSprint = asyncHandler(async (req, res) => {
  const { sprintId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(sprintId)) throw new ApiError(400, "Invalid sprint id");

  const sprint = await MentorSprint.findById(sprintId);
  if (!sprint) throw new ApiError(404, "Sprint not found");
  sprint.isCancelled = !sprint.isCancelled;
  await sprint.save();

  res.status(200).json({ message: sprint.isCancelled ? "Sprint cancelled" : "Sprint reopened", sprint });
});

exports.reviewNetworkAdminSprint = asyncHandler(async (req, res) => {
  const { sprintId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(sprintId)) throw new ApiError(400, "Invalid sprint id");

  const action = String(req.body?.action || "").trim();
  if (!["approve", "reject"].includes(action)) throw new ApiError(400, "action must be approve or reject");

  const sprint = await MentorSprint.findById(sprintId);
  if (!sprint) throw new ApiError(404, "Sprint not found");

  sprint.approvalStatus = action === "approve" ? "approved" : "rejected";
  sprint.adminReviewNote = String(req.body?.note || "").trim();
  sprint.reviewedBy = req.user.id;
  sprint.reviewedAt = new Date();
  if (req.body?.isPublic !== undefined) sprint.isPublic = Boolean(req.body.isPublic);
  await sprint.save();

  res.status(200).json({
    message: action === "approve" ? "Sprint approved" : "Sprint rejected",
    sprint
  });
});

exports.deleteNetworkAdminSprint = asyncHandler(async (req, res) => {
  const { sprintId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(sprintId)) throw new ApiError(400, "Invalid sprint id");

  const sprint = await MentorSprint.findByIdAndDelete(sprintId);
  if (!sprint) throw new ApiError(404, "Sprint not found");

  await MentorSprintEnrollment.deleteMany({ sprintId });

  res.status(200).json({ message: "Sprint deleted", sprintId });
});

exports.getNetworkAdminSprintPayouts = asyncHandler(async (_req, res) => {
  const enrollments = await MentorSprintEnrollment.find({
    paymentStatus: "paid"
  })
    .populate("studentId", "name email")
    .populate("mentorId", "name email role")
    .populate("sprintId", "title startDate endDate sessionMode price currency posterImageUrl")
    .populate("payoutPaidBy", "name email role")
    .sort({ updatedAt: -1, createdAt: -1 })
    .limit(300)
    .lean();

  const mentorIds = [...new Set(enrollments.map((item) => String(item.mentorId?._id || item.mentorId || "")).filter(Boolean))];
  const mentorProfiles = await MentorProfile.find({ userId: { $in: mentorIds } })
    .select("userId payoutUpiId payoutQrCodeUrl payoutPhoneNumber phoneNumber title company")
    .lean();
  const mentorProfileMap = new Map(
    mentorProfiles.map((item) => [
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

  const enriched = enrollments.map((item) => {
    const mentorId = String(item.mentorId?._id || item.mentorId || "");
    return enrichSprintPayoutRecord(item, item.sprintId, mentorProfileMap.get(mentorId) || null);
  });

  res.status(200).json(enriched);
});

exports.markNetworkAdminSprintPayoutPaid = asyncHandler(async (req, res) => {
  const { enrollmentId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(enrollmentId)) throw new ApiError(400, "Invalid enrollment id");

  const enrollment = await MentorSprintEnrollment.findById(enrollmentId)
    .populate("mentorId", "name email role")
    .populate("studentId", "name email")
    .populate("sprintId", "title startDate endDate sessionMode price currency posterImageUrl");
  if (!enrollment) throw new ApiError(404, "Sprint enrollment not found");

  const mentorProfile = await MentorProfile.findOne({ userId: enrollment.mentorId?._id || enrollment.mentorId })
    .select("payoutUpiId payoutQrCodeUrl payoutPhoneNumber phoneNumber title company")
    .lean();

  const payoutDetails = {
    upiId: mentorProfile?.payoutUpiId || "",
    qrCodeUrl: mentorProfile?.payoutQrCodeUrl || "",
    phoneNumber: mentorProfile?.payoutPhoneNumber || mentorProfile?.phoneNumber || "",
    title: mentorProfile?.title || "",
    company: mentorProfile?.company || ""
  };

  if (String(enrollment.paymentStatus || "") !== "paid") {
    throw new ApiError(400, "Sprint enrollment payment is not verified");
  }

  if (!(enrollment.sprintId?.endDate && new Date(enrollment.sprintId.endDate).getTime() <= Date.now())) {
    throw new ApiError(400, "Sprint must end before payout");
  }

  if (!(payoutDetails.upiId || payoutDetails.qrCodeUrl || payoutDetails.phoneNumber)) {
    throw new ApiError(400, "Mentor payout setup is missing");
  }

  const payoutStatus = getResolvedSprintPayoutStatus(enrollment, enrollment.sprintId);
  if (!["pending", "issue_reported"].includes(payoutStatus)) {
    throw new ApiError(400, "Payout is not pending");
  }

  enrollment.payoutStatus = "paid";
  enrollment.mentorPayoutConfirmationStatus = "pending";
  enrollment.payoutPaidAt = new Date();
  enrollment.payoutPaidBy = req.user.id;
  enrollment.payoutReference = String(req.body?.reference || "").trim();
  enrollment.payoutNote = String(req.body?.note || "").trim();
  enrollment.mentorPayoutIssueNote = "";
  await enrollment.save();

  await Notification.create({
    title: "Sprint Payout Sent",
    message: "ORIN marked your sprint payout as sent. Please confirm after you receive it.",
    type: "booking",
    sentBy: req.user.id,
    targetRole: "mentor",
    recipient: enrollment.mentorId?._id || enrollment.mentorId
  });

  res.status(200).json({
    message: "Sprint payout marked as paid",
    enrollment: enrichSprintPayoutRecord(enrollment.toObject(), enrollment.sprintId, payoutDetails)
  });
});

exports.getNetworkAdminChallenges = asyncHandler(async (_req, res) => {
  const challenges = await CommunityChallenge.find({})
    .sort({ updatedAt: -1 })
    .limit(200)
    .lean();

  res.status(200).json(challenges);
});

exports.getNetworkAdminChallengeSubmissions = asyncHandler(async (req, res) => {
  const { challengeId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(challengeId)) throw new ApiError(400, "Invalid challenge id");

  const submissions = await CommunityChallengeSubmission.find({ challengeId })
    .populate("userId", "name email role")
    .sort({ createdAt: -1 })
    .lean();

  res.status(200).json(
    submissions.map((item) => ({
      _id: item._id,
      challengeId: item.challengeId,
      userId: item.userId,
      proofNote: item.proofNote || "",
      proofLinks: item.proofLinks || [],
      proofFiles: item.proofFiles || [],
      status: item.status,
      mentorReview: item.mentorReview || {},
      createdAt: item.createdAt,
      updatedAt: item.updatedAt
    }))
  );
});

exports.toggleNetworkAdminChallenge = asyncHandler(async (req, res) => {
  const { challengeId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(challengeId)) throw new ApiError(400, "Invalid challenge id");

  const challenge = await CommunityChallenge.findById(challengeId);
  if (!challenge) throw new ApiError(404, "Challenge not found");
  const nextActive = !challenge.isActive;
  challenge.isActive = nextActive;
  if (nextActive && challenge.approvalStatus !== "approved") {
    challenge.approvalStatus = "approved";
  }
  await challenge.save();

  res.status(200).json({ message: challenge.isActive ? "Challenge activated" : "Challenge disabled", challenge });
});

exports.createNetworkAdminChallenge = asyncHandler(async (req, res) => {
  const title = String(req.body?.title || "").trim();
  const domain = String(req.body?.domain || "").trim();
  const description = String(req.body?.description || "").trim();
  const deadline = new Date(req.body?.deadline);

  if (!title) throw new ApiError(400, "title is required");
  if (Number.isNaN(deadline.getTime())) throw new ApiError(400, "deadline is invalid");

  const doc = await CommunityChallenge.create({
    title,
    domain,
    description,
    bannerImageUrl: String(req.body?.bannerImageUrl || "").trim(),
    prize: String(req.body?.prize || "").trim(),
    skills: Array.isArray(req.body?.skills) ? req.body.skills.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 12) : [],
    tasks: Array.isArray(req.body?.tasks) ? req.body.tasks.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 12) : [],
    submissionType: String(req.body?.submissionType || "").trim(),
    deadline,
    isActive: true,
    isFeatured: Boolean(req.body?.isFeatured),
    createdBy: req.user.id,
    participants: [],
    topParticipants: []
  });

  res.status(201).json({ message: "Challenge created", challenge: doc });
});

exports.updateNetworkAdminChallenge = asyncHandler(async (req, res) => {
  const { challengeId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(challengeId)) throw new ApiError(400, "Invalid challenge id");

  const patch = {};
  if (req.body?.title !== undefined) patch.title = String(req.body.title || "").trim();
  if (req.body?.domain !== undefined) patch.domain = String(req.body.domain || "").trim();
  if (req.body?.description !== undefined) patch.description = String(req.body.description || "").trim();
  if (req.body?.bannerImageUrl !== undefined) patch.bannerImageUrl = String(req.body.bannerImageUrl || "").trim();
  if (req.body?.prize !== undefined) patch.prize = String(req.body.prize || "").trim();
  if (req.body?.submissionType !== undefined) patch.submissionType = String(req.body.submissionType || "").trim();
  if (req.body?.skills !== undefined) {
    patch.skills = Array.isArray(req.body.skills)
      ? req.body.skills.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 12)
      : [];
  }
  if (req.body?.tasks !== undefined) {
    patch.tasks = Array.isArray(req.body.tasks)
      ? req.body.tasks.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 12)
      : [];
  }
  if (req.body?.deadline !== undefined) {
    const deadline = new Date(req.body.deadline);
    if (Number.isNaN(deadline.getTime())) throw new ApiError(400, "deadline is invalid");
    patch.deadline = deadline;
  }
  if (req.body?.isFeatured !== undefined) patch.isFeatured = Boolean(req.body.isFeatured);

  const doc = await CommunityChallenge.findByIdAndUpdate(challengeId, patch, { new: true });
  if (!doc) throw new ApiError(404, "Challenge not found");

  res.status(200).json({ message: "Challenge updated", challenge: doc });
});

exports.deleteNetworkAdminChallenge = asyncHandler(async (req, res) => {
  const { challengeId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(challengeId)) throw new ApiError(400, "Invalid challenge id");

  const challenge = await CommunityChallenge.findByIdAndDelete(challengeId);
  if (!challenge) throw new ApiError(404, "Challenge not found");

  await CommunityChallengeSubmission.deleteMany({ challengeId });

  res.status(200).json({ message: "Challenge deleted", challengeId });
});

exports.getNetworkAdminOpportunities = asyncHandler(async (_req, res) => {
  const rows = await CareerOpportunity.find({})
    .populate("postedBy", "name email role")
    .sort({ createdAt: -1 })
    .limit(300)
    .lean();
  res.status(200).json(rows);
});

exports.toggleNetworkAdminOpportunity = asyncHandler(async (req, res) => {
  const { opportunityId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(opportunityId)) throw new ApiError(400, "Invalid opportunity id");
  const row = await CareerOpportunity.findById(opportunityId);
  if (!row) throw new ApiError(404, "Opportunity not found");
  row.isActive = !row.isActive;
  await row.save();
  res.status(200).json({ message: row.isActive ? "Opportunity activated" : "Opportunity disabled", opportunity: row });
});

exports.deleteNetworkAdminOpportunity = asyncHandler(async (req, res) => {
  const { opportunityId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(opportunityId)) throw new ApiError(400, "Invalid opportunity id");
  const row = await CareerOpportunity.findByIdAndDelete(opportunityId);
  if (!row) throw new ApiError(404, "Opportunity not found");
  res.status(200).json({ message: "Opportunity deleted", opportunityId });
});

exports.createNetworkAdminOpportunity = asyncHandler(async (req, res) => {
  const title = String(req.body?.title || "").trim();
  if (!title) throw new ApiError(400, "title is required");

  const doc = await CareerOpportunity.create({
    title,
    company: String(req.body?.company || "").trim(),
    type: String(req.body?.type || "internship").trim(),
    role: String(req.body?.role || "").trim(),
    duration: String(req.body?.duration || "").trim(),
    location: String(req.body?.location || "").trim(),
    mode: String(req.body?.mode || "").trim(),
    stipend: String(req.body?.stipend || "").trim(),
    applicationDeadline: req.body?.applicationDeadline ? new Date(req.body.applicationDeadline) : null,
    eligibility: String(req.body?.eligibility || "").trim(),
    logoUrl: String(req.body?.logoUrl || "").trim(),
    domainTags: Array.isArray(req.body?.domainTags) ? req.body.domainTags : [],
    applicationUrl: String(req.body?.applicationUrl || "").trim(),
    description: String(req.body?.description || "").trim(),
    isActive: true,
    postedBy: req.user.id
  });

  res.status(201).json({ message: "Opportunity created", opportunity: doc });
});

exports.getNetworkAdminKnowledgeResources = asyncHandler(async (req, res) => {
  const status = String(req.query?.status || "").trim();
  const query = {};
  if (status === "pending" || status === "approved" || status === "rejected") {
    query.approvalStatus = status;
  }

  const rows = await KnowledgeResource.find(query)
    .populate("submittedBy", "name email role")
    .populate("reviewedBy", "name email role")
    .sort({ updatedAt: -1 })
    .limit(500)
    .lean();

  res.status(200).json(rows);
});

exports.reviewNetworkAdminKnowledgeResource = asyncHandler(async (req, res) => {
  const { resourceId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(resourceId)) throw new ApiError(400, "Invalid resource id");

  const action = String(req.body?.action || "").trim();
  if (!["approve", "reject"].includes(action)) throw new ApiError(400, "action must be approve or reject");

  const doc = await KnowledgeResource.findById(resourceId);
  if (!doc) throw new ApiError(404, "Resource not found");

  doc.reviewedBy = req.user.id;
  doc.reviewedAt = new Date();

  if (action === "approve") {
    doc.approvalStatus = "approved";
    doc.isActive = true;
    doc.rejectionReason = "";
  } else {
    doc.approvalStatus = "rejected";
    doc.isActive = false;
    doc.rejectionReason = String(req.body?.reason || "").trim();
  }

  if (req.body?.isFeatured !== undefined) doc.isFeatured = Boolean(req.body.isFeatured);

  await doc.save();
  res.status(200).json({ message: "Resource reviewed", resource: doc });
});

exports.deleteNetworkAdminKnowledgeResource = asyncHandler(async (req, res) => {
  const { resourceId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(resourceId)) throw new ApiError(400, "Invalid resource id");

  const doc = await KnowledgeResource.findByIdAndDelete(resourceId);
  if (!doc) throw new ApiError(404, "Resource not found");

  res.status(200).json({ message: "Resource deleted", resourceId });
});

exports.createNetworkAdminKnowledgeResource = asyncHandler(async (req, res) => {
  const title = String(req.body?.title || "").trim();
  if (!title) throw new ApiError(400, "title is required");

  const doc = await KnowledgeResource.create({
    domain: String(req.body?.domain || "").trim(),
    type: String(req.body?.type || "other").trim(),
    title,
    description: String(req.body?.description || "").trim(),
    url: String(req.body?.url || "").trim(),
    format: String(req.body?.format || "").trim(),
    difficulty: String(req.body?.difficulty || "").trim(),
    estimatedMinutes: Number(req.body?.estimatedMinutes || 0),
    tags: Array.isArray(req.body?.tags) ? req.body.tags.map((tag) => String(tag || "").trim()).filter(Boolean).slice(0, 10) : [],
    thumbnailUrl: String(req.body?.thumbnailUrl || "").trim(),
    learningOutcome: String(req.body?.learningOutcome || "").trim(),
    approvalStatus: "approved",
    reviewedBy: req.user.id,
    reviewedAt: new Date(),
    isFeatured: Boolean(req.body?.isFeatured),
    isActive: true
  });

  res.status(201).json({ message: "Resource created", resource: doc });
});

exports.getNetworkAdminCertificationTracks = asyncHandler(async (_req, res) => {
  const rows = await CertificationTrack.find({}).sort({ updatedAt: -1 }).limit(300).lean();
  res.status(200).json(rows);
});

exports.getNetworkAdminCertificateTemplates = asyncHandler(async (_req, res) => {
  const rows = await CertificateTemplate.find({}).sort({ updatedAt: -1 }).limit(300).lean();
  res.status(200).json(rows);
});

exports.createNetworkAdminCertificateTemplate = asyncHandler(async (req, res) => {
  const title = String(req.body?.title || "").trim();
  const templateKey = String(req.body?.templateKey || title.toLowerCase().replace(/[^a-z0-9]+/g, "-")).trim();
  if (!title) throw new ApiError(400, "title is required");
  if (!templateKey) throw new ApiError(400, "templateKey is required");

  const doc = await CertificateTemplate.findOneAndUpdate(
    { templateKey },
    {
      $set: {
        title,
        templateKey,
        issuerType: String(req.body?.issuerType || "admin").trim(),
        description: String(req.body?.description || "").trim(),
        bodyText: String(req.body?.bodyText || "").trim(),
        xpReward: Number(req.body?.xpReward || 0),
        certificateType: String(req.body?.certificateType || "manual").trim(),
        bannerImageUrl: String(req.body?.bannerImageUrl || "").trim(),
        isActive: req.body?.isActive !== false,
        createdBy: req.user.id
      }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  res.status(201).json({ message: "Certificate template saved", template: doc });
});

exports.toggleNetworkAdminCertificationTrack = asyncHandler(async (req, res) => {
  const { trackId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(trackId)) throw new ApiError(400, "Invalid track id");
  const doc = await CertificationTrack.findById(trackId);
  if (!doc) throw new ApiError(404, "Track not found");
  doc.isActive = !doc.isActive;
  await doc.save();
  res.status(200).json({ message: doc.isActive ? "Track activated" : "Track disabled", track: doc });
});

exports.createNetworkAdminCertificationTrack = asyncHandler(async (req, res) => {
  const title = String(req.body?.title || "").trim();
  if (!title) throw new ApiError(400, "title is required");

  const doc = await CertificationTrack.create({
    title,
    level: String(req.body?.level || "Beginner").trim(),
    domain: String(req.body?.domain || "").trim(),
    description: String(req.body?.description || "").trim(),
    requirements: Array.isArray(req.body?.requirements) ? req.body.requirements : [],
    coverImageUrl: String(req.body?.coverImageUrl || "").trim(),
    badgeLabel: String(req.body?.badgeLabel || "").trim(),
    isActive: true,
    createdBy: req.user.id
  });

  res.status(201).json({ message: "Track created", track: doc });
});

exports.getNetworkAdminCertificationRequests = asyncHandler(async (req, res) => {
  const status = String(req.query?.status || "pending").trim();
  const query = {};
  if (status === "pending" || status === "approved" || status === "rejected") query.status = status;

  const rows = await CertificationRequest.find(query)
    .populate("userId", "name email role")
    .populate("trackId", "title level domain")
    .sort({ createdAt: -1 })
    .limit(400)
    .lean();

  res.status(200).json(rows);
});

exports.reviewNetworkAdminCertificationRequest = asyncHandler(async (req, res) => {
  const { requestId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(requestId)) throw new ApiError(400, "Invalid request id");

  const action = String(req.body?.action || "").trim();
  if (!["approve", "reject"].includes(action)) throw new ApiError(400, "action must be approve or reject");

  const doc = await CertificationRequest.findById(requestId).populate("trackId").populate("userId", "role");
  if (!doc) throw new ApiError(404, "Request not found");

  doc.reviewedBy = req.user.id;
  doc.reviewedAt = new Date();
  doc.note = String(req.body?.note || doc.note || "").trim();

  if (action === "approve") {
    doc.status = "approved";
    const track = doc.trackId;
    if (track && doc.userId?.role === "student") {
      await issueCertificate({
        userId: doc.userId._id,
        title: track.title,
        type: "course",
        issuedBy: "ORIN",
        source: "Certification Track",
        level: track.level || "Beginner",
        domain: track.domain || "",
        referenceType: "track",
        referenceId: String(track._id),
        requestId: doc._id,
        metadata: {
          domain: track.domain || "",
          level: track.level || "Beginner"
        },
        userName: "",
        status: "approved"
      });
    }
  } else {
    doc.status = "rejected";
  }

  await doc.save();
  res.status(200).json({ message: "Request reviewed", request: doc });
});

exports.issueNetworkAdminCertificate = asyncHandler(async (req, res) => {
  const userId = String(req.body?.userId || "").trim();
  const userEmail = String(req.body?.userEmail || "").trim().toLowerCase();
  const title = String(req.body?.title || "").trim();
  const domain = String(req.body?.domain || "").trim();
  const level = String(req.body?.level || "Beginner").trim();
  const source = String(req.body?.source || "Admin Verified").trim();
  const templateKey = String(req.body?.templateKey || "").trim();

  if (!userId && !userEmail) throw new ApiError(400, "userId or userEmail is required");
  let template = null;
  if (templateKey) {
    template = await CertificateTemplate.findOne({ templateKey, isActive: true }).lean();
    if (!template) throw new ApiError(404, "Certificate template not found");
  }
  const resolvedTitle = title || template?.title || "";
  if (!resolvedTitle) throw new ApiError(400, "title is required");

  const query = userId && mongoose.Types.ObjectId.isValid(userId) ? { _id: userId } : { email: userEmail };
  const user = await User.findOne(query).select("_id name email role").lean();
  if (!user) throw new ApiError(404, "User not found");

  const { certificate, created } = await issueCertificate({
    userId: user._id,
    userName: user.name || "",
    title: resolvedTitle,
    type: template?.certificateType || "manual",
    issuedBy: "ORIN Admin",
    source,
    level,
    domain,
    referenceType: "manual",
    referenceId: `${String(user._id)}:${resolvedTitle.toLowerCase()}`,
    metadata: {
      domain,
      level,
      score: Number(req.body?.xpReward || template?.xpReward || 0)
    },
    status: "approved"
  });

  res.status(created ? 201 : 200).json({
    message: created ? "Certificate issued" : "Certificate already exists",
    certificate
  });
});

exports.issueNetworkAdminCertificatesBulk = asyncHandler(async (req, res) => {
  const emails = Array.isArray(req.body?.emails)
    ? req.body.emails.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean)
    : String(req.body?.emailsCsv || "")
        .split(/[\n,;]+/)
        .map((item) => String(item || "").trim().toLowerCase())
        .filter(Boolean);
  const title = String(req.body?.title || "").trim();
  const domain = String(req.body?.domain || "").trim();
  const level = String(req.body?.level || "Beginner").trim();
  if (!emails.length) throw new ApiError(400, "emails are required");
  if (!title) throw new ApiError(400, "title is required");

  const users = await User.find({ email: { $in: emails } }).select("_id name email").lean();
  const byEmail = new Map(users.map((user) => [String(user.email || "").toLowerCase(), user]));
  const issued = [];
  const missing = [];

  for (const email of emails) {
    const user = byEmail.get(email);
    if (!user) {
      missing.push(email);
      continue;
    }
    const { certificate } = await issueCertificate({
      userId: user._id,
      userName: user.name || "",
      title,
      type: "manual",
      issuedBy: "ORIN Admin",
      source: String(req.body?.source || "Bulk Admin Verified").trim(),
      level,
      domain,
      referenceType: "manual",
      referenceId: `${String(user._id)}:${title.toLowerCase()}`,
      metadata: {
        domain,
        level,
        score: Number(req.body?.xpReward || 0)
      },
      status: "approved"
    });
    issued.push(certificate);
  }

  res.status(201).json({
    message: "Bulk certificate issue completed",
    issuedCount: issued.length,
    missing,
    certificates: issued
  });
});

exports.getNetworkAdminBootcamps = asyncHandler(async (_req, res) => {
  const rows = await Bootcamp.find({}).sort({ startsAt: 1, updatedAt: -1 }).limit(300).lean();
  res.status(200).json(rows);
});

exports.createNetworkAdminBootcamp = asyncHandler(async (req, res) => {
  const title = String(req.body?.title || "").trim();
  if (!title) throw new ApiError(400, "title is required");

  const startsAt = new Date(req.body?.startsAt);
  if (Number.isNaN(startsAt.getTime())) throw new ApiError(400, "startsAt is invalid");

  const doc = await Bootcamp.create({
    title,
    domain: String(req.body?.domain || "").trim(),
    description: String(req.body?.description || "").trim(),
    mode: String(req.body?.mode || "").trim(),
    coverImageUrl: String(req.body?.coverImageUrl || "").trim(),
    registrationUrl: String(req.body?.registrationUrl || "").trim(),
    startsAt,
    endsAt: req.body?.endsAt ? new Date(req.body.endsAt) : null,
    seats: Number(req.body?.seats || 0),
    isActive: true,
    isFeatured: Boolean(req.body?.isFeatured),
    createdBy: req.user.id
  });

  res.status(201).json({ message: "Bootcamp created", bootcamp: doc });
});

exports.toggleNetworkAdminBootcamp = asyncHandler(async (req, res) => {
  const { bootcampId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(bootcampId)) throw new ApiError(400, "Invalid bootcamp id");
  const doc = await Bootcamp.findById(bootcampId);
  if (!doc) throw new ApiError(404, "Bootcamp not found");
  doc.isActive = !doc.isActive;
  await doc.save();
  res.status(200).json({ message: doc.isActive ? "Bootcamp activated" : "Bootcamp disabled", bootcamp: doc });
});
