const Joi = require("joi");

const registerSchema = Joi.object({
  name: Joi.string().min(2).max(80).required(),
  email: Joi.string().email().lowercase().required(),
  password: Joi.string().min(8).max(128).required(),
  role: Joi.string().valid("student", "mentor").default("student")
});

const loginSchema = Joi.object({
  email: Joi.string().email().lowercase().required(),
  password: Joi.string().min(8).max(128).required()
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
  newPassword: Joi.string().min(8).max(128).required()
});

module.exports = {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema
};
