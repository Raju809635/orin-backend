const mongoose = require("mongoose");

const certificateTemplateSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    templateKey: { type: String, required: true, trim: true, unique: true, index: true },
    issuerType: {
      type: String,
      enum: ["admin", "mentor", "system"],
      default: "admin"
    },
    description: { type: String, default: "", trim: true },
    bodyText: { type: String, default: "", trim: true },
    xpReward: { type: Number, default: 0 },
    certificateType: {
      type: String,
      enum: ["course", "challenge", "mentorship", "internship", "achievement", "roadmap", "manual"],
      default: "manual"
    },
    bannerImageUrl: { type: String, default: "" },
    isActive: { type: Boolean, default: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }
  },
  { timestamps: true }
);

module.exports = mongoose.model("CertificateTemplate", certificateTemplateSchema);
