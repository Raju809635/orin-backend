const bcrypt = require("bcryptjs");
const RefreshToken = require("../models/RefreshToken");
const PasswordResetToken = require("../models/PasswordResetToken");
const StudentProfile = require("../models/StudentProfile");
const MentorProfile = require("../models/MentorProfile");
const User = require("../models/User");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { sendEmail } = require("../services/emailService");
const { createAuditLog } = require("../services/auditService");
const {
  hashToken,
  createAccessToken,
  createRefreshToken,
  verifyRefreshToken,
  buildPasswordResetToken
} = require("../utils/authTokenService");
const { passwordResetTokenTtlMinutes, passwordResetUrl } = require("../config/env");

async function persistRefreshToken({ user, refreshToken, req }) {
  const refreshTokenHash = hashToken(refreshToken);
  const expiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await RefreshToken.create({
    user: user._id,
    tokenHash: refreshTokenHash,
    expiresAt: expiry,
    userAgent: req.headers["user-agent"] || "",
    ipAddress: req.ip || ""
  });
}

function userPayload(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    approvalStatus: user.approvalStatus || "approved",
    status: user.approvalStatus || "approved",
    primaryCategory: user.primaryCategory || "",
    subCategory: user.subCategory || "",
    specializations: user.specializations || []
  };
}

exports.register = asyncHandler(async (req, res) => {
  const { name, email, password, role } = req.body;

  const existingUser = await User.findOne({ email, isDeleted: { $ne: true } });
  if (existingUser) {
    throw new ApiError(409, "User already exists");
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const normalizedRole = role || "student";

  const user = new User({
    name,
    email,
    password: hashedPassword,
    role: normalizedRole,
    approvalStatus: normalizedRole === "mentor" ? "pending" : "approved"
  });

  await user.save();

  if (normalizedRole === "student") {
    await StudentProfile.create({ userId: user._id });
  }

  if (normalizedRole === "mentor") {
    await MentorProfile.create({
      userId: user._id
    });
  }

  res.status(201).json({
    message: "User registered successfully"
  });

  await createAuditLog({
    req,
    actorId: user._id,
    action: "auth.register",
    entityType: "User",
    entityId: user._id,
    metadata: { role: user.role }
  });
});

exports.login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email, isDeleted: { $ne: true } }).select("+password");
  if (!user) {
    throw new ApiError(401, "Invalid credentials");
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    throw new ApiError(401, "Invalid credentials");
  }

  if (user.role === "mentor" && user.approvalStatus !== "approved") {
    throw new ApiError(403, "Mentor not approved yet");
  }

  const accessToken = createAccessToken(user);
  const refreshToken = createRefreshToken(user);
  await persistRefreshToken({ user, refreshToken, req });

  await createAuditLog({
    req,
    actorId: user._id,
    action: "auth.login",
    entityType: "User",
    entityId: user._id,
    metadata: { role: user.role }
  });

  res.status(200).json({
    token: accessToken,
    refreshToken,
    user: userPayload(user)
  });
});

exports.refresh = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;

  let decoded;
  try {
    decoded = verifyRefreshToken(refreshToken);
  } catch (error) {
    throw new ApiError(401, "Invalid refresh token");
  }

  const tokenHash = hashToken(refreshToken);
  const tokenDoc = await RefreshToken.findOne({
    tokenHash,
    revokedAt: null,
    expiresAt: { $gt: new Date() }
  });

  if (!tokenDoc) {
    throw new ApiError(401, "Refresh token expired or revoked");
  }

  const user = await User.findById(decoded.id);
  if (!user) {
    throw new ApiError(401, "User not found");
  }

  tokenDoc.revokedAt = new Date();
  await tokenDoc.save();

  const newAccessToken = createAccessToken(user);
  const newRefreshToken = createRefreshToken(user);
  await persistRefreshToken({ user, refreshToken: newRefreshToken, req });

  await createAuditLog({
    req,
    actorId: user._id,
    action: "auth.refresh",
    entityType: "User",
    entityId: user._id
  });

  res.status(200).json({
    token: newAccessToken,
    refreshToken: newRefreshToken
  });
});

exports.forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email });

  if (!user) {
    await createAuditLog({
      req,
      action: "auth.forgot_password.request",
      status: "failure",
      metadata: { reason: "user_not_found", email }
    });
    return res.status(200).json({
      message: "If the email exists, a reset link has been sent"
    });
  }

  await PasswordResetToken.deleteMany({ user: user._id });
  const tokenData = buildPasswordResetToken();
  const expiresAt = new Date(Date.now() + passwordResetTokenTtlMinutes * 60 * 1000);

  await PasswordResetToken.create({
    user: user._id,
    tokenHash: tokenData.hash,
    expiresAt
  });

  const resetLink = `${passwordResetUrl}?token=${tokenData.raw}`;

  await sendEmail({
    to: user.email,
    subject: "ORIN Password Reset",
    text: `Reset your password using this link: ${resetLink}. This link expires in ${passwordResetTokenTtlMinutes} minutes.`,
    html: `<p>Reset your password:</p><p><a href="${resetLink}">${resetLink}</a></p><p>This link expires in ${passwordResetTokenTtlMinutes} minutes.</p>`
  });

  res.status(200).json({
    message: "If the email exists, a reset link has been sent"
  });

  await createAuditLog({
    req,
    actorId: user._id,
    action: "auth.forgot_password.request",
    entityType: "User",
    entityId: user._id
  });
});

exports.resetPassword = asyncHandler(async (req, res) => {
  const { token, password } = req.body;
  const tokenHash = hashToken(token);

  const resetTokenDoc = await PasswordResetToken.findOne({
    tokenHash,
    usedAt: null,
    expiresAt: { $gt: new Date() }
  });

  if (!resetTokenDoc) {
    throw new ApiError(400, "Invalid or expired password reset token");
  }

  const user = await User.findById(resetTokenDoc.user).select("+password");
  if (!user) {
    throw new ApiError(404, "User not found");
  }

  user.password = await bcrypt.hash(password, 10);
  await user.save();

  resetTokenDoc.usedAt = new Date();
  await resetTokenDoc.save();
  await RefreshToken.updateMany({ user: user._id, revokedAt: null }, { $set: { revokedAt: new Date() } });

  await createAuditLog({
    req,
    actorId: user._id,
    action: "auth.password_reset",
    entityType: "User",
    entityId: user._id
  });

  res.status(200).json({
    message: "Password reset successful"
  });
});

exports.changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  const user = await User.findById(req.user.id).select("+password");
  if (!user) {
    throw new ApiError(404, "User not found");
  }

  const valid = await bcrypt.compare(currentPassword, user.password);
  if (!valid) {
    throw new ApiError(400, "Current password is incorrect");
  }

  user.password = await bcrypt.hash(newPassword, 10);
  await user.save();
  await RefreshToken.updateMany({ user: user._id, revokedAt: null }, { $set: { revokedAt: new Date() } });

  await createAuditLog({
    req,
    actorId: user._id,
    action: "auth.password_change",
    entityType: "User",
    entityId: user._id
  });

  res.status(200).json({
    message: "Password changed successfully. Please login again."
  });
});
