const fs = require("fs");
const path = require("path");
const multer = require("multer");
const ApiError = require("../utils/ApiError");

const profileUploadRoot = path.join(__dirname, "..", "uploads", "profile");
const paymentUploadRoot = path.join(__dirname, "..", "uploads", "payment-screenshots");
fs.mkdirSync(profileUploadRoot, { recursive: true });
fs.mkdirSync(paymentUploadRoot, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, profileUploadRoot);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase() || ".jpg";
    const safeExt = [".jpg", ".jpeg", ".png", ".webp"].includes(ext) ? ext : ".jpg";
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${safeExt}`);
  }
});

function fileFilter(_req, file, cb) {
  if (!file.mimetype || !file.mimetype.startsWith("image/")) {
    cb(new ApiError(400, "Only image files are allowed"));
    return;
  }
  cb(null, true);
}

const uploadProfilePhoto = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024
  }
}).single("file");

const paymentScreenshotStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, paymentUploadRoot);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase() || ".jpg";
    const safeExt = [".jpg", ".jpeg", ".png", ".webp"].includes(ext) ? ext : ".jpg";
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${safeExt}`);
  }
});

const uploadPaymentScreenshot = multer({
  storage: paymentScreenshotStorage,
  fileFilter,
  limits: {
    fileSize: 8 * 1024 * 1024
  }
}).single("paymentScreenshotFile");

module.exports = {
  uploadProfilePhoto,
  uploadPaymentScreenshot
};
