const User = require("../models/User");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { createAuditLog } = require("../services/auditService");

exports.getPreferences = asyncHandler(async (req, res) => {
  const user = await User.findOne({ _id: req.user.id, isDeleted: false }).select(
    "notificationPreferences privacySettings role name email"
  );

  if (!user) throw new ApiError(404, "User not found");

  res.status(200).json({
    notificationPreferences: user.notificationPreferences,
    privacySettings: user.privacySettings
  });
});

exports.updatePreferences = asyncHandler(async (req, res) => {
  const payload = {};
  if (req.body.notificationPreferences) payload.notificationPreferences = req.body.notificationPreferences;
  if (req.body.privacySettings) payload.privacySettings = req.body.privacySettings;

  const user = await User.findOneAndUpdate(
    { _id: req.user.id, isDeleted: false },
    { $set: payload },
    { new: true, runValidators: true }
  ).select("notificationPreferences privacySettings");

  if (!user) throw new ApiError(404, "User not found");

  res.status(200).json({
    message: "Preferences updated",
    notificationPreferences: user.notificationPreferences,
    privacySettings: user.privacySettings
  });

  await createAuditLog({
    req,
    actorId: req.user.id,
    action: "settings.preferences.update",
    entityType: "User",
    entityId: req.user.id
  });
});
