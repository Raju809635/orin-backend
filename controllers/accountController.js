const RefreshToken = require("../models/RefreshToken");
const User = require("../models/User");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { createAuditLog } = require("../services/auditService");

function buildDeletedEmailValue({ userId, email }) {
  const timestamp = Date.now();
  const localPart = String(email || "deleted").split("@")[0].replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 24) || "deleted";
  return `deleted+${localPart}.${userId}.${timestamp}@orin.local`;
}

exports.softDeleteMe = asyncHandler(async (req, res) => {
  const existingUser = await User.findOne({ _id: req.user.id, isDeleted: false }).select("_id email");

  if (!existingUser) throw new ApiError(404, "User not found");

  const deletedAt = new Date();
  const releasedEmail = buildDeletedEmailValue({ userId: existingUser._id, email: existingUser.email });

  const user = await User.findByIdAndUpdate(
    existingUser._id,
    {
      $set: {
        isDeleted: true,
        deletedAt,
        deletedEmail: existingUser.email,
        email: releasedEmail
      }
    },
    { new: true }
  ).select("_id email deletedEmail");

  if (!user) throw new ApiError(404, "User not found");

  await RefreshToken.updateMany(
    { user: user._id, revokedAt: null },
    { $set: { revokedAt: new Date() } }
  );

  await createAuditLog({
    req,
    actorId: user._id,
    action: "account.soft_delete",
    entityType: "User",
    entityId: user._id
  });

  res.status(200).json({
    message: "Account deleted successfully. You can register again later with the same email."
  });
});
