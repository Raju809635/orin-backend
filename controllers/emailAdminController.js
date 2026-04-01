const User = require("../models/User");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { canSendRealEmail, verifyEmailTransport, sendEmail } = require("../services/emailService");

exports.getEmailSystemStatus = asyncHandler(async (_req, res) => {
  const transportStatus = await verifyEmailTransport();

  res.status(200).json({
    configured: canSendRealEmail(),
    ...transportStatus
  });
});

exports.sendAdminTestEmail = asyncHandler(async (req, res) => {
  const adminUser = await User.findById(req.user.id).select("name email isDeleted").lean();

  if (!adminUser || adminUser.isDeleted) {
    throw new ApiError(404, "Admin user not found");
  }

  if (!canSendRealEmail()) {
    throw new ApiError(400, "SMTP is not fully configured on the server");
  }

  const transportStatus = await verifyEmailTransport();
  if (!transportStatus.ok) {
    throw new ApiError(400, `SMTP is configured but not working: ${transportStatus.message}`);
  }

  await sendEmail({
    to: adminUser.email,
    subject: "ORIN SMTP Test Email",
    text: `Hello ${adminUser.name || "Admin"}, this is a real SMTP test email from ORIN.`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111827;">
        <h2 style="margin-bottom: 8px;">ORIN SMTP Test</h2>
        <p>Hello ${adminUser.name || "Admin"},</p>
        <p>This is a real SMTP test email from ORIN.</p>
        <p>If you received this message, your Render SMTP configuration is working.</p>
      </div>
    `
  });

  res.status(200).json({
    message: `Test email sent successfully to ${adminUser.email}`
  });
});
