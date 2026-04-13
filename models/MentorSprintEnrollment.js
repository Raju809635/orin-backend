const mongoose = require("mongoose");

const mentorSprintEnrollmentSchema = new mongoose.Schema(
  {
    sprintId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MentorSprint",
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
    platformFeePercent: { type: Number, default: 40, min: 0, max: 100 },
    mentorSharePercent: { type: Number, default: 60, min: 0, max: 100 },
    platformFeeAmount: { type: Number, default: 0, min: 0 },
    mentorPayoutAmount: { type: Number, default: 0, min: 0 },
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
    enrollmentStatus: {
      type: String,
      enum: ["pending_payment", "enrolled", "cancelled"],
      default: "pending_payment",
      index: true
    },
    orderId: { type: String, default: "" },
    paymentId: { type: String, default: "" },
    paymentSignature: { type: String, default: "" },
    paymentDueAt: { type: Date, default: null, index: true },
    cancelledAt: { type: Date, default: null },
    payoutStatus: {
      type: String,
      enum: ["not_ready", "pending", "paid", "issue_reported"],
      default: "not_ready",
      index: true
    },
    mentorPayoutConfirmationStatus: {
      type: String,
      enum: ["not_ready", "pending", "confirmed", "issue_reported"],
      default: "not_ready",
      index: true
    },
    payoutPaidAt: {
      type: Date,
      default: null
    },
    payoutPaidBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },
    payoutReference: {
      type: String,
      default: ""
    },
    payoutNote: {
      type: String,
      default: ""
    },
    mentorPayoutConfirmedAt: {
      type: Date,
      default: null
    },
    mentorPayoutIssueNote: {
      type: String,
      default: ""
    }
  },
  { timestamps: true }
);

mentorSprintEnrollmentSchema.index({ sprintId: 1, studentId: 1, createdAt: -1 });

module.exports = mongoose.model("MentorSprintEnrollment", mentorSprintEnrollmentSchema);
