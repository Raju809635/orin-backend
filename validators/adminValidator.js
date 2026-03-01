const Joi = require("joi");

const sendNotificationSchema = Joi.object({
  title: Joi.string().min(3).max(120).required(),
  message: Joi.string().min(5).max(1000).required(),
  type: Joi.string().valid("announcement", "system", "booking", "approval").default("announcement"),
  targetRole: Joi.string().valid("student", "mentor", "admin", "all").default("all"),
  recipientUserId: Joi.string().hex().length(24).optional()
});

const sendMentorMessageSchema = Joi.object({
  title: Joi.string().min(3).max(120).required(),
  message: Joi.string().min(3).max(1000).required(),
  recipientUserIds: Joi.array().items(Joi.string().hex().length(24)).min(1).required()
});

const reviewCollaborateSchema = Joi.object({
  action: Joi.string().valid("approve", "reject").required(),
  adminNotes: Joi.string().max(500).allow("").optional()
});

module.exports = {
  sendNotificationSchema,
  sendMentorMessageSchema,
  reviewCollaborateSchema
};
