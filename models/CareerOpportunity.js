const mongoose = require("mongoose");

const careerOpportunitySchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    company: { type: String, default: "", trim: true },
    type: {
      type: String,
      enum: ["workshop", "internship", "hackathon", "competition", "research", "job", "other"],
      default: "internship"
    },
    category: { type: String, default: "", trim: true },
    role: { type: String, default: "", trim: true },
    duration: { type: String, default: "", trim: true },
    location: { type: String, default: "", trim: true },
    mode: { type: String, default: "", trim: true },
    stipend: { type: String, default: "", trim: true },
    applicationDeadline: { type: Date, default: null },
    eventDate: { type: Date, default: null },
    eligibility: { type: String, default: "" },
    logoUrl: { type: String, default: "" },
    bannerImageUrl: { type: String, default: "" },
    domainTags: { type: [String], default: [] },
    applicationUrl: { type: String, default: "" },
    supportingDocuments: { type: [String], default: [] },
    audienceStage: { type: String, enum: ["", "highschool", "after12"], default: "", index: true },
    scope: { type: String, enum: ["global", "institution", "class", ""], default: "global", index: true },
    institutionName: { type: String, default: "", trim: true, index: true },
    className: { type: String, default: "", trim: true, index: true },
    isPaid: { type: Boolean, default: false },
    description: { type: String, default: "" },
    isActive: { type: Boolean, default: true },
    postedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    }
  },
  { timestamps: true }
);

careerOpportunitySchema.index({ isActive: 1, createdAt: -1 });
careerOpportunitySchema.index({ domainTags: 1 });

module.exports = mongoose.model("CareerOpportunity", careerOpportunitySchema);
