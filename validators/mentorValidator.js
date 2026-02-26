const Joi = require("joi");

const updateMentorProfileSchema = Joi.object({
  name: Joi.string().min(2).max(80).optional(),
  domain: Joi.string().min(2).max(80).optional()
}).min(1);

module.exports = {
  updateMentorProfileSchema
};
