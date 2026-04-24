const mongoose = require("mongoose");

const communityChallengeSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    domain: { type: String, default: "", trim: true },
    scope: {
      type: String,
      enum: ["global", "institution", "class"],
      default: "global",
      index: true
    },
    institutionName: { type: String, default: "", trim: true, index: true },
    className: { type: String, default: "", trim: true, index: true },
    description: { type: String, default: "" },
    bannerImageUrl: { type: String, default: "" },
    prize: { type: String, default: "" },
    participantLimit: { type: Number, default: 0 },
    skills: { type: [String], default: [] },
    tasks: { type: [String], default: [] },
    submissionType: { type: String, default: "", trim: true },
    proofInstructions: { type: String, default: "" },
    approvalStatus: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "approved",
      index: true
    },
    deadline: { type: Date, required: true, index: true },
    isActive: { type: Boolean, default: true, index: true },
    isFeatured: { type: Boolean, default: false, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    participants: { type: [mongoose.Schema.Types.ObjectId], ref: "User", default: [] },
    topParticipants: {
      type: [
        {
          userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
          score: { type: Number, default: 0 }
        }
      ],
      default: []
    }
  },
  { timestamps: true }
);

communityChallengeSchema.index({ isActive: 1, deadline: 1 });

module.exports = mongoose.model("CommunityChallenge", communityChallengeSchema);
