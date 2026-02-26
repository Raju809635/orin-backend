const mongoose = require("mongoose");
const User = require("../models/User");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");

exports.getPendingMentors = asyncHandler(async (req, res) => {
  const mentors = await User.find({
    role: "mentor",
    status: "pending"
  })
    .select("name email role status domain createdAt")
    .lean();

  res.status(200).json(mentors);
});

exports.approveMentor = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(400, "Invalid mentor id");
  }

  const mentor = await User.findOneAndUpdate(
    { _id: id, role: "mentor" },
    { status: "approved" },
    { new: true }
  ).select("name email role status domain");

  if (!mentor) {
    throw new ApiError(404, "Mentor not found");
  }

  res.status(200).json({
    message: "Mentor approved successfully",
    mentor
  });
});
