const mongoose = require("mongoose");

const reputationScoreSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true
    },
    score: {
      type: Number,
      default: 0
    },
    levelTag: {
      type: String,
      default: "Starter"
    },
    breakdown: {
      projectUploads: { type: Number, default: 0 },
      skillEndorsements: { type: Number, default: 0 },
      dailyChallenges: { type: Number, default: 0 },
      mentorReviews: { type: Number, default: 0 },
      activityPosts: { type: Number, default: 0 }
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("ReputationScore", reputationScoreSchema);
