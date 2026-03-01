const jwt = require("jsonwebtoken");
const User = require("../models/User");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { accessTokenSecret } = require("../config/env");

const verifyToken = asyncHandler(async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new ApiError(401, "No token provided");
  }

  const token = authHeader.split(" ")[1];
  const decoded = jwt.verify(token, accessTokenSecret);

  const user = await User.findOne({ _id: decoded.id, isDeleted: false }).select("-password").lean();
  if (!user) {
    throw new ApiError(401, "Invalid token user");
  }

  req.user = {
    id: user._id.toString(),
    role: user.role,
    approvalStatus: user.approvalStatus || "approved",
    status: user.approvalStatus || "approved"
  };

  next();
});

const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return next(new ApiError(403, "Access denied"));
    }
    return next();
  };
};

module.exports = {
  verifyToken,
  authorizeRoles
};
