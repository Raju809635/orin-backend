const mongoose = require("mongoose");

// Admin-defined certification catalog entries ("available certifications").
// Issued certifications to users are stored separately in OrinCertification.
const certificationTrackSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    level: { type: String, default: "Beginner", trim: true },
    domain: { type: String, default: "", trim: true, index: true },
    description: { type: String, default: "" },
    requirements: { type: [String], default: [] },
    coverImageUrl: { type: String, default: "" },
    badgeLabel: { type: String, default: "" },
    isActive: { type: Boolean, default: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }
  },
  { timestamps: true }
);

certificationTrackSchema.index({ isActive: 1, updatedAt: -1 });

module.exports = mongoose.model("CertificationTrack", certificationTrackSchema);
