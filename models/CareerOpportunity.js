const mongoose = require("mongoose");

const careerOpportunitySchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    company: { type: String, default: "", trim: true },
    type: {
      type: String,
      enum: ["internship", "hackathon", "competition", "research", "job", "other"],
      default: "internship"
    },
    role: { type: String, default: "", trim: true },
    duration: { type: String, default: "", trim: true },
    location: { type: String, default: "", trim: true },
    domainTags: { type: [String], default: [] },
    applicationUrl: { type: String, default: "" },
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
