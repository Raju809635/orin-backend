const Joi = require("joi");

const registerSchema = Joi.object({
  name: Joi.string().min(2).max(80).required(),
  email: Joi.string().email().lowercase().required(),
  password: Joi.string().min(8).max(128).required(),
  role: Joi.string().valid("student", "mentor").default("student"),
  learnerStage: Joi.when("role", {
    is: "student",
    then: Joi.string().valid("highschool", "after12").default("after12"),
    otherwise: Joi.string().valid("highschool", "after12").optional()
  }),
  studentYear: Joi.when("role", {
    is: "student",
    then: Joi.string().trim().max(40).allow("").optional(),
    otherwise: Joi.string().trim().max(40).allow("").optional()
  }),
  mentorOrgRole: Joi.when("role", {
    is: "mentor",
    then: Joi.string().valid("global_mentor", "institution_teacher", "organisation_head").default("global_mentor"),
    otherwise: Joi.string().valid("global_mentor", "institution_teacher", "organisation_head").optional()
  }),
  institutionName: Joi.when("role", {
    is: "mentor",
    then: Joi.string().trim().max(180).allow("").optional(),
    otherwise: Joi.string().trim().max(180).allow("").optional()
  }),
  institutionType: Joi.string().trim().max(120).allow("").optional(),
  institutionDistrict: Joi.string().trim().max(120).allow("").optional(),
  institutionSource: Joi.string().trim().max(120).allow("").optional(),
  assignedClasses: Joi.array().items(Joi.string().trim().max(80).allow("")).optional(),
  phoneNumber: Joi.when("role", {
    is: "mentor",
    then: Joi.string().trim().min(8).max(20).required(),
    otherwise: Joi.string().trim().max(20).allow("").optional()
  })
});

const loginSchema = Joi.object({
  email: Joi.string().email().lowercase().required(),
  password: Joi.string().min(8).max(128).required()
});

const verifyEmailOtpSchema = Joi.object({
  email: Joi.string().email().lowercase().required(),
  otp: Joi.string().pattern(/^\d{6}$/).required()
});

const resendEmailOtpSchema = Joi.object({
  email: Joi.string().email().lowercase().required()
});

const refreshTokenSchema = Joi.object({
  refreshToken: Joi.string().required()
});

const forgotPasswordSchema = Joi.object({
  email: Joi.string().email().lowercase().required()
});

const resetPasswordSchema = Joi.object({
  token: Joi.string().required(),
  password: Joi.string().min(8).max(128).required()
});

const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().min(8).max(128).required(),
  newPassword: Joi.string().min(8).max(128).invalid(Joi.ref("currentPassword")).required()
    .messages({ "any.invalid": "New password must be different from your current password" })
});

module.exports = {
  registerSchema,
  loginSchema,
  verifyEmailOtpSchema,
  resendEmailOtpSchema,
  refreshTokenSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema
};
