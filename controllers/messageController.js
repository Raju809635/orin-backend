const Notification = require("../models/Notification");
const User = require("../models/User");
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
    role: "admin",
    status: "approved",
    isDeleted: false
  })
    .select("_id role")
    .lean();

  if (!adminUser) {
    throw new ApiError(404, "Admin account not found");
  }

  const notification = await Notification.create({
    title,
    message,
    type: "direct",
    sentBy: req.user.id,
    targetRole: "admin",
    recipient: adminUser._id
  });

  res.status(201).json({
    message: "Message sent to admin",
    notification
  });
});
