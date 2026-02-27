const mongoose = require("mongoose");

const availabilitySchema = new mongoose.Schema(
  {
    mentorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    day: {
      type: String,
      enum: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
      default: null
    },
    startTime: {
      type: String,
      default: null
    },
    endTime: {
      type: String,
      default: null
    },
    sessionDurationMinutes: {
      type: Number,
      default: 60
    },
    blockedDate: {
      type: String,
      default: null
    },
    isBlockedDate: {
      type: Boolean,
      default: false
    }
  },
  { timestamps: true }
);

availabilitySchema.index({ mentorId: 1, day: 1, startTime: 1, endTime: 1 });
availabilitySchema.index({ mentorId: 1, blockedDate: 1, isBlockedDate: 1 });

module.exports = mongoose.model("Availability", availabilitySchema);
