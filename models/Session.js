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
    platformFeePercent: {
      type: Number,
      default: 30
    },
    mentorSharePercent: {
      type: Number,
      default: 70
    },
    platformFeeAmount: {
      type: Number,
      min: 0,
      default: 0
    },
    mentorPayoutAmount: {
      type: Number,
      min: 0,
      default: 0
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
    },
    sessionStatus: {
      type: String,
      enum: ["booked", "confirmed", "completed"],
      default: "booked",
      index: true
    },
    meetingProvider: {
      type: String,
      enum: ["manual", "jitsi"],
      default: "manual"
    },
    meetingLink: {
      type: String,
      default: ""
    },
    meetingMeta: {
      roomName: {
        type: String,
        default: ""
      },
      createdAt: {
        type: Date,
        default: null
      },
      createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null
      }
    },
    notes: {
      type: String,
      default: ""
    },
    studentNotes: {
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
