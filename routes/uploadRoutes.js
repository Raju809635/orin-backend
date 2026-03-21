const express = require("express");
const router = express.Router();
const { verifyToken, authorizeRoles } = require("../middleware/authMiddleware");
const {
  uploadProfilePhoto,
  uploadPostMedia,
  uploadAnyImage,
  uploadAnyFile
} = require("../middleware/uploadMiddleware");
const {
  uploadProfilePhoto: uploadProfilePhotoController,
  uploadPostMedia: uploadPostMediaController,
  uploadImage: uploadImageController,
  uploadFile: uploadFileController
} = require("../controllers/uploadController");

router.post(
  "/profile-photo",
  verifyToken,
  authorizeRoles("student", "mentor", "admin"),
  (req, res, next) => {
    uploadProfilePhoto(req, res, (error) => {
      if (error) return next(error);
      return uploadProfilePhotoController(req, res, next);
    });
  }
);

router.post(
  "/post-media",
  verifyToken,
  authorizeRoles("student", "mentor"),
  (req, res, next) => {
    uploadPostMedia(req, res, (error) => {
      if (error) return next(error);
      return uploadPostMediaController(req, res, next);
    });
  }
);

// Generic upload endpoints (do not break existing routes; used for future-proof uploads like resume PDFs).
router.post(
  "/image",
  verifyToken,
  authorizeRoles("student", "mentor", "admin"),
  (req, res, next) => {
    uploadAnyImage(req, res, (error) => {
      if (error) return next(error);
      return uploadImageController(req, res, next);
    });
  }
);

router.post(
  "/file",
  verifyToken,
  authorizeRoles("student", "mentor", "admin"),
  (req, res, next) => {
    uploadAnyFile(req, res, (error) => {
      if (error) return next(error);
      return uploadFileController(req, res, next);
    });
  }
);

module.exports = router;
