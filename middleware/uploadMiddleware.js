const fs = require("fs");
const path = require("path");
const multer = require("multer");
const ApiError = require("../utils/ApiError");

const profileUploadRoot = path.join(__dirname, "..", "uploads", "profile");
const paymentUploadRoot = path.join(__dirname, "..", "uploads", "payment-screenshots");
const postUploadRoot = path.join(__dirname, "..", "uploads", "posts");
const tmpImageUploadRoot = path.join(__dirname, "..", "uploads", "tmp-images");
const fileUploadRoot = path.join(__dirname, "..", "uploads", "files");
fs.mkdirSync(profileUploadRoot, { recursive: true });
fs.mkdirSync(paymentUploadRoot, { recursive: true });
fs.mkdirSync(postUploadRoot, { recursive: true });
fs.mkdirSync(tmpImageUploadRoot, { recursive: true });
fs.mkdirSync(fileUploadRoot, { recursive: true });

function createImageDiskStorage(destinationRoot) {
  return multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, destinationRoot),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || "").toLowerCase() || ".jpg";
      const safeExt = [".jpg", ".jpeg", ".png", ".webp"].includes(ext) ? ext : ".jpg";
      cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${safeExt}`);
    }
  });
}

const storage = createImageDiskStorage(profileUploadRoot);

const fileStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, fileUploadRoot);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase() || "";
    const safeExt = [".pdf", ".doc", ".docx"].includes(ext) ? ext : ".pdf";
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${safeExt}`);
  }
});

function imageFileFilter(_req, file, cb) {
  if (!file.mimetype || !file.mimetype.startsWith("image/")) {
    cb(new ApiError(400, "Only image files are allowed"));
    return;
  }
  cb(null, true);
}

function docFileFilter(_req, file, cb) {
  const type = String(file.mimetype || "").toLowerCase();
  if (type === "application/pdf") return cb(null, true);
  if (type === "application/msword") return cb(null, true);
  if (type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return cb(null, true);
  cb(new ApiError(400, "Only PDF/DOC/DOCX files are allowed"));
}

const uploadProfilePhoto = multer({
  storage,
  fileFilter: imageFileFilter,
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
  fileFilter: imageFileFilter,
  limits: {
    fileSize: 8 * 1024 * 1024
  }
}).single("paymentScreenshotFile");

const postMediaStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, postUploadRoot);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase() || ".jpg";
    const safeExt = [".jpg", ".jpeg", ".png", ".webp"].includes(ext) ? ext : ".jpg";
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${safeExt}`);
  }
});

const uploadPostMedia = multer({
  storage: postMediaStorage,
  fileFilter: imageFileFilter,
  limits: {
    fileSize: 8 * 1024 * 1024
  }
}).single("file");

const uploadAnyImage = multer({
  storage: createImageDiskStorage(tmpImageUploadRoot),
  fileFilter: imageFileFilter,
  limits: {
    fileSize: 8 * 1024 * 1024
  }
}).single("file");

const uploadAnyFile = multer({
  storage: fileStorage,
  fileFilter: docFileFilter,
  limits: {
    fileSize: 15 * 1024 * 1024
  }
}).single("file");

module.exports = {
  uploadProfilePhoto,
  uploadPaymentScreenshot,
  uploadPostMedia,
  uploadAnyImage,
  uploadAnyFile
};
