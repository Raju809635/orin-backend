const mongoose = require("mongoose");

const mentorLiveSessionBookingSchema = new mongoose.Schema(
  {
    liveSessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MentorLiveSession",
      required: true,
      index: true
    },
    mentorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    amount: { type: Number, default: 0, min: 0 },
    currency: { type: String, default: "INR", trim: true },
    paymentMode: {
      type: String,
      enum: ["free", "razorpay"],
      default: "free"
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed", "cancelled"],
      default: "pending",
      index: true
    },
    bookingStatus: {
      type: String,
      enum: ["pending_payment", "booked", "cancelled"],
      default: "pending_payment",
      index: true
    },
    orderId: { type: String, default: "" },
    paymentId: { type: String, default: "" },
    paymentSignature: { type: String, default: "" },
    paymentDueAt: { type: Date, default: null, index: true },
    cancelledAt: { type: Date, default: null }
  },
  { timestamps: true }
);

mentorLiveSessionBookingSchema.index({ liveSessionId: 1, studentId: 1, createdAt: -1 });

module.exports = mongoose.model("MentorLiveSessionBooking", mentorLiveSessionBookingSchema);
