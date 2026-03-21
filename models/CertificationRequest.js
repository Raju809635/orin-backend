const mongoose = require("mongoose");

const certificationRequestSchema = new mongoose.Schema(
  {
    trackId: { type: mongoose.Schema.Types.ObjectId, ref: "CertificationTrack", required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true
    },
    note: { type: String, default: "" },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    reviewedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

certificationRequestSchema.index({ status: 1, createdAt: -1 });
certificationRequestSchema.index({ userId: 1, createdAt: -1 });
certificationRequestSchema.index({ trackId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model("CertificationRequest", certificationRequestSchema);

