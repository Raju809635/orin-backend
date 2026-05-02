const mongoose = require("mongoose");

const mentorProfileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true
    },
    profilePhotoUrl: { type: String, default: "" },
    title: { type: String, default: "" },
    profileType: {
      type: String,
      enum: ["student", "graduate", "job_seeker"],
      default: "graduate"
    },
    phoneNumber: { type: String, default: "" },
    company: { type: String, default: "" },
    experienceYears: { type: Number, default: 0 },
    expertiseDomains: { type: [String], default: [] },
    primaryCategory: { type: String, default: "" },
    subCategory: { type: String, default: "" },
    specializations: { type: [String], default: [] },
    about: { type: String, default: "" },
    state: { type: String, default: "" },
    institutionName: { type: String, default: "" },
    institutionType: { type: String, default: "" },
    institutionDistrict: { type: String, default: "" },
    institutionSource: { type: String, default: "" },
    mentorOrgRole: {
      type: String,
      enum: ["global_mentor", "institution_teacher", "organisation_head"],
      default: "global_mentor"
    },
    assignedClasses: { type: [String], default: [] },
    institutionPermissions: { type: [String], default: [] },
    education: {
      type: [
        {
          school: { type: String, default: "" },
          degree: { type: String, default: "" },
          year: { type: String, default: "" }
        }
      ],
      default: []
    },
    achievements: {
      type: [
        {
          title: { type: String, default: "" },
          issuer: { type: String, default: "" },
          date: { type: String, default: "" },
          url: { type: String, default: "" }
        }
      ],
      default: []
    },
    projects: {
      type: [
        {
          title: { type: String, default: "" },
          tech: { type: [String], default: [] },
          link: { type: String, default: "" },
          description: { type: String, default: "" }
        }
      ],
      default: []
    },
    experiences: {
      type: [
        {
          organization: { type: String, default: "" },
          role: { type: String, default: "" },
          start: { type: String, default: "" },
          end: { type: String, default: "" },
          description: { type: String, default: "" }
        }
      ],
      default: []
    },
    linkedInUrl: { type: String, default: "" },
    resumeUrl: { type: String, default: "" },
    sessionPrice: { type: Number, default: 0 },
    payoutUpiId: { type: String, default: "" },
    payoutQrCodeUrl: { type: String, default: "" },
    payoutPhoneNumber: { type: String, default: "" },
    weeklyAvailabilitySlots: {
      type: [{ day: String, startTime: String, endTime: String }],
      default: []
    },
    blockedDates: { type: [String], default: [] },
    rating: { type: Number, default: 0 },
    totalSessionsConducted: { type: Number, default: 0 },
    avgResponseMinutes: { type: Number, default: 0 },
    testimonials: { type: [String], default: [] },
    verifiedBadge: { type: Boolean, default: false },
    rankingTier: { type: String, default: "Bronze" },
    profileCompleteness: { type: Number, default: 0 }
  },
  { timestamps: true }
);

module.exports = mongoose.model("MentorProfile", mentorProfileSchema);
