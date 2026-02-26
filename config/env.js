const Joi = require("joi");

const envSchema = Joi.object({
  NODE_ENV: Joi.string().valid("development", "test", "production").default("development"),
  PORT: Joi.number().port().default(5000),
  MONGO_URI: Joi.string().uri().required(),
  JWT_SECRET: Joi.string().min(16).required(),
  CORS_ORIGINS: Joi.string().allow("").optional()
}).unknown(true);

const { value, error } = envSchema.validate(process.env, {
  abortEarly: false
});

if (error) {
  throw new Error(`Environment validation error: ${error.message}`);
}

const corsOrigins = (value.CORS_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

module.exports = {
  env: value.NODE_ENV,
  port: Number(value.PORT),
  mongoUri: value.MONGO_URI,
  jwtSecret: value.JWT_SECRET,
  corsOrigins
};
