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
  AI_CHAT_DAILY_LIMIT: Joi.number().integer().min(1).max(500).default(40),
  PASSWORD_RESET_URL: Joi.string().uri().default("http://localhost:8081/reset-password"),
  SMTP_HOST: Joi.string().allow("").optional(),
  SMTP_PORT: Joi.number().port().optional(),
  SMTP_SECURE: Joi.boolean().truthy("true").falsy("false").default(false),
  SMTP_USER: Joi.string().allow("").optional(),
  SMTP_PASS: Joi.string().allow("").optional(),
  EMAIL_FROM: Joi.string().email().allow("").optional(),
  RAZORPAY_KEY_ID: Joi.string().allow("").optional(),
  RAZORPAY_KEY_SECRET: Joi.string().allow("").optional(),
  GROQ_API_KEY: Joi.string().min(20).allow("").optional(),
  GROQ_MODEL: Joi.string().default("llama-3.1-8b-instant"),
  OPENAI_API_KEY: Joi.string().min(20).allow("").optional(),
  OPENAI_MODEL: Joi.string().default("gpt-4o-mini"),
  GEMINI_API_KEY: Joi.string().min(20).allow("").optional(),
  GEMINI_MODEL: Joi.string().default("gemini-1.5-flash"),
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
  aiChatDailyLimit: value.AI_CHAT_DAILY_LIMIT,
  passwordResetTokenTtlMinutes: value.PASSWORD_RESET_TOKEN_TTL_MINUTES,
  passwordResetUrl: value.PASSWORD_RESET_URL,
  smtpHost: value.SMTP_HOST,
  smtpPort: value.SMTP_PORT,
  smtpSecure: value.SMTP_SECURE,
  smtpUser: value.SMTP_USER,
  smtpPass: value.SMTP_PASS,
  emailFrom: value.EMAIL_FROM,
  razorpayKeyId: value.RAZORPAY_KEY_ID,
  razorpayKeySecret: value.RAZORPAY_KEY_SECRET,
  groqApiKey: value.GROQ_API_KEY,
  groqModel: value.GROQ_MODEL || "llama-3.1-8b-instant",
  openaiApiKey: value.OPENAI_API_KEY,
  openaiModel: value.OPENAI_MODEL || "gpt-4o-mini",
  geminiApiKey: value.GEMINI_API_KEY,
  geminiModel: value.GEMINI_MODEL || "gemini-1.5-flash",
  corsOrigins
};
