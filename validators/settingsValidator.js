const Joi = require("joi");

const preferencesSchema = Joi.object({
  notificationPreferences: Joi.object({
    email: Joi.boolean().optional(),
    push: Joi.boolean().optional(),
    sms: Joi.boolean().optional()
  }).optional(),
  privacySettings: Joi.object({
    profileVisibility: Joi.string().valid("public", "private").optional(),
    showEmail: Joi.boolean().optional(),
    showSessionHistory: Joi.boolean().optional()
  }).optional()
}).or("notificationPreferences", "privacySettings");

module.exports = {
  preferencesSchema
};
