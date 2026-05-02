const Joi = require("joi");

const studentProfileUpdateSchema = Joi.object({
  profilePhotoUrl: Joi.string().allow("").optional(),
  headline: Joi.string().max(120).allow("").optional(),
  profileType: Joi.string().valid("student", "graduate", "job_seeker").optional(),
  about: Joi.string().max(1000).allow("").optional(),
  state: Joi.string().max(120).allow("").optional(),
  institutionName: Joi.string().max(220).allow("").optional(),
  institutionType: Joi.string().max(120).allow("").optional(),
  institutionDistrict: Joi.string().max(120).allow("").optional(),
  institutionSource: Joi.string().max(120).allow("").optional(),
  className: Joi.string().max(80).allow("").optional(),
  learnerStage: Joi.string().valid("kid", "highschool", "after12").optional(),
  education: Joi.array()
    .items(
      Joi.object({
        school: Joi.string().allow(""),
        degree: Joi.string().allow(""),
        year: Joi.string().allow("")
      })
    )
    .optional(),
  collegeName: Joi.string().max(160).allow("").optional(),
  skills: Joi.array().items(Joi.string()).optional(),
  projects: Joi.array()
    .items(
      Joi.object({
        title: Joi.string().allow("").optional(),
        name: Joi.string().allow(""),
        description: Joi.string().allow("").optional(),
        summary: Joi.string().allow(""),
        link: Joi.string().allow(""),
        tech: Joi.array().items(Joi.string()).optional(),
        techStack: Joi.array().items(Joi.string()).optional(),
        demoVideoUrl: Joi.string().allow("").optional(),
        screenshots: Joi.array().items(Joi.string()).optional()
      })
    )
    .optional(),
  achievements: Joi.array()
    .items(
      Joi.object({
        title: Joi.string().allow(""),
        type: Joi.string().allow(""),
        issuer: Joi.string().allow(""),
        date: Joi.string().allow(""),
        description: Joi.string().allow(""),
        url: Joi.string().allow("")
      })
    )
    .optional(),
  experiences: Joi.array()
    .items(
      Joi.object({
        organization: Joi.string().allow(""),
        role: Joi.string().allow(""),
        start: Joi.string().allow("").optional(),
        startDate: Joi.string().allow(""),
        end: Joi.string().allow("").optional(),
        endDate: Joi.string().allow(""),
        description: Joi.string().allow("")
      })
    )
    .optional(),
  certifications: Joi.array().items(Joi.string()).optional(),
  careerGoals: Joi.string().max(500).allow("").optional(),
  availabilityStatus: Joi.string().valid("available", "busy", "offline").optional(),
  resumeUrl: Joi.string().allow("").optional()
});

const mentorProfileUpdateSchema = Joi.object({
  profilePhotoUrl: Joi.string().allow("").optional(),
  title: Joi.string().max(120).allow("").optional(),
  profileType: Joi.string().valid("student", "graduate", "job_seeker").optional(),
  state: Joi.string().max(120).allow("").optional(),
  institutionName: Joi.string().max(220).allow("").optional(),
  institutionType: Joi.string().max(120).allow("").optional(),
  institutionDistrict: Joi.string().max(120).allow("").optional(),
  institutionSource: Joi.string().max(120).allow("").optional(),
  mentorOrgRole: Joi.string().valid("global_mentor", "institution_teacher", "organisation_head").optional(),
  assignedClasses: Joi.array().items(Joi.string().max(80).allow("")).optional(),
  institutionPermissions: Joi.array().items(Joi.string().max(80).allow("")).optional(),
  phoneNumber: Joi.string().max(30).allow("").optional(),
  company: Joi.string().max(120).allow("").optional(),
  experienceYears: Joi.number().min(0).max(80).optional(),
  expertiseDomains: Joi.array().items(Joi.string()).optional(),
  primaryCategory: Joi.string().max(100).allow("").optional(),
  subCategory: Joi.string().max(100).allow("").optional(),
  specializations: Joi.array().items(Joi.string()).optional(),
  about: Joi.string().max(1200).allow("").optional(),
  achievements: Joi.array()
    .items(
      Joi.object({
        title: Joi.string().allow(""),
        issuer: Joi.string().allow(""),
        date: Joi.string().allow(""),
        url: Joi.string().allow("")
      })
    )
    .optional(),
  projects: Joi.array()
    .items(
      Joi.object({
        title: Joi.string().allow(""),
        tech: Joi.array().items(Joi.string()).optional(),
        link: Joi.string().allow(""),
        description: Joi.string().allow("")
      })
    )
    .optional(),
  experiences: Joi.array()
    .items(
      Joi.object({
        organization: Joi.string().allow(""),
        role: Joi.string().allow(""),
        start: Joi.string().allow(""),
        end: Joi.string().allow(""),
        description: Joi.string().allow("")
      })
    )
    .optional(),
  linkedInUrl: Joi.string().allow("").optional(),
  resumeUrl: Joi.string().allow("").optional(),
  sessionPrice: Joi.number().min(0).optional(),
  payoutUpiId: Joi.string().max(120).allow("").optional(),
  payoutQrCodeUrl: Joi.string().allow("").optional(),
  payoutPhoneNumber: Joi.string().max(30).allow("").optional(),
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
