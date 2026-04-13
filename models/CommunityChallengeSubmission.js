const mongoose = require("mongoose");

const communityChallengeSubmissionSchema = new mongoose.Schema(
  {
    challengeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CommunityChallenge",
      required: true,
      index: true
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    proofNote: { type: String, default: "", trim: true },
    proofLinks: { type: [String], default: [] },
    proofFiles: { type: [String], default: [] },
    status: {
      type: String,
      enum: ["submitted", "reviewed", "accepted", "rejected"],
      default: "submitted",
      index: true
    },
    mentorReview: {
      rank: { type: Number, default: 0 },
      xpAwarded: { type: Number, default: 0 },
      notes: { type: String, default: "" },
      reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
      reviewedAt: { type: Date, default: null },
      certificateId: { type: mongoose.Schema.Types.ObjectId, ref: "OrinCertification", default: null }
    }
  },
  { timestamps: true }
);

communityChallengeSubmissionSchema.index({ challengeId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model("CommunityChallengeSubmission", communityChallengeSubmissionSchema);
