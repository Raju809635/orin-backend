const Joi = require("joi");

const createBookingSchema = Joi.object({
  mentorId: Joi.string().hex().length(24).required(),
  scheduledAt: Joi.date().iso().required(),
  notes: Joi.string().max(600).allow("").optional()
});

const updateBookingStatusSchema = Joi.object({
  status: Joi.string().valid("approved", "rejected").required()
});

module.exports = {
  createBookingSchema,
  updateBookingStatusSchema
};
