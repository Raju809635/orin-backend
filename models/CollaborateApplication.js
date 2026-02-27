const mongoose = require("mongoose");

const collaborateApplicationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    organization: { type: String, default: "", trim: true },
    type: {
      type: String,
      enum: ["leader", "founder", "mentor"],
      required: true
    },
    message: { type: String, default: "", trim: true }
  },
  { timestamps: true }
);

module.exports = mongoose.model("CollaborateApplication", collaborateApplicationSchema);

