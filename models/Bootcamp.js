const mongoose = require("mongoose");

const bootcampSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    domain: { type: String, default: "", trim: true, index: true },
    description: { type: String, default: "" },
    mode: { type: String, default: "", trim: true },
    coverImageUrl: { type: String, default: "" },
    registrationUrl: { type: String, default: "" },
    startsAt: { type: Date, required: true, index: true },
    endsAt: { type: Date, default: null },
    seats: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true, index: true },
    isFeatured: { type: Boolean, default: false, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }
  },
  { timestamps: true }
);

bootcampSchema.index({ isActive: 1, startsAt: 1 });

module.exports = mongoose.model("Bootcamp", bootcampSchema);
