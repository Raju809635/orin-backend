const mongoose = require("mongoose");

const leaderboardSnapshotSchema = new mongoose.Schema(
  {
    dateKey: {
      type: String,
      required: true,
      index: true
    },
    scope: {
      type: String,
      enum: ["global", "college"],
      default: "global",
      index: true
    },
    collegeName: {
      type: String,
      default: ""
    },
    entries: {
      type: [
        {
          userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
          score: { type: Number, default: 0 },
          rank: { type: Number, default: 0 }
        }
      ],
      default: []
    }
  },
  { timestamps: true }
);

leaderboardSnapshotSchema.index({ dateKey: 1, scope: 1, collegeName: 1 }, { unique: true });

module.exports = mongoose.model("LeaderboardSnapshot", leaderboardSnapshotSchema);
