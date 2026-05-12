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
  EMAIL_OTP_TTL_MINUTES: Joi.number().integer().min(5).max(30).default(10),
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
  PAYMENT_MODE: Joi.string().valid("manual", "razorpay").default("razorpay"),
  GOOGLE_PLAY_PACKAGE_NAME: Joi.string().allow("").default("com.orin.app"),
  GOOGLE_PLAY_SUBSCRIPTION_PRODUCT_ID: Joi.string().allow("").default("orin_premium"),
  GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL: Joi.string().allow("").optional(),
  GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY: Joi.string().allow("").optional(),
  ORIN_UPI_ID: Joi.string().allow("").default(""),
  ORIN_QR_IMAGE_URL: Joi.string().allow("").default(""),
  MANUAL_PAYMENT_WINDOW_MINUTES: Joi.number().integer().min(5).max(240).default(30),
  PUBLIC_BASE_URL: Joi.string().uri().allow("").optional(),
  CLOUDINARY_CLOUD_NAME: Joi.string().allow("").optional(),
  CLOUDINARY_API_KEY: Joi.string().allow("").optional(),
  CLOUDINARY_API_SECRET: Joi.string().allow("").optional(),
  FIREBASE_PROJECT_ID: Joi.string().allow("").optional(),
  FIREBASE_CLIENT_EMAIL: Joi.string().allow("").optional(),
  FIREBASE_PRIVATE_KEY: Joi.string().allow("").optional(),
  FIREBASE_STORAGE_BUCKET: Joi.string().allow("").optional(),
  GROQ_API_KEY: Joi.string().min(20).allow("").optional(),
  GROQ_MODEL: Joi.string().default("llama-3.1-8b-instant"),
  OPENAI_API_KEY: Joi.string().min(20).allow("").optional(),
  OPENAI_MODEL: Joi.string().default("gpt-4o-mini"),
  GEMINI_API_KEY: Joi.string().min(20).allow("").optional(),
  GEMINI_MODEL: Joi.string().default("gemini-1.5-flash"),
  NEWS_API_KEY: Joi.string().allow("").optional(),
  NEWS_API_BASE_URL: Joi.string().uri().default("https://newsapi.org/v2"),
  NEWSDATA_API_KEY: Joi.string().allow("").optional(),
  NEWSDATA_API_BASE_URL: Joi.string().uri().default("https://newsdata.io/api/1/news"),
  NEWS_TRANSLATE_API_URL: Joi.string().uri().allow("").optional(),
  NEWS_TRANSLATE_API_KEY: Joi.string().allow("").optional(),
  CORS_ORIGINS: Joi.string().allow("").optional()
  ,
  ORIN_AI_ENGINE_URL: Joi.string().uri().allow("").optional(),
  ORIN_AI_ENGINE_TIMEOUT_MS: Joi.number().integer().min(1000).max(60000).default(12000),
  ORIN_AI_ENGINE_ENABLED: Joi.boolean().truthy("true").falsy("false").default(false)
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

const hasRazorpayConfigured = Boolean(
  String(value.RAZORPAY_KEY_ID || "").trim() &&
  String(value.RAZORPAY_KEY_SECRET || "").trim()
);

const resolvedPaymentMode =
  value.PAYMENT_MODE === "manual"
    ? "manual"
    : hasRazorpayConfigured
      ? "razorpay"
      : "manual";

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
  emailOtpTtlMinutes: value.EMAIL_OTP_TTL_MINUTES,
  passwordResetUrl: value.PASSWORD_RESET_URL,
  smtpHost: value.SMTP_HOST,
  smtpPort: value.SMTP_PORT,
  smtpSecure: value.SMTP_SECURE,
  smtpUser: value.SMTP_USER,
  smtpPass: value.SMTP_PASS,
  emailFrom: value.EMAIL_FROM,
  razorpayKeyId: value.RAZORPAY_KEY_ID,
  razorpayKeySecret: value.RAZORPAY_KEY_SECRET,
  paymentMode: resolvedPaymentMode,
  hasRazorpayConfigured,
  googlePlayPackageName: value.GOOGLE_PLAY_PACKAGE_NAME || "com.orin.app",
  googlePlaySubscriptionProductId: value.GOOGLE_PLAY_SUBSCRIPTION_PRODUCT_ID || "orin_premium",
  googlePlayServiceAccountEmail: value.GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL || "",
  googlePlayServiceAccountPrivateKey: value.GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY || "",
  orinUpiId: value.ORIN_UPI_ID,
  orinQrImageUrl: value.ORIN_QR_IMAGE_URL,
  manualPaymentWindowMinutes: value.MANUAL_PAYMENT_WINDOW_MINUTES,
  publicBaseUrl: value.PUBLIC_BASE_URL || "",
  cloudinaryCloudName: value.CLOUDINARY_CLOUD_NAME || "",
  cloudinaryApiKey: value.CLOUDINARY_API_KEY || "",
  cloudinaryApiSecret: value.CLOUDINARY_API_SECRET || "",
  firebaseProjectId: value.FIREBASE_PROJECT_ID || "",
  firebaseClientEmail: value.FIREBASE_CLIENT_EMAIL || "",
  firebasePrivateKey: value.FIREBASE_PRIVATE_KEY || "",
  firebaseStorageBucket: value.FIREBASE_STORAGE_BUCKET || "",
  groqApiKey: value.GROQ_API_KEY,
  groqModel: value.GROQ_MODEL || "llama-3.1-8b-instant",
  openaiApiKey: value.OPENAI_API_KEY,
  openaiModel: value.OPENAI_MODEL || "gpt-4o-mini",
  geminiApiKey: value.GEMINI_API_KEY,
  geminiModel: value.GEMINI_MODEL || "gemini-1.5-flash",
  newsApiKey: value.NEWS_API_KEY || "",
  newsApiBaseUrl: value.NEWS_API_BASE_URL || "https://newsapi.org/v2",
  newsDataApiKey: value.NEWSDATA_API_KEY || "",
  newsDataApiBaseUrl: value.NEWSDATA_API_BASE_URL || "https://newsdata.io/api/1/news",
  newsTranslateApiUrl: value.NEWS_TRANSLATE_API_URL || "",
  newsTranslateApiKey: value.NEWS_TRANSLATE_API_KEY || "",
  corsOrigins,
  orinAiEngineUrl: value.ORIN_AI_ENGINE_URL || "",
  orinAiEngineTimeoutMs: Number(value.ORIN_AI_ENGINE_TIMEOUT_MS || 12000),
  orinAiEngineEnabled: Boolean(value.ORIN_AI_ENGINE_ENABLED)
};
