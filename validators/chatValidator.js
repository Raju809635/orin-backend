const Joi = require("joi");

const sendChatMessageSchema = Joi.object({
  text: Joi.string().min(1).max(2000).required()
});

module.exports = {
  sendChatMessageSchema
};
