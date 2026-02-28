const mongoose = require("mongoose");
const Complaint = require("../models/Complaint");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");

exports.createComplaint = asyncHandler(async (req, res) => {
  const complaint = await Complaint.create({
    student: req.user.id,
    subject: req.body.subject,
    description: req.body.description,
    category: req.body.category || "general",
    priority: req.body.priority || "medium"
  });

  res.status(201).json({
    message: "Complaint submitted",
    complaint
  });
});

exports.getMyComplaints = asyncHandler(async (req, res) => {
  const complaints = await Complaint.find({ student: req.user.id })
    .sort({ createdAt: -1 })
    .lean();

  res.status(200).json(complaints);
});

exports.getAllComplaints = asyncHandler(async (req, res) => {
  const filter = {};

  if (req.query.status) {
    filter.status = req.query.status;
  }

  if (req.query.priority) {
    filter.priority = req.query.priority;
  }

  if (req.query.category) {
    filter.category = req.query.category;
  }

  const complaints = await Complaint.find(filter)
    .populate("student", "name email role")
    .populate("respondedBy", "name email role")
    .sort({ createdAt: -1 })
    .lean();

  res.status(200).json(complaints);
});

exports.updateComplaintByAdmin = asyncHandler(async (req, res) => {
  const { complaintId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(complaintId)) {
    throw new ApiError(400, "Invalid complaint id");
  }

  const updatePayload = {};
  if (req.body.status) updatePayload.status = req.body.status;
  if (req.body.priority) updatePayload.priority = req.body.priority;
  if (typeof req.body.adminResponse === "string") updatePayload.adminResponse = req.body.adminResponse;

  if (Object.prototype.hasOwnProperty.call(updatePayload, "adminResponse")) {
    updatePayload.respondedBy = req.user.id;
    updatePayload.respondedAt = new Date();
  }

  const complaint = await Complaint.findByIdAndUpdate(
    complaintId,
    updatePayload,
    { new: true, runValidators: true }
  )
    .populate("student", "name email role")
    .populate("respondedBy", "name email role");

  if (!complaint) {
    throw new ApiError(404, "Complaint not found");
  }

  res.status(200).json({
    message: "Complaint updated",
    complaint
  });
});
