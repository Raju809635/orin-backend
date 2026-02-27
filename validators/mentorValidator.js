const Joi = require("joi");

const updateMentorProfileSchema = Joi.object({
  name: Joi.string().min(2).max(80).optional(),
  primaryCategory: Joi.string().max(120).optional(),
  subCategory: Joi.string().max(120).optional(),
  specializations: Joi.array().items(Joi.string().max(120)).optional(),
  sessionPrice: Joi.number().min(0).optional()
}).min(1);

module.exports = {
  updateMentorProfileSchema
};
