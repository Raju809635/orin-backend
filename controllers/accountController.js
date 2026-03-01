const RefreshToken = require("../models/RefreshToken");
const User = require("../models/User");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { createAuditLog } = require("../services/auditService");

exports.softDeleteMe = asyncHandler(async (req, res) => {
  const user = await User.findOneAndUpdate(
    { _id: req.user.id, isDeleted: false },
    {
      $set: {
        isDeleted: true,
        deletedAt: new Date()
      }
    },
    { new: true }
  ).select("_id email");

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
    message: "Account deleted successfully"
  });
});
