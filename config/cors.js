const { env, corsOrigins } = require("./env");

function corsOriginValidator(origin, callback) {
  if (!origin) {
    return callback(null, true);
  }

  if (env !== "production" && corsOrigins.length === 0) {
    return callback(null, true);
  }

  if (corsOrigins.includes(origin)) {
    return callback(null, true);
  }

  return callback(new Error(`CORS blocked for origin: ${origin}`));
}

module.exports = {
  origin: corsOriginValidator,
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
};
