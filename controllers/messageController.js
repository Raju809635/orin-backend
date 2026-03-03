const Notification = require("../models/Notification");
const User = require("../models/User");
const mongoose = require("mongoose");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");

exports.getMyMessages = asyncHandler(async (req, res) => {
  const messages = await Notification.find({
    type: "direct",
    $or: [{ sentBy: req.user.id }, { recipient: req.user.id }]
  })
    .populate("sentBy", "name email role")
    .populate("recipient", "name email role")
    .sort({ createdAt: -1 })
    .lean();

  res.status(200).json(messages);
});

exports.sendMessageToAdmin = asyncHandler(async (req, res) => {
  const { title, message } = req.body;
  const adminUser = await User.findOne({
    $or: [{ role: "admin" }, { isAdmin: true }],
    isDeleted: { $ne: true }
  })
    .select("_id role isAdmin")
    .lean();

  if (!adminUser) {
    throw new ApiError(404, "Admin account not found");
  }

  const targetRole = adminUser.role === "admin" ? "admin" : "mentor";

  const notification = await Notification.create({
    title,
    message,
    type: "direct",
    sentBy: req.user.id,
    targetRole,
    recipient: adminUser._id
  });

  res.status(201).json({
    message: "Message sent to admin",
    notification
  });
});

exports.getMyNotifications = asyncHandler(async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 200);

  const notifications = await Notification.find({
    $or: [
      { recipient: req.user.id },
      {
        recipient: { $exists: false },
        targetRole: { $in: [req.user.role, "all"] }
      },
      {
        recipient: null,
        targetRole: { $in: [req.user.role, "all"] }
      }
    ]
  })
    .populate("sentBy", "name email role")
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  res.status(200).json(notifications);
});

exports.markNotificationRead = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(400, "Invalid notification id");
  }

  const notification = await Notification.findOneAndUpdate(
    { _id: id, recipient: req.user.id },
    { readByRecipient: true },
    { new: true }
  );

  if (!notification) {
    throw new ApiError(404, "Notification not found for this user");
  }

  res.status(200).json({
    message: "Notification marked as read",
    notification
  });
});
