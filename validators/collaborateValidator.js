const Joi = require("joi");

const collaborateApplySchema = Joi.object({
  name: Joi.string().min(2).max(100).required(),
  email: Joi.string().email().required(),
  organization: Joi.string().max(120).allow("").optional(),
  type: Joi.string().valid("leader", "founder", "mentor").required(),
  message: Joi.string().max(1000).allow("").optional()
});

module.exports = {
  collaborateApplySchema
};

