const Joi = require("joi");

const sendMessageToAdminSchema = Joi.object({
  title: Joi.string().min(3).max(120).required(),
  message: Joi.string().min(3).max(1000).required()
});

const pushTokenSchema = Joi.object({
  expoPushToken: Joi.string().min(20).max(250).required(),
  platform: Joi.string().valid("android", "ios", "web", "unknown").default("unknown"),
  deviceId: Joi.string().max(120).allow("").optional(),
  appVersion: Joi.string().max(40).allow("").optional()
});

module.exports = {
  sendMessageToAdminSchema,
  pushTokenSchema
};
