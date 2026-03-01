const CollaborateApplication = require("../models/CollaborateApplication");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");

exports.applyCollaborate = asyncHandler(async (req, res) => {
  const existingPending = await CollaborateApplication.findOne({
    email: req.body.email.toLowerCase().trim(),
    type: req.body.type,
    status: "pending"
  }).lean();

  if (existingPending) {
    throw new ApiError(409, "Your previous collaboration request is already under admin review.");
  }

  const application = await CollaborateApplication.create({
    name: req.body.name,
    email: req.body.email,
    organization: req.body.organization || "",
    type: req.body.type,
    message: req.body.message || "",
    status: "pending"
  });

  res.status(201).json({
    message: "Application submitted successfully. Admin will review and contact you.",
    application
  });
});

exports.getCollaborateStatusByEmail = asyncHandler(async (req, res) => {
  const email = req.query.email.toLowerCase().trim();

  const applications = await CollaborateApplication.find({ email })
    .select("name email type organization message status adminNotes reviewedAt createdAt")
    .sort({ createdAt: -1 })
    .lean();

  res.status(200).json(applications);
});
