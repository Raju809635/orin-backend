const Joi = require("joi");

const sendMessageToAdminSchema = Joi.object({
  title: Joi.string().min(3).max(120).required(),
  message: Joi.string().min(3).max(1000).required()
});

module.exports = {
  sendMessageToAdminSchema
};
