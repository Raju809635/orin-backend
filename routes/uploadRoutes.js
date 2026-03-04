const express = require("express");
const router = express.Router();
const { verifyToken, authorizeRoles } = require("../middleware/authMiddleware");
const { uploadProfilePhoto, uploadPostMedia } = require("../middleware/uploadMiddleware");
const {
  uploadProfilePhoto: uploadProfilePhotoController,
  uploadPostMedia: uploadPostMediaController
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

module.exports = router;
