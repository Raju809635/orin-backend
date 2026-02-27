const mongoose = require("mongoose");
const Booking = require("../models/Booking");
const User = require("../models/User");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");

exports.createBooking = asyncHandler(async (req, res) => {
  const { mentorId, scheduledAt, notes } = req.body;

  if (!mongoose.Types.ObjectId.isValid(mentorId)) {
    throw new ApiError(400, "Invalid mentor id");
  }

  const mentor = await User.findOne({
    _id: mentorId,
    role: "mentor",
    approvalStatus: "approved"
  });

  if (!mentor) {
    throw new ApiError(404, "Approved mentor not found");
  }

  const booking = await Booking.create({
    student: req.user.id,
    mentor: mentorId,
    scheduledAt: new Date(scheduledAt),
    notes: notes || ""
  });

  res.status(201).json({
    message: "Booking request created",
    booking
  });
});

exports.getMentorBookings = asyncHandler(async (req, res) => {
  const bookings = await Booking.find({ mentor: req.user.id })
    .populate("student", "name email")
    .sort({ createdAt: -1 })
    .lean();

  res.status(200).json(bookings);
});

exports.getStudentBookings = asyncHandler(async (req, res) => {
  const bookings = await Booking.find({ student: req.user.id })
    .populate("mentor", "name email primaryCategory subCategory")
    .sort({ createdAt: -1 })
    .lean();

  res.status(200).json(bookings);
});

exports.updateBookingStatus = asyncHandler(async (req, res) => {
  const { bookingId } = req.params;
  const { status } = req.body;

  if (!mongoose.Types.ObjectId.isValid(bookingId)) {
    throw new ApiError(400, "Invalid booking id");
  }

  const booking = await Booking.findOneAndUpdate(
    { _id: bookingId, mentor: req.user.id },
    { status },
    { new: true, runValidators: true }
  )
    .populate("student", "name email")
    .populate("mentor", "name email primaryCategory subCategory");

  if (!booking) {
    throw new ApiError(404, "Booking not found for this mentor");
  }

  res.status(200).json({
    message: `Booking ${status}`,
    booking
  });
});
