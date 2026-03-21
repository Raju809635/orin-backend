const fs = require("fs");
const path = require("path");
const { cloudinary, ensureCloudinary } = require("../config/cloudinary");
const { getBucket } = require("../config/firebase");
const ApiError = require("../utils/ApiError");

async function safeUnlink(filePath) {
  if (!filePath) return;
  try {
    await fs.promises.unlink(filePath);
  } catch {
    // ignore
  }
}

async function uploadImageFromPath(filePath, { folder = "orin", publicId = "" } = {}) {
  if (!ensureCloudinary()) {
    throw new ApiError(500, "Cloudinary is not configured");
  }
  const result = await cloudinary.uploader.upload(filePath, {
    folder,
    ...(publicId ? { public_id: publicId } : {}),
    resource_type: "image"
  });
  return {
    url: result.secure_url,
    publicId: result.public_id || ""
  };
}

async function uploadImageFromDataUri(dataUri, { folder = "orin", publicId = "" } = {}) {
  if (!ensureCloudinary()) {
    throw new ApiError(500, "Cloudinary is not configured");
  }
  const result = await cloudinary.uploader.upload(dataUri, {
    folder,
    ...(publicId ? { public_id: publicId } : {}),
    resource_type: "image"
  });
  return {
    url: result.secure_url,
    publicId: result.public_id || ""
  };
}

async function uploadFileFromPath(filePath, { destination = "orin/files" } = {}) {
  const bucket = getBucket();
  if (!bucket) {
    throw new ApiError(500, "Firebase Storage is not configured");
  }

  const baseName = path.basename(filePath);
  const remotePath = `${destination.replace(/\/+$/, "")}/${Date.now()}-${baseName}`.replace(/\\/g, "/");

  await bucket.upload(filePath, {
    destination: remotePath,
    resumable: false,
    metadata: {
      cacheControl: "public, max-age=31536000"
    }
  });

  const file = bucket.file(remotePath);
  const [signedUrl] = await file.getSignedUrl({
    action: "read",
    expires: "03-01-2500"
  });

  return { url: signedUrl, path: remotePath };
}

module.exports = {
  safeUnlink,
  uploadImageFromPath,
  uploadImageFromDataUri,
  uploadFileFromPath
};
