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
      enum: ["pending", "approved", "completed", "cancelled", "rejected"],
      default: "pending",
      index: true
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
