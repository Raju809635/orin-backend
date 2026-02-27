const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { accessTokenSecret, refreshTokenSecret, accessTokenTtl, refreshTokenTtl } = require("../config/env");

function hashToken(rawToken) {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

function createAccessToken(user) {
  return jwt.sign(
    {
      id: user._id.toString(),
      role: user.role
    },
    accessTokenSecret,
    {
      expiresIn: accessTokenTtl
    }
  );
}

function createRefreshToken(user) {
  return jwt.sign(
    {
      id: user._id.toString(),
      role: user.role,
      type: "refresh"
    },
    refreshTokenSecret,
    {
      expiresIn: refreshTokenTtl
    }
  );
}

function verifyRefreshToken(token) {
  return jwt.verify(token, refreshTokenSecret);
}

function buildPasswordResetToken() {
  const raw = crypto.randomBytes(32).toString("hex");
  return {
    raw,
    hash: hashToken(raw)
  };
}

module.exports = {
  hashToken,
  createAccessToken,
  createRefreshToken,
  verifyRefreshToken,
  buildPasswordResetToken
};
