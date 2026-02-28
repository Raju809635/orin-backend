const Joi = require("joi");

const aiChatSchema = Joi.object({
  message: Joi.string().min(2).max(4000).required(),
  context: Joi.object().optional()
});

module.exports = {
  aiChatSchema
};
