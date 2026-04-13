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
    profileType: {
      type: String,
      enum: ["student", "graduate", "job_seeker"],
      default: "student"
    },
    about: { type: String, default: "" },
    state: { type: String, default: "" },
    institutionName: { type: String, default: "" },
    institutionType: { type: String, default: "" },
    institutionDistrict: { type: String, default: "" },
    institutionSource: { type: String, default: "" },
    education: {
      type: [{ school: String, degree: String, year: String }],
      default: []
    },
    collegeName: { type: String, default: "" },
    skills: { type: [String], default: [] },
    projects: {
      type: [
        {
          title: { type: String, default: "" },
          name: String,
          description: { type: String, default: "" },
          summary: String,
          link: String,
          tech: { type: [String], default: [] },
          techStack: { type: [String], default: [] },
          demoVideoUrl: { type: String, default: "" },
          screenshots: { type: [String], default: [] }
        }
      ],
      default: []
    },
    achievements: {
      type: [
        {
          title: String,
          type: String,
          issuer: String,
          date: String,
          description: String,
          url: String
        }
      ],
      default: []
    },
    experiences: {
      type: [
        {
          organization: String,
          role: String,
          start: { type: String, default: "" },
          startDate: String,
          end: { type: String, default: "" },
          endDate: String,
          description: String
        }
      ],
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
