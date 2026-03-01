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
  let decoded;
  try {
    decoded = jwt.verify(token, accessTokenSecret);
  } catch (error) {
    if (error?.name === "TokenExpiredError") {
      throw new ApiError(401, "JWT expired");
    }
    throw new ApiError(401, "Invalid token");
  }

  const user = await User.findOne({ _id: decoded.id, isDeleted: false }).select("-password").lean();
  if (!user) {
    throw new ApiError(401, "Invalid token user");
  }

  req.user = {
    id: user._id.toString(),
    role: user.role,
    isAdmin: Boolean(user.isAdmin),
    phoneNumber: user.phoneNumber || "",
    approvalStatus: user.approvalStatus || "approved",
    status: user.approvalStatus || "approved"
  };

  next();
});

const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    const roleAllowed = req.user && allowedRoles.includes(req.user.role);
    const adminAllowed = req.user && req.user.isAdmin && allowedRoles.includes("admin");

    if (!req.user || (!roleAllowed && !adminAllowed)) {
      return next(new ApiError(403, "Access denied"));
    }
    return next();
  };
};

module.exports = {
  verifyToken,
  authorizeRoles
};
