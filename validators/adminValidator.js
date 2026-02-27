const Joi = require("joi");

const sendNotificationSchema = Joi.object({
  title: Joi.string().min(3).max(120).required(),
  message: Joi.string().min(5).max(1000).required(),
  type: Joi.string().valid("announcement", "system", "booking", "approval").default("announcement"),
  targetRole: Joi.string().valid("student", "mentor", "admin", "all").default("all"),
  recipientUserId: Joi.string().hex().length(24).optional()
});

module.exports = {
  sendNotificationSchema
};
