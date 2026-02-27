const Joi = require("joi");

const dayEnum = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const createAvailabilitySchema = Joi.object({
  day: Joi.string().valid(...dayEnum).required(),
  startTime: Joi.string().pattern(/^\d{2}:\d{2}$/).required(),
  endTime: Joi.string().pattern(/^\d{2}:\d{2}$/).required(),
  sessionDurationMinutes: Joi.number().valid(30, 60).default(60)
});

const updateAvailabilitySchema = Joi.object({
  day: Joi.string().valid(...dayEnum).optional(),
  startTime: Joi.string().pattern(/^\d{2}:\d{2}$/).optional(),
  endTime: Joi.string().pattern(/^\d{2}:\d{2}$/).optional(),
  sessionDurationMinutes: Joi.number().valid(30, 60).optional()
}).min(1);

const blockDateSchema = Joi.object({
  blockedDate: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required()
});

const bookSessionSchema = Joi.object({
  mentorId: Joi.string().hex().length(24).required(),
  date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required(),
  time: Joi.string().pattern(/^\d{2}:\d{2}$/).required(),
  durationMinutes: Joi.number().valid(30, 60).default(60),
  notes: Joi.string().max(600).allow("").optional()
});

const rescheduleSessionSchema = Joi.object({
  date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required(),
  time: Joi.string().pattern(/^\d{2}:\d{2}$/).required(),
  durationMinutes: Joi.number().valid(30, 60).default(60)
});

module.exports = {
  createAvailabilitySchema,
  updateAvailabilitySchema,
  blockDateSchema,
  bookSessionSchema,
  rescheduleSessionSchema
};
