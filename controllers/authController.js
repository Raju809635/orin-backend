const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");

exports.register = asyncHandler(async (req, res) => {
  const { name, email, password, role, domain } = req.body;

  const existingUser = await User.findOne({ email });
  if (existingUser) {
    throw new ApiError(409, "User already exists");
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const normalizedRole = role || "student";
  const user = new User({
    name,
    email,
    password: hashedPassword,
    role: normalizedRole,
    domain: normalizedRole === "mentor" ? domain : undefined,
    status: normalizedRole === "mentor" ? "pending" : "approved"
  });

  await user.save();

  res.status(201).json({
    message: "User registered successfully"
  });
});

exports.login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email }).select("+password");
  if (!user) {
    throw new ApiError(401, "Invalid credentials");
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    throw new ApiError(401, "Invalid credentials");
  }

  if (user.role === "mentor" && user.status !== "approved") {
    throw new ApiError(403, "Mentor not approved yet");
  }

  const token = jwt.sign(
    { id: user._id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );

  res.status(200).json({
    token,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      domain: user.domain
    }
  });
});
