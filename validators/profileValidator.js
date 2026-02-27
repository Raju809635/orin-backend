const Joi = require("joi");

const studentProfileUpdateSchema = Joi.object({
  profilePhotoUrl: Joi.string().allow("").optional(),
  headline: Joi.string().max(120).allow("").optional(),
  about: Joi.string().max(1000).allow("").optional(),
  education: Joi.array()
    .items(
      Joi.object({
        school: Joi.string().allow(""),
        degree: Joi.string().allow(""),
        year: Joi.string().allow("")
      })
    )
    .optional(),
  skills: Joi.array().items(Joi.string()).optional(),
  projects: Joi.array()
    .items(
      Joi.object({
        name: Joi.string().allow(""),
        summary: Joi.string().allow(""),
        link: Joi.string().allow("")
      })
    )
    .optional(),
  certifications: Joi.array().items(Joi.string()).optional(),
  careerGoals: Joi.string().max(500).allow("").optional(),
  educationLevel: Joi.string().allow("").optional(),
  targetExam: Joi.string().allow("").optional(),
  interestedCategories: Joi.array().items(Joi.string()).optional(),
  preferredLanguage: Joi.string().allow("").optional(),
  goals: Joi.string().max(500).allow("").optional(),
  availabilityStatus: Joi.string().valid("available", "busy", "offline").optional(),
  resumeUrl: Joi.string().allow("").optional()
});

const mentorProfileUpdateSchema = Joi.object({
  profilePhotoUrl: Joi.string().allow("").optional(),
  title: Joi.string().max(120).allow("").optional(),
  company: Joi.string().max(120).allow("").optional(),
  experienceYears: Joi.number().min(0).max(80).optional(),
  expertiseDomains: Joi.array().items(Joi.string()).optional(),
  about: Joi.string().max(1200).allow("").optional(),
  achievements: Joi.array().items(Joi.string()).optional(),
  linkedInUrl: Joi.string().allow("").optional(),
  primaryCategory: Joi.string().allow("").optional(),
  subCategory: Joi.string().allow("").optional(),
  sessionPrice: Joi.number().min(0).optional(),
  weeklyAvailabilitySlots: Joi.array()
    .items(
      Joi.object({
        day: Joi.string().allow(""),
        startTime: Joi.string().allow(""),
        endTime: Joi.string().allow("")
      })
    )
    .optional(),
  blockedDates: Joi.array().items(Joi.string()).optional(),
  testimonials: Joi.array().items(Joi.string()).optional(),
  rankingTier: Joi.string().allow("").optional()
});

module.exports = {
  studentProfileUpdateSchema,
  mentorProfileUpdateSchema
};
