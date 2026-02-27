const mongoose = require("mongoose");
const User = require("../models/User");
const Booking = require("../models/Booking");
const Notification = require("../models/Notification");
const AuditLog = require("../models/AuditLog");
const CollaborateApplication = require("../models/CollaborateApplication");
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
  ).select("name email role approvalStatus primaryCategory subCategory");

  if (!mentor) {
    throw new ApiError(404, "Mentor not found");
  }

  res.status(200).json({
    message: "Mentor approved successfully",
    mentor
  });
});

exports.getApprovedMentors = asyncHandler(async (req, res) => {
  const mentors = await User.find({
    role: "mentor",
    approvalStatus: "approved"
  })
    .select("name email role approvalStatus primaryCategory subCategory specializations")
    .sort({ updatedAt: -1 })
    .lean();

  res.status(200).json(mentors);
});

exports.getStudents = asyncHandler(async (req, res) => {
  const students = await User.find({ role: "student" })
    .select("name email role educationLevel targetExam interestedCategories goals preferredLanguage createdAt updatedAt")
    .sort({ createdAt: -1 })
    .lean();

  res.status(200).json(students);
});

exports.getDemographics = asyncHandler(async (req, res) => {
  const [roleCounts, mentorCategoryCounts, studentInterestCounts, bookingStatusCounts] = await Promise.all([
    User.aggregate([{ $group: { _id: "$role", count: { $sum: 1 } } }]),
    User.aggregate([
      { $match: { role: "mentor", approvalStatus: "approved" } },
      { $group: { _id: "$primaryCategory", count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]),
    User.aggregate([
      { $match: { role: "student" } },
      { $unwind: { path: "$interestedCategories", preserveNullAndEmptyArrays: false } },
      { $group: { _id: "$interestedCategories", count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]),
    Booking.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }])
  ]);

  const [pendingMentors, approvedMentors, totalUsers, totalBookings] = await Promise.all([
    User.countDocuments({ role: "mentor", approvalStatus: "pending" }),
    User.countDocuments({ role: "mentor", approvalStatus: "approved" }),
    User.countDocuments(),
    Booking.countDocuments()
  ]);

  const roleSummary = {
    students: 0,
    mentors: 0
  };

  roleCounts.forEach((row) => {
    if (row._id === "student") roleSummary.students = row.count;
    if (row._id === "mentor") roleSummary.mentors = row.count;
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
      pendingMentors,
      approvedMentors
    },
    roles: roleSummary,
    bookings: bookingSummary,
    mentorCategories: mentorCategoryCounts.map((row) => ({
      category: row._id || "Unspecified",
      count: row.count
    })),
    studentInterests: studentInterestCounts.map((row) => ({
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

exports.getCollaborateApplications = asyncHandler(async (req, res) => {
  const applications = await CollaborateApplication.find()
    .sort({ createdAt: -1 })
    .limit(200)
    .lean();

  res.status(200).json(applications);
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
