const Joi = require("joi");

const registerSchema = Joi.object({
  name: Joi.string().min(2).max(80).required(),
  email: Joi.string().email().lowercase().required(),
  password: Joi.string().min(8).max(128).required(),
  role: Joi.string().valid("student", "mentor").default("student"),
  domain: Joi.when("role", {
    is: "mentor",
    then: Joi.string().min(2).max(80).required(),
    otherwise: Joi.string().allow("", null).optional()
  })
});

const loginSchema = Joi.object({
  email: Joi.string().email().lowercase().required(),
  password: Joi.string().min(8).max(128).required()
});

module.exports = {
  registerSchema,
  loginSchema
};
