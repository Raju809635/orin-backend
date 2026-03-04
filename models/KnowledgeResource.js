const mongoose = require("mongoose");

const knowledgeResourceSchema = new mongoose.Schema(
  {
    domain: { type: String, default: "", trim: true, index: true },
    type: {
      type: String,
      enum: ["interview_questions", "roadmap", "coding_resource", "career_guide", "other"],
      default: "other"
    },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    url: { type: String, default: "" },
    isActive: { type: Boolean, default: true, index: true }
  },
  { timestamps: true }
);

knowledgeResourceSchema.index({ isActive: 1, domain: 1, updatedAt: -1 });

module.exports = mongoose.model("KnowledgeResource", knowledgeResourceSchema);
