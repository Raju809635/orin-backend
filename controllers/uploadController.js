const path = require("path");
const { publicBaseUrl } = require("../config/env");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const {
  safeUnlink,
  uploadImageFromPath,
  uploadFileFromPath
} = require("../services/externalStorageService");

function getBaseUrl(req) {
  if (publicBaseUrl) return publicBaseUrl.replace(/\/+$/, "");
  const protocol = req.headers["x-forwarded-proto"] || req.protocol || "http";
  return `${protocol}://${req.get("host")}`;
}

exports.uploadProfilePhoto = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new ApiError(400, "No file uploaded");
  }

  const relativePath = `/uploads/profile/${path.basename(req.file.filename)}`;
  const fileUrl = `${getBaseUrl(req)}${relativePath}`;

  let url = fileUrl;
  let storage = "local";
  if (req.file?.path) {
    try {
      const uploaded = await uploadImageFromPath(req.file.path, { folder: "orin/profile" });
      url = uploaded.url;
      storage = "cloudinary";
      await safeUnlink(req.file.path);
    } catch {
      // Cloudinary not configured or upload failed: keep local file URL.
    }
  }

  res.status(201).json({
    message: "Profile photo uploaded",
    url,
    path: storage === "local" ? relativePath : "",
    storage
  });
});

exports.uploadPostMedia = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new ApiError(400, "No file uploaded");
  }

  const relativePath = `/uploads/posts/${path.basename(req.file.filename)}`;
  const fileUrl = `${getBaseUrl(req)}${relativePath}`;

  let url = fileUrl;
  let storage = "local";
  if (req.file?.path) {
    try {
      const uploaded = await uploadImageFromPath(req.file.path, { folder: "orin/posts" });
      url = uploaded.url;
      storage = "cloudinary";
      await safeUnlink(req.file.path);
    } catch {
      // Cloudinary not configured or upload failed: keep local file URL.
    }
  }

  res.status(201).json({
    message: "Post media uploaded",
    url,
    path: storage === "local" ? relativePath : "",
    storage
  });
});

exports.uploadImage = asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, "No file uploaded");

  let url = "";
  try {
    const uploaded = await uploadImageFromPath(req.file.path, { folder: "orin/images" });
    url = uploaded.url;
    await safeUnlink(req.file.path);
  } catch {
    // Fallback to local hosting (useful for dev if Cloudinary isn't configured).
    const relativePath = `/uploads/tmp-images/${path.basename(req.file.filename)}`;
    url = `${getBaseUrl(req)}${relativePath}`;
  }

  res.status(201).json({ success: true, url });
});

exports.uploadFile = asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, "No file uploaded");

  let url = "";
  try {
    const uploaded = await uploadFileFromPath(req.file.path, { destination: "orin/files" });
    url = uploaded.url;
    await safeUnlink(req.file.path);
  } catch {
    const relativePath = `/uploads/files/${path.basename(req.file.filename)}`;
    url = `${getBaseUrl(req)}${relativePath}`;
  }

  res.status(201).json({ success: true, url });
});
