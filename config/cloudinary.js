const { v2: cloudinary } = require("cloudinary");
const { cloudinaryCloudName, cloudinaryApiKey, cloudinaryApiSecret } = require("./env");

let configured = false;

function ensureCloudinary() {
  if (configured) return true;
  if (!cloudinaryCloudName || !cloudinaryApiKey || !cloudinaryApiSecret) return false;
  cloudinary.config({
    cloud_name: cloudinaryCloudName,
    api_key: cloudinaryApiKey,
    api_secret: cloudinaryApiSecret,
    secure: true
  });
  configured = true;
  return true;
}

module.exports = {
  cloudinary,
  ensureCloudinary
};

