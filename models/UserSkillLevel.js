const mongoose = require("mongoose");

const userSkillLevelSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    domain: {
      type: String,
      required: true,
      trim: true
    },
    skillName: {
      type: String,
      required: true,
      trim: true
    },
    skillScore: {
      type: Number,
      default: 50,
      min: 0,
      max: 100
    },
    level: {
      type: String,
      enum: ["Easy", "Medium", "Hard"],
      default: "Medium"
    },
    lastUpdated: {
      type: Date,
      default: Date.now
    }
  },
  { timestamps: true }
);

userSkillLevelSchema.index({ userId: 1, domain: 1, skillName: 1 }, { unique: true });

module.exports = mongoose.model("UserSkillLevel", userSkillLevelSchema);
