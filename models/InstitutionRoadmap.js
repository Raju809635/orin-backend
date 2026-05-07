const mongoose = require("mongoose");

const institutionRoadmapWeekSchema = new mongoose.Schema(
  {
    id: { type: String, default: "" },
    title: { type: String, required: true, maxlength: 200 },
    description: { type: String, default: "", maxlength: 2000 },
    tasks: { type: [String], default: [] },
    resources: { type: [String], default: [] },
    quizTitle: { type: String, default: "" },
    challengeTitle: { type: String, default: "" },
    xpReward: { type: Number, default: 20 }
  },
  { _id: false }
);

const institutionRoadmapSchema = new mongoose.Schema(
  {
    mentorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    institutionName: {
      type: String,
      required: true,
      index: true
    },
    title: { type: String, required: true, maxlength: 200 },
    description: { type: String, default: "", maxlength: 3000 },
    domain: { type: String, default: "" },
    className: { type: String, default: "", maxlength: 120 },
    audienceStage: {
      type: String,
      enum: ["", "highschool", "after12"],
      default: "",
      index: true
    },
    status: {
      type: String,
      enum: ["draft", "published"],
      default: "published"
    },
    weeks: {
      type: [institutionRoadmapWeekSchema],
      default: []
    }
  },
  { timestamps: true }
);

institutionRoadmapSchema.index({ institutionName: 1, className: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model("InstitutionRoadmap", institutionRoadmapSchema);
