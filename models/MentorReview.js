const mongoose = require("mongoose");

const mentorReviewSchema = new mongoose.Schema(
  {
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Session",
      required: true,
      unique: true
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
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5
    },
    reviewText: {
      type: String,
      default: "",
      maxlength: 1200
    }
  },
  { timestamps: true }
);

mentorReviewSchema.index({ mentorId: 1, createdAt: -1 });

module.exports = mongoose.model("MentorReview", mentorReviewSchema);
