const nodemailer = require("nodemailer");
const { smtpHost, smtpPort, smtpSecure, smtpUser, smtpPass, emailFrom } = require("../config/env");

function canSendRealEmail() {
  return Boolean(smtpHost && smtpPort && smtpUser && smtpPass && emailFrom);
}

async function sendEmail({ to, subject, text, html }) {
  if (!canSendRealEmail()) {
    console.log("[EMAIL_FALLBACK]", { to, subject, text });
    return;
  }

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: Number(smtpPort),
    secure: smtpSecure,
    auth: {
      user: smtpUser,
      pass: smtpPass
    }
  });

  await transporter.sendMail({
    from: emailFrom,
    to,
    subject,
    text,
    html
  });
}

module.exports = {
  sendEmail
};
