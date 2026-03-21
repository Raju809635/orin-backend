const mongoose = require("mongoose");
const User = require("../models/User");
const Booking = require("../models/Booking");
const Session = require("../models/Session");
const Notification = require("../models/Notification");
const AuditLog = require("../models/AuditLog");
const MentorProfile = require("../models/MentorProfile");
const CollaborateApplication = require("../models/CollaborateApplication");
const FeedPost = require("../models/FeedPost");
const Connection = require("../models/Connection");
const UserFollow = require("../models/UserFollow");
const MentorGroup = require("../models/MentorGroup");
const MentorLiveSession = require("../models/MentorLiveSession");
const CommunityChallenge = require("../models/CommunityChallenge");
const CareerOpportunity = require("../models/CareerOpportunity");
const KnowledgeResource = require("../models/KnowledgeResource");
const CertificationTrack = require("../models/CertificationTrack");
const CertificationRequest = require("../models/CertificationRequest");
const OrinCertification = require("../models/OrinCertification");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");

exports.getPendingMentors = asyncHandler(async (req, res) => {
  const mentors = await User.find({
    role: "mentor",
    approvalStatus: "pending"
  })
    .select("name email role approvalStatus primaryCategory subCategory specializations createdAt")
    .lean();

  res.status(200).json(mentors);
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
  const [roleCounts, mentorCategoryCounts, bookingStatusCounts] = await Promise.all([
    User.aggregate([{ $group: { _id: "$role", count: { $sum: 1 } } }]),
    User.aggregate([
      { $match: { role: "mentor", approvalStatus: "approved" } },
      { $group: { _id: "$primaryCategory", count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]),
    Booking.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }])
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
    }))
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
        weeklyAvailabilitySlots: "$weeklyAvailabilitySlots",
        rating: "$rating",
        totalSessionsConducted: "$totalSessionsConducted"
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
  const [posts, publicPosts, privatePosts, pendingConnections, acceptedConnections, totalFollows, activeGroups, activeChallenges, upcomingLives] =
    await Promise.all([
      FeedPost.countDocuments(),
      FeedPost.countDocuments({ visibility: "public" }),
      FeedPost.countDocuments({ visibility: "private" }),
      Connection.countDocuments({ status: "pending" }),
      Connection.countDocuments({ status: "accepted" }),
      UserFollow.countDocuments(),
      MentorGroup.countDocuments({ isActive: true }),
      CommunityChallenge.countDocuments({ isActive: true }),
      MentorLiveSession.countDocuments({ isCancelled: false, startsAt: { $gte: now } })
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
      upcomingLiveSessions: upcomingLives
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
    .sort({ startsAt: -1 })
    .limit(200)
    .lean();

  res.status(200).json(sessions);
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

exports.getNetworkAdminChallenges = asyncHandler(async (_req, res) => {
  const challenges = await CommunityChallenge.find({})
    .sort({ updatedAt: -1 })
    .limit(200)
    .lean();

  res.status(200).json(challenges);
});

exports.toggleNetworkAdminChallenge = asyncHandler(async (req, res) => {
  const { challengeId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(challengeId)) throw new ApiError(400, "Invalid challenge id");

  const challenge = await CommunityChallenge.findById(challengeId);
  if (!challenge) throw new ApiError(404, "Challenge not found");
  challenge.isActive = !challenge.isActive;
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

exports.createNetworkAdminKnowledgeResource = asyncHandler(async (req, res) => {
  const title = String(req.body?.title || "").trim();
  if (!title) throw new ApiError(400, "title is required");

  const doc = await KnowledgeResource.create({
    domain: String(req.body?.domain || "").trim(),
    type: String(req.body?.type || "other").trim(),
    title,
    description: String(req.body?.description || "").trim(),
    url: String(req.body?.url || "").trim(),
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
      await OrinCertification.create({
        userId: doc.userId._id,
        title: track.title,
        level: track.level || "Beginner",
        domain: track.domain || "",
        issuedAt: new Date(),
        source: "ORIN"
      });
    }
  } else {
    doc.status = "rejected";
  }

  await doc.save();
  res.status(200).json({ message: "Request reviewed", request: doc });
});
