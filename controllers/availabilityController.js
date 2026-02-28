const mongoose = require("mongoose");
const Availability = require("../models/Availability");
const User = require("../models/User");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");

exports.createAvailability = asyncHandler(async (req, res) => {
  const availability = await Availability.create({
    mentorId: req.user.id,
    day: req.body.day,
    startTime: req.body.startTime,
    endTime: req.body.endTime,
    sessionDurationMinutes: req.body.sessionDurationMinutes || 60,
    isBlockedDate: false
  });

  res.status(201).json({
    message: "Availability slot created",
    availability
  });
});

exports.updateAvailability = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) throw new ApiError(400, "Invalid availability id");

  const availability = await Availability.findOneAndUpdate(
    { _id: id, mentorId: req.user.id, isBlockedDate: false },
    { $set: req.body },
    { new: true, runValidators: true }
  );

  if (!availability) throw new ApiError(404, "Availability not found");

  res.status(200).json({
    message: "Availability updated",
    availability
  });
});

exports.blockDate = asyncHandler(async (req, res) => {
  const blockedDate = req.body.blockedDate;

  const existing = await Availability.findOne({
    mentorId: req.user.id,
    isBlockedDate: true,
    blockedDate
  });

  if (existing) throw new ApiError(409, "Date already blocked");

  const blockEntry = await Availability.create({
    mentorId: req.user.id,
    blockedDate,
    isBlockedDate: true
  });

  res.status(201).json({
    message: "Date blocked",
    availability: blockEntry
  });
});

exports.getMentorAvailability = asyncHandler(async (req, res) => {
  const { mentorId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(mentorId)) throw new ApiError(400, "Invalid mentor id");

  const mentor = await User.findOne({ _id: mentorId, role: "mentor", status: "approved" }).select("name email");
  if (!mentor) throw new ApiError(404, "Mentor not found");

  const [weeklySlots, blockedDates] = await Promise.all([
    Availability.find({ mentorId, isBlockedDate: false }).sort({ day: 1, startTime: 1 }).lean(),
    Availability.find({ mentorId, isBlockedDate: true }).sort({ blockedDate: 1 }).lean()
  ]);

  res.status(200).json({
    mentor,
    weeklySlots,
    blockedDates
  });
});
