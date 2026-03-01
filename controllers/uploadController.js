const path = require("path");
const { publicBaseUrl } = require("../config/env");
const ApiError = require("../utils/ApiError");

function getBaseUrl(req) {
  if (publicBaseUrl) return publicBaseUrl.replace(/\/+$/, "");
  const protocol = req.headers["x-forwarded-proto"] || req.protocol || "http";
  return `${protocol}://${req.get("host")}`;
}

exports.uploadProfilePhoto = (req, res) => {
  if (!req.file) {
    throw new ApiError(400, "No file uploaded");
  }

  const relativePath = `/uploads/profile/${path.basename(req.file.filename)}`;
  const fileUrl = `${getBaseUrl(req)}${relativePath}`;

  res.status(201).json({
    message: "Profile photo uploaded",
    url: fileUrl,
    path: relativePath
  });
};
