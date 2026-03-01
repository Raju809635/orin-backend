const express = require("express");
const router = express.Router();
const { verifyToken, authorizeRoles } = require("../middleware/authMiddleware");
const { uploadProfilePhoto } = require("../middleware/uploadMiddleware");
const { uploadProfilePhoto: uploadProfilePhotoController } = require("../controllers/uploadController");

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

module.exports = router;
