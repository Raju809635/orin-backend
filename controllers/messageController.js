const Notification = require("../models/Notification");
const DevicePushToken = require("../models/DevicePushToken");
const User = require("../models/User");
const mongoose = require("mongoose");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { isExpoPushToken } = require("../services/pushNotificationService");

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

exports.registerPushToken = asyncHandler(async (req, res) => {
  const { expoPushToken, platform, deviceId, appVersion } = req.body;
  if (!isExpoPushToken(expoPushToken)) {
    throw new ApiError(400, "Invalid Expo push token");
  }

  const token = await DevicePushToken.findOneAndUpdate(
    { userId: req.user.id, expoPushToken },
    {
      $set: {
        platform: platform || "unknown",
        deviceId: deviceId || "",
        appVersion: appVersion || "",
        enabled: true,
        lastSeenAt: new Date(),
        disabledAt: null,
        lastError: ""
      }
    },
    { upsert: true, new: true, runValidators: true }
  ).select("_id platform enabled lastSeenAt");

  res.status(200).json({
    message: "Push token registered",
    token
  });
});

exports.unregisterPushToken = asyncHandler(async (req, res) => {
  const { expoPushToken } = req.body;
  if (!isExpoPushToken(expoPushToken)) {
    throw new ApiError(400, "Invalid Expo push token");
  }

  await DevicePushToken.updateMany(
    { userId: req.user.id, expoPushToken },
    { $set: { enabled: false, disabledAt: new Date() } }
  );

  res.status(200).json({ message: "Push token unregistered" });
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

exports.sendTestPushNotification = asyncHandler(async (req, res) => {
  const notification = await Notification.create({
    title: "ORIN notifications are on",
    message: "This is a test mobile notification from ORIN.",
    type: "system",
    sentBy: req.user.id,
    targetRole: req.user.role || "all",
    recipient: req.user.id
  });

  res.status(201).json({
    message: "Test notification queued",
    notification
  });
});
