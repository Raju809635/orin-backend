const mongoose = require("mongoose");

const sessionSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    mentorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    date: {
      type: String,
      required: true
    },
    time: {
      type: String,
      required: true
    },
    durationMinutes: {
      type: Number,
      default: 60
    },
    scheduledStart: {
      type: Date,
      required: true,
      index: true
    },
    status: {
      type: String,
      enum: ["pending", "payment_pending", "confirmed", "approved", "completed", "cancelled", "rejected"],
      default: "pending",
      index: true
    },
    amount: {
      type: Number,
      min: 1,
      default: 499
    },
    currency: {
      type: String,
      default: "INR"
    },
    orderId: {
      type: String,
      default: "",
      index: true
    },
    paymentId: {
      type: String,
      default: ""
    },
    paymentSignature: {
      type: String,
      default: ""
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "waiting_verification", "verified", "rejected", "paid"],
      default: "pending",
      index: true
    },
    paymentMode: {
      type: String,
      enum: ["manual", "razorpay"],
      default: "razorpay",
      index: true
    },
    paymentScreenshot: {
      type: String,
      default: ""
    },
    transactionReference: {
      type: String,
      default: ""
    },
    paymentRejectReason: {
      type: String,
      default: ""
    },
    verifiedByAdmin: {
      type: Boolean,
      default: false
    },
    verifiedAt: {
      type: Date,
      default: null
    },
    paymentDueAt: {
      type: Date,
      default: null,
      index: true
    },
    sessionStatus: {
      type: String,
      enum: ["booked", "confirmed", "completed"],
      default: "booked",
      index: true
    },
    meetingLink: {
      type: String,
      default: ""
    },
    notes: {
      type: String,
      default: ""
    },
    feedback: {
      type: String,
      default: ""
    }
  },
  { timestamps: true }
);

sessionSchema.index({ mentorId: 1, scheduledStart: 1, status: 1 });
sessionSchema.index({ studentId: 1, scheduledStart: -1 });

module.exports = mongoose.model("Session", sessionSchema);
