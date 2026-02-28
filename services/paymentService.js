const crypto = require("crypto");
const { razorpayKeyId, razorpayKeySecret } = require("../config/env");
const ApiError = require("../utils/ApiError");

function getRazorpayAuthHeader() {
  if (!razorpayKeyId || !razorpayKeySecret) {
    throw new ApiError(500, "Razorpay keys are not configured");
  }
  const token = Buffer.from(`${razorpayKeyId}:${razorpayKeySecret}`).toString("base64");
  return `Basic ${token}`;
}

async function createRazorpayOrder({ amount, currency = "INR", receipt, notes }) {
  const response = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: getRazorpayAuthHeader()
    },
    body: JSON.stringify({
      amount: Math.round(amount * 100),
      currency,
      receipt,
      notes: notes || {}
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const reason = data?.error?.description || data?.error?.message || "Failed to create Razorpay order";
    throw new ApiError(response.status || 500, reason);
  }

  return data;
}

function verifyRazorpaySignature({ orderId, paymentId, signature }) {
  if (!razorpayKeySecret) {
    throw new ApiError(500, "Razorpay secret is not configured");
  }
  const body = `${orderId}|${paymentId}`;
  const generated = crypto
    .createHmac("sha256", razorpayKeySecret)
    .update(body)
    .digest("hex");

  return generated === signature;
}

module.exports = {
  createRazorpayOrder,
  verifyRazorpaySignature,
  razorpayKeyId
};
