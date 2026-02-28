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
    phoneNumber: { type: String, default: "" },
    company: { type: String, default: "" },
    experienceYears: { type: Number, default: 0 },
    expertiseDomains: { type: [String], default: [] },
    primaryCategory: { type: String, default: "" },
    subCategory: { type: String, default: "" },
    specializations: { type: [String], default: [] },
    about: { type: String, default: "" },
    achievements: { type: [String], default: [] },
    linkedInUrl: { type: String, default: "" },
    sessionPrice: { type: Number, default: 0 },
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
