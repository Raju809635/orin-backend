const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    mentor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    scheduledAt: {
      type: Date,
      required: true
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending"
    },
    notes: {
      type: String,
      maxlength: 600
    }
  },
  { timestamps: true }
);

bookingSchema.index({ mentor: 1, scheduledAt: 1 });
bookingSchema.index({ student: 1, createdAt: -1 });

module.exports = mongoose.model("Booking", bookingSchema);
