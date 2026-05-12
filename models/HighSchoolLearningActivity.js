const mongoose = require("mongoose");

const highSchoolLearningActivitySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    source: {
      type: String,
      enum: ["subject_gap", "study_assistant", "study_roadmap", "exam_strategy", "study_planner"],
      required: true,
      index: true
    },
    board: { type: String, default: "", index: true },
    classLevel: { type: String, default: "", index: true },
    subject: { type: String, default: "", index: true },
    topics: [{ type: String }],
    weakTopics: [{ type: String }],
    strongTopics: [{ type: String }],
    wrongAnswerTopics: [{ type: String }],
    doubts: [{ type: String }],
    selectedTopics: [{ type: String }],
    pendingTopics: [{ type: String }],
    completedTopics: [{ type: String }],
    score: { type: Number, default: null },
    details: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

highSchoolLearningActivitySchema.index({ userId: 1, board: 1, classLevel: 1, subject: 1, createdAt: -1 });

module.exports = mongoose.model("HighSchoolLearningActivity", highSchoolLearningActivitySchema);
