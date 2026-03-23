const mongoose = require("mongoose");

const orinCertificationSchema = new mongoose.Schema(
  {
    certificateId: {
      type: String,
      default: "",
      trim: true,
      unique: true,
      sparse: true,
      index: true
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    userName: { type: String, default: "", trim: true },
    title: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: ["course", "challenge", "mentorship", "internship", "achievement", "roadmap", "manual"],
      default: "manual",
      index: true
    },
    level: { type: String, default: "Beginner", trim: true },
    domain: { type: String, default: "", trim: true },
    issuedBy: { type: String, default: "ORIN", trim: true },
    issuedAt: { type: Date, default: Date.now },
    source: { type: String, default: "ORIN" },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "approved",
      index: true
    },
    qrCodeUrl: { type: String, default: "" },
    verificationUrl: { type: String, default: "" },
    certificateUrl: { type: String, default: "" },
    referenceType: {
      type: String,
      enum: ["challenge", "roadmap", "mentorship", "internship", "achievement", "track", ""],
      default: "",
      index: true
    },
    referenceId: { type: String, default: "", trim: true, index: true },
    requestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CertificationRequest",
      default: null
    },
    metadata: {
      domain: { type: String, default: "" },
      level: { type: String, default: "" },
      score: { type: Number, default: 0 },
      goal: { type: String, default: "" },
      totalSteps: { type: Number, default: 0 },
      completedSteps: { type: Number, default: 0 },
      challengeTitle: { type: String, default: "" }
    }
  },
  { timestamps: true }
);

orinCertificationSchema.index({ userId: 1, issuedAt: -1 });
orinCertificationSchema.index({ userId: 1, type: 1, referenceType: 1, referenceId: 1 });

module.exports = mongoose.model("OrinCertification", orinCertificationSchema);
