const Joi = require("joi");

const createComplaintSchema = Joi.object({
  subject: Joi.string().min(3).max(140).required(),
  description: Joi.string().min(10).max(4000).required(),
  category: Joi.string()
    .valid("technical", "mentor", "booking", "payment", "general")
    .default("general"),
  priority: Joi.string().valid("low", "medium", "high").default("medium")
});

const updateComplaintSchema = Joi.object({
  status: Joi.string().valid("open", "in_progress", "resolved", "closed").optional(),
  adminResponse: Joi.string().max(4000).allow("").optional(),
  priority: Joi.string().valid("low", "medium", "high").optional()
}).min(1);

module.exports = {
  createComplaintSchema,
  updateComplaintSchema
};
