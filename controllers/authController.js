const bcrypt = require("bcryptjs");
const crypto = require("crypto");
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
const { passwordResetTokenTtlMinutes, passwordResetUrl, emailOtpTtlMinutes } = require("../config/env");

function buildDeletedEmailValue({ userId, email }) {
  const timestamp = Date.now();
  const localPart = String(email || "deleted").split("@")[0].replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 24) || "deleted";
  return `deleted+${localPart}.${userId}.${timestamp}@orin.local`;
}

async function releaseDeletedEmailIfNeeded(email) {
  const deletedUser = await User.findOne({ email, isDeleted: true }).select("_id email deletedEmail");
  if (!deletedUser) return;

  await User.updateOne(
    { _id: deletedUser._id, email, isDeleted: true },
    {
      $set: {
        deletedEmail: deletedUser.deletedEmail || deletedUser.email,
        email: buildDeletedEmailValue({ userId: deletedUser._id, email })
      }
    }
  );
}

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
    phoneNumber: user.phoneNumber || "",
    role: user.role,
    isAdmin: Boolean(user.isAdmin),
    approvalStatus: user.approvalStatus || "approved",
    status: user.approvalStatus || "approved",
    primaryCategory: user.primaryCategory || "",
    subCategory: user.subCategory || "",
    specializations: user.specializations || []
  };
}

async function authUserPayload(user) {
  const payload = userPayload(user);
  if (user.role === "student") {
    const profile = await StudentProfile.findOne({ userId: user._id })
      .select("learnerStage className institutionName collegeName institutionType")
      .lean();

    return {
      ...payload,
      learnerStage: profile?.learnerStage === "highschool" ? "highschool" : "after12",
      className: profile?.className || "",
      institutionName: profile?.institutionName || profile?.collegeName || "",
      institutionType: profile?.institutionType || ""
    };
  }

  if (user.role !== "mentor") {
    return payload;
  }

  const profile = await MentorProfile.findOne({ userId: user._id })
    .select("mentorOrgRole")
    .lean();

  return {
    ...payload,
    mentorOrgRole: profile?.mentorOrgRole || "global_mentor"
  };
}

function buildEmailOtpToken() {
  const raw = `${Math.floor(100000 + Math.random() * 900000)}`;
  const hash = crypto.createHash("sha256").update(raw).digest("hex");
  const expiresAt = new Date(Date.now() + emailOtpTtlMinutes * 60 * 1000);
  return { raw, hash, expiresAt };
}

async function sendVerificationOtpEmail(user, otp) {
  await sendEmail({
    to: user.email,
    subject: "ORIN Email Verification OTP",
    text: `Your ORIN verification OTP is ${otp}. It expires in ${emailOtpTtlMinutes} minutes.`,
    html: `<p>Your ORIN verification OTP is: <strong>${otp}</strong></p><p>This OTP expires in ${emailOtpTtlMinutes} minutes.</p>`
  });
}

exports.register = asyncHandler(async (req, res) => {
  const {
    name,
    email,
    password,
    role,
    learnerStage,
    studentYear,
    phoneNumber,
    mentorOrgRole,
    institutionName,
    institutionType,
    institutionDistrict,
    institutionSource,
    assignedClasses
  } = req.body;
  const normalizedRole = role || "student";
  const normalizedMentorOrgRole = ["institution_teacher", "organisation_head"].includes(mentorOrgRole)
    ? mentorOrgRole
    : "global_mentor";
  const normalizedAssignedClasses = Array.isArray(assignedClasses)
    ? assignedClasses.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 30)
    : [];

  const existingUser = await User.findOne({ email, isDeleted: { $ne: true } });
  if (existingUser) {
    throw new ApiError(409, "User already exists");
  }

  await releaseDeletedEmailIfNeeded(email);

  const hashedPassword = await bcrypt.hash(password, 10);

  const user = new User({
    name,
    email,
    phoneNumber: phoneNumber || "",
    password: hashedPassword,
    role: normalizedRole,
    approvalStatus: normalizedRole === "mentor" ? "pending" : "approved",
    isEmailVerified: true,
    emailVerifiedAt: new Date(),
    emailVerificationOtpHash: "",
    emailVerificationOtpExpiresAt: null,
    emailVerificationOtpSentAt: null,
    emailVerificationOtpAttempts: 0
  });

  try {
    await user.save();
  } catch (error) {
    if (error?.code === 11000 && error?.keyPattern?.email) {
      throw new ApiError(409, "An account with this email already exists");
    }
    throw error;
  }

  if (normalizedRole === "student") {
    const normalizedLearnerStage =
      String(learnerStage || "").trim().toLowerCase() === "highschool" ? "highschool" : "after12";
    const normalizedInstitutionName = String(institutionName || "").trim();
    const normalizedInstitutionType = String(institutionType || "").trim();
    const normalizedInstitutionDistrict = String(institutionDistrict || "").trim();
    const normalizedInstitutionSource = String(institutionSource || "").trim();
    const normalizedStudentYear = String(studentYear || "").trim().slice(0, 40);
    await StudentProfile.create({
      userId: user._id,
      learnerStage: normalizedLearnerStage,
      institutionName: normalizedInstitutionName,
      collegeName: normalizedInstitutionName,
      institutionType: normalizedInstitutionType,
      institutionDistrict: normalizedInstitutionDistrict,
      institutionSource: normalizedInstitutionSource,
      className: normalizedLearnerStage === "after12" ? normalizedStudentYear : ""
    });
  }

  if (normalizedRole === "mentor") {
    const permissions =
      normalizedMentorOrgRole === "organisation_head"
        ? ["manage_teachers", "manage_students", "assign_work", "view_analytics", "issue_certificates"]
        : normalizedMentorOrgRole === "institution_teacher"
          ? ["manage_assigned_classes", "review_submissions", "award_xp", "recommend_certificates"]
          : [];

    await MentorProfile.create({
      userId: user._id,
      phoneNumber: phoneNumber || "",
      mentorOrgRole: normalizedMentorOrgRole,
      institutionName: String(institutionName || "").trim(),
      collegeName: String(institutionName || "").trim(),
      institutionType: String(institutionType || "").trim(),
      institutionDistrict: String(institutionDistrict || "").trim(),
      institutionSource: String(institutionSource || "").trim(),
      assignedClasses: normalizedAssignedClasses,
      institutionPermissions: permissions
    });
  }

  res.status(201).json({
    message: "User registered successfully. Please login.",
    requiresEmailVerification: false,
    email: user.email,
    role: user.role
  });

  await createAuditLog({
    req,
    actorId: user._id,
    action: "auth.register",
    entityType: "User",
    entityId: user._id,
    metadata: {
      role: user.role,
      mentorOrgRole: normalizedRole === "mentor" ? normalizedMentorOrgRole : undefined
    }
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

  // Backward compatibility: if legacy accounts are stuck unverified, do not block login.
  if (!user.isEmailVerified) {
    user.isEmailVerified = true;
    user.emailVerifiedAt = new Date();
    user.emailVerificationOtpHash = "";
    user.emailVerificationOtpExpiresAt = null;
    user.emailVerificationOtpSentAt = null;
    user.emailVerificationOtpAttempts = 0;
    await user.save();
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
    user: await authUserPayload(user)
  });
});

exports.verifyEmailOtp = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email, isDeleted: { $ne: true } });

  if (!user) {
    return res.status(200).json({
      message: "Email verification is not required. Please login."
    });
  }

  user.isEmailVerified = true;
  user.emailVerifiedAt = new Date();
  user.emailVerificationOtpHash = "";
  user.emailVerificationOtpExpiresAt = null;
  user.emailVerificationOtpSentAt = null;
  user.emailVerificationOtpAttempts = 0;
  await user.save();

  await createAuditLog({
    req,
    actorId: user._id,
    action: "auth.email_verify",
    entityType: "User",
    entityId: user._id
  });

  res.status(200).json({
    message: "Email verification is not required. Please login.",
    role: user.role
  });
});

exports.resendEmailOtp = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email, isDeleted: { $ne: true } });

  if (user && !user.isEmailVerified) {
    user.isEmailVerified = true;
    user.emailVerifiedAt = new Date();
    user.emailVerificationOtpHash = "";
    user.emailVerificationOtpExpiresAt = null;
    user.emailVerificationOtpSentAt = null;
    user.emailVerificationOtpAttempts = 0;
    await user.save();
  }

  res.status(200).json({
    message: "Email verification is not required. Please login."
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
    refreshToken: newRefreshToken,
    user: await authUserPayload(user)
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

  if (currentPassword === newPassword) {
    throw new ApiError(400, "New password must be different from your current password");
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
