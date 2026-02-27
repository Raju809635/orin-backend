const mongoose = require("mongoose");
const User = require("../models/User");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");

exports.getPublicMentorProfile = asyncHandler(async (req, res) => {
  const { mentorId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(mentorId)) {
    throw new ApiError(400, "Invalid mentor id");
  }

  const mentor = await User.findOne({
    _id: mentorId,
    role: "mentor",
    approvalStatus: "approved"
  }).select("name email primaryCategory subCategory specializations bio expertise createdAt");

  if (!mentor) {
    throw new ApiError(404, "Mentor not found");
  }

  res.status(200).json(mentor);
});

exports.getMyMentorProfile = asyncHandler(async (req, res) => {
  const mentor = await User.findOne({
    _id: req.user.id,
    role: "mentor"
  }).select(
    "name email role approvalStatus primaryCategory subCategory specializations bio expertise sessionPrice availability createdAt updatedAt"
  );

  if (!mentor) {
    throw new ApiError(404, "Mentor profile not found");
  }

  res.status(200).json(mentor);
});

exports.updateMyMentorProfile = asyncHandler(async (req, res) => {
  const mentor = await User.findOneAndUpdate(
    { _id: req.user.id, role: "mentor" },
    req.body,
    { new: true, runValidators: true }
  ).select(
    "name email role approvalStatus primaryCategory subCategory specializations bio expertise sessionPrice availability createdAt updatedAt"
  );

  if (!mentor) {
    throw new ApiError(404, "Mentor profile not found");
  }

  res.status(200).json({
    message: "Mentor profile updated",
    mentor
  });
});
