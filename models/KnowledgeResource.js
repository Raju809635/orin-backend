const mongoose = require("mongoose");

const knowledgeResourceSchema = new mongoose.Schema(
  {
    domain: { type: String, default: "", trim: true, index: true },
    scope: {
      type: String,
      enum: ["global", "institution", "class"],
      default: "global",
      index: true
    },
    institutionName: { type: String, default: "", trim: true, index: true },
    className: { type: String, default: "", trim: true, index: true },
    type: {
      type: String,
      enum: ["interview_questions", "roadmap", "coding_resource", "career_guide", "other"],
      default: "other"
    },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    url: { type: String, default: "" },
    bannerImageUrl: { type: String, default: "" },
    documentUrl: { type: String, default: "" },
    format: { type: String, default: "", trim: true },
    difficulty: { type: String, default: "", trim: true },
    estimatedMinutes: { type: Number, default: 0 },
    tags: { type: [String], default: [] },
    thumbnailUrl: { type: String, default: "" },
    learningOutcome: { type: String, default: "" },
    contributorRole: {
      type: String,
      enum: ["student", "mentor", "admin", ""],
      default: ""
    },
    submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    approvalStatus: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "approved",
      index: true
    },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    reviewedAt: { type: Date, default: null },
    rejectionReason: { type: String, default: "" },
    isFeatured: { type: Boolean, default: false, index: true },
    isActive: { type: Boolean, default: true, index: true }
  },
  { timestamps: true }
);

knowledgeResourceSchema.index({ isActive: 1, institutionName: 1, domain: 1, updatedAt: -1 });

module.exports = mongoose.model("KnowledgeResource", knowledgeResourceSchema);
