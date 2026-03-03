const express = require("express");
const router = express.Router();
const {
  register,
  login,
  verifyEmailOtp,
  resendEmailOtp,
  refresh,
  forgotPassword,
  resetPassword,
  changePassword
} = require("../controllers/authController");
const validate = require("../middleware/validate");
const { verifyToken } = require("../middleware/authMiddleware");
const {
  registerSchema,
  loginSchema,
  verifyEmailOtpSchema,
  resendEmailOtpSchema,
  refreshTokenSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema
} = require("../validators/authValidator");

router.post("/register", validate(registerSchema), register);
router.post("/login", validate(loginSchema), login);
router.post("/verify-email-otp", validate(verifyEmailOtpSchema), verifyEmailOtp);
router.post("/resend-email-otp", validate(resendEmailOtpSchema), resendEmailOtp);
router.post("/refresh", validate(refreshTokenSchema), refresh);
router.post("/forgot-password", validate(forgotPasswordSchema), forgotPassword);
router.post("/reset-password", validate(resetPasswordSchema), resetPassword);
router.post("/change-password", verifyToken, validate(changePasswordSchema), changePassword);

module.exports = router;
