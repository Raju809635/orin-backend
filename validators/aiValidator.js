const Joi = require("joi");

const aiChatSchema = Joi.object({
  message: Joi.string().min(2).max(4000).required(),
  context: Joi.object().optional(),
  conversationId: Joi.string().max(100).optional()
});

const aiConversationUpdateSchema = Joi.object({
  title: Joi.string().trim().max(120).optional(),
  pinned: Joi.boolean().optional()
}).or("title", "pinned");

module.exports = {
  aiChatSchema,
  aiConversationUpdateSchema
};
