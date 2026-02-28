const Joi = require("joi");

const envSchema = Joi.object({
  NODE_ENV: Joi.string().valid("development", "test", "production").default("development"),
  PORT: Joi.number().port().default(5000),
  MONGO_URI: Joi.string().uri().required(),
  JWT_SECRET: Joi.string().min(16).required(),
  JWT_REFRESH_SECRET: Joi.string().min(16).optional(),
  JWT_ACCESS_EXPIRES_IN: Joi.string().default("15m"),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default("7d"),
  PASSWORD_RESET_TOKEN_TTL_MINUTES: Joi.number().integer().min(5).max(60).default(15),
  PASSWORD_RESET_URL: Joi.string().uri().default("http://localhost:8081/reset-password"),
  SMTP_HOST: Joi.string().allow("").optional(),
  SMTP_PORT: Joi.number().port().optional(),
  SMTP_SECURE: Joi.boolean().truthy("true").falsy("false").default(false),
  SMTP_USER: Joi.string().allow("").optional(),
  SMTP_PASS: Joi.string().allow("").optional(),
  EMAIL_FROM: Joi.string().email().allow("").optional(),
  OPENAI_API_KEY: Joi.string().min(20).required(),
  OPENAI_MODEL: Joi.string().default("gpt-4o-mini"),
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
  accessTokenSecret: value.JWT_SECRET,
  refreshTokenSecret: value.JWT_REFRESH_SECRET || value.JWT_SECRET,
  accessTokenTtl: value.JWT_ACCESS_EXPIRES_IN,
  refreshTokenTtl: value.JWT_REFRESH_EXPIRES_IN,
  passwordResetTokenTtlMinutes: value.PASSWORD_RESET_TOKEN_TTL_MINUTES,
  passwordResetUrl: value.PASSWORD_RESET_URL,
  smtpHost: value.SMTP_HOST,
  smtpPort: value.SMTP_PORT,
  smtpSecure: value.SMTP_SECURE,
  smtpUser: value.SMTP_USER,
  smtpPass: value.SMTP_PASS,
  emailFrom: value.EMAIL_FROM,
  openaiApiKey: value.OPENAI_API_KEY,
  openaiModel: value.OPENAI_MODEL || "gpt-4o-mini",
  corsOrigins
};
