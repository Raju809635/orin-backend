const mongoose = require("mongoose");

const studentProfileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true
    },
    profilePhotoUrl: { type: String, default: "" },
    headline: { type: String, default: "" },
    about: { type: String, default: "" },
    education: {
      type: [{ school: String, degree: String, year: String }],
      default: []
    },
    skills: { type: [String], default: [] },
    projects: {
      type: [{ name: String, summary: String, link: String }],
      default: []
    },
    certifications: { type: [String], default: [] },
    careerGoals: { type: String, default: "" },
    growthScore: { type: Number, default: 0 },
    assignedMentorId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    availabilityStatus: {
      type: String,
      enum: ["available", "busy", "offline"],
      default: "available"
    },
    resumeUrl: { type: String, default: "" },
    profileCompleteness: { type: Number, default: 0 }
  },
  { timestamps: true }
);

module.exports = mongoose.model("StudentProfile", studentProfileSchema);
