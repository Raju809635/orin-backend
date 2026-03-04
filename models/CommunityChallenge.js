const mongoose = require("mongoose");

const communityChallengeSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    domain: { type: String, default: "", trim: true },
    description: { type: String, default: "" },
    deadline: { type: Date, required: true, index: true },
    isActive: { type: Boolean, default: true, index: true },
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
