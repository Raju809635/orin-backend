const nodemailer = require("nodemailer");
const { smtpHost, smtpPort, smtpSecure, smtpUser, smtpPass, emailFrom } = require("../config/env");

function canSendRealEmail() {
  return Boolean(smtpHost && smtpPort && smtpUser && smtpPass && emailFrom);
}

let cachedTransporter = null;

function getTransporter() {
  if (!canSendRealEmail()) return null;

  if (!cachedTransporter) {
    cachedTransporter = nodemailer.createTransport({
      host: smtpHost,
      port: Number(smtpPort),
      secure: smtpSecure,
      auth: {
        user: smtpUser,
        pass: smtpPass
      }
    });
  }

  return cachedTransporter;
}

async function verifyEmailTransport() {
  if (!canSendRealEmail()) {
    return {
      ok: false,
      configured: false,
      message: "SMTP is not fully configured"
    };
  }

  try {
    const transporter = getTransporter();
    await transporter.verify();
    return {
      ok: true,
      configured: true,
      message: "SMTP is configured and ready"
    };
  } catch (error) {
    return {
      ok: false,
      configured: true,
      message: error?.response || error?.message || "SMTP verification failed"
    };
  }
}

async function sendEmail({ to, subject, text, html }) {
  if (!canSendRealEmail()) {
    console.log("[EMAIL_FALLBACK]", { to, subject, text });
    return;
  }

  const transporter = getTransporter();

  try {
    await transporter.sendMail({
      from: emailFrom,
      to,
      subject,
      text,
      html
    });
  } catch (error) {
    const reason = error?.response || error?.message || "Unknown email delivery error";
    throw new Error(`EMAIL_DELIVERY_FAILED: ${reason}`);
  }
}

module.exports = {
  canSendRealEmail,
  verifyEmailTransport,
  sendEmail
};
