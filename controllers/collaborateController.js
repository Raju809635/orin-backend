const CollaborateApplication = require("../models/CollaborateApplication");
const asyncHandler = require("../utils/asyncHandler");

exports.applyCollaborate = asyncHandler(async (req, res) => {
  const application = await CollaborateApplication.create({
    name: req.body.name,
    email: req.body.email,
    organization: req.body.organization || "",
    type: req.body.type,
    message: req.body.message || ""
  });

  res.status(201).json({
    message: "Application submitted successfully",
    application
  });
});

