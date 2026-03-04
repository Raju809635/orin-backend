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
const { env, passwordResetTokenTtlMinutes, passwordResetUrl, emailOtpTtlMinutes } = require("../config/env");

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
  const { name, email, password, role, phoneNumber } = req.body;
  const normalizedRole = role || "student";
  const hashedPassword = await bcrypt.hash(password, 10);
  const otp = buildEmailOtpToken();

  const existingUser = await User.findOne({ email, isDeleted: { $ne: true } });
  if (existingUser) {
    if (!existingUser.isEmailVerified) {
      existingUser.name = name;
      existingUser.password = hashedPassword;
      existingUser.role = normalizedRole;
      existingUser.phoneNumber = phoneNumber || "";
      existingUser.approvalStatus = normalizedRole === "mentor" ? "pending" : "approved";
      existingUser.emailVerificationOtpHash = otp.hash;
      existingUser.emailVerificationOtpExpiresAt = otp.expiresAt;
      existingUser.emailVerificationOtpSentAt = new Date();
      existingUser.emailVerificationOtpAttempts = 0;
      await existingUser.save();

      if (normalizedRole === "student") {
        await StudentProfile.updateOne(
          { userId: existingUser._id },
          { $setOnInsert: { userId: existingUser._id } },
          { upsert: true }
        );
      }

      if (normalizedRole === "mentor") {
        await MentorProfile.updateOne(
          { userId: existingUser._id },
          {
            $set: { phoneNumber: phoneNumber || "" },
            $setOnInsert: { userId: existingUser._id }
          },
          { upsert: true }
        );
      }

      let otpDispatched = true;
      let otpDispatchError = "";
      try {
        await sendVerificationOtpEmail(existingUser, otp.raw);
      } catch (error) {
        otpDispatched = false;
        otpDispatchError = error?.message || "OTP delivery failed";
        console.error("[AUTH] OTP send failed for unverified existing user:", otpDispatchError);
      }

      return res.status(200).json({
        message: otpDispatched
          ? "Account already existed but was unverified. OTP has been resent."
          : "Account exists and is unverified, but OTP email could not be sent. Please check SMTP setup and use Resend OTP.",
        requiresEmailVerification: true,
        email: existingUser.email,
        role: existingUser.role,
        otpDispatched,
        otpDispatchError: otpDispatched ? "" : otpDispatchError,
        otpExpiresAt: otp.expiresAt,
        ...(env !== "production" && !otpDispatched ? { debugOtp: otp.raw } : {})
      });
    }

    throw new ApiError(409, "User already exists");
  }

  const user = new User({
    name,
    email,
    phoneNumber: phoneNumber || "",
    password: hashedPassword,
    role: normalizedRole,
    approvalStatus: normalizedRole === "mentor" ? "pending" : "approved",
    isEmailVerified: false,
    emailVerifiedAt: null,
    emailVerificationOtpHash: otp.hash,
    emailVerificationOtpExpiresAt: otp.expiresAt,
    emailVerificationOtpSentAt: new Date(),
    emailVerificationOtpAttempts: 0
  });

  await user.save();

  if (normalizedRole === "student") {
    await StudentProfile.create({ userId: user._id });
  }

  if (normalizedRole === "mentor") {
    await MentorProfile.create({
      userId: user._id,
      phoneNumber: phoneNumber || ""
    });
  }

  let otpDispatched = true;
  let otpDispatchError = "";
  try {
    await sendVerificationOtpEmail(user, otp.raw);
  } catch (error) {
    otpDispatched = false;
    otpDispatchError = error?.message || "OTP delivery failed";
    console.error("[AUTH] OTP send failed during register:", otpDispatchError);
  }

  res.status(201).json({
    message: otpDispatched
      ? "User registered. Verify your email with OTP."
      : "User registered, but OTP email could not be sent. Fix SMTP config and tap Resend OTP.",
    requiresEmailVerification: true,
    email: user.email,
    role: user.role,
    otpDispatched,
    otpDispatchError: otpDispatched ? "" : otpDispatchError,
    otpExpiresAt: otp.expiresAt,
    ...(env !== "production" && !otpDispatched ? { debugOtp: otp.raw } : {})
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

  if (user.isEmailVerified === false) {
    throw new ApiError(403, "Email not verified. Please verify OTP sent to your email.");
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

exports.verifyEmailOtp = asyncHandler(async (req, res) => {
  const { email, otp } = req.body;
  const user = await User.findOne({ email, isDeleted: { $ne: true } });

  if (!user) {
    throw new ApiError(400, "Invalid verification request");
  }

  if (user.isEmailVerified) {
    return res.status(200).json({
      message: "Email already verified",
      role: user.role
    });
  }

  if (!user.emailVerificationOtpHash || !user.emailVerificationOtpExpiresAt) {
    throw new ApiError(400, "OTP not generated. Please request a new OTP.");
  }

  if (new Date(user.emailVerificationOtpExpiresAt).getTime() < Date.now()) {
    throw new ApiError(400, "OTP expired. Please request a new OTP.");
  }

  if ((user.emailVerificationOtpAttempts || 0) >= 5) {
    throw new ApiError(429, "Too many invalid attempts. Please request a new OTP.");
  }

  const incomingHash = hashToken(otp);
  if (incomingHash !== user.emailVerificationOtpHash) {
    user.emailVerificationOtpAttempts = (user.emailVerificationOtpAttempts || 0) + 1;
    await user.save();
    throw new ApiError(400, "Invalid OTP");
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
    message: "Email verified successfully",
    role: user.role
  });
});

exports.resendEmailOtp = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email, isDeleted: { $ne: true } });

  if (!user) {
    return res.status(200).json({
      message: "If this account exists, a verification OTP has been sent."
    });
  }

  if (user.isEmailVerified) {
    return res.status(200).json({
      message: "Email already verified"
    });
  }

  const lastSent = user.emailVerificationOtpSentAt ? new Date(user.emailVerificationOtpSentAt).getTime() : 0;
  if (Date.now() - lastSent < 60 * 1000) {
    throw new ApiError(429, "Please wait 60 seconds before requesting another OTP.");
  }

  const otp = buildEmailOtpToken();
  user.emailVerificationOtpHash = otp.hash;
  user.emailVerificationOtpExpiresAt = otp.expiresAt;
  user.emailVerificationOtpSentAt = new Date();
  user.emailVerificationOtpAttempts = 0;
  await user.save();

  try {
    await sendVerificationOtpEmail(user, otp.raw);
  } catch (error) {
    const reason = error?.message || "OTP delivery failed";
    throw new ApiError(502, `OTP sending failed. ${reason}`);
  }

  res.status(200).json({
    message: "Verification OTP sent",
    otpExpiresAt: otp.expiresAt
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
