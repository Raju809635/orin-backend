const mongoose = require("mongoose");

const orinCertificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    title: { type: String, required: true, trim: true },
    level: { type: String, default: "Beginner", trim: true },
    domain: { type: String, default: "", trim: true },
    issuedAt: { type: Date, default: Date.now },
    source: { type: String, default: "ORIN" }
  },
  { timestamps: true }
);

orinCertificationSchema.index({ userId: 1, issuedAt: -1 });

module.exports = mongoose.model("OrinCertification", orinCertificationSchema);
