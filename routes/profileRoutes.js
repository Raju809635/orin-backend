const express = require("express");
const router = express.Router();
const { verifyToken, authorizeRoles } = require("../middleware/authMiddleware");
const validate = require("../middleware/validate");
const {
  studentProfileUpdateSchema,
  mentorProfileUpdateSchema
} = require("../validators/profileValidator");
const {
  getMyStudentProfile,
  updateMyStudentProfile,
  getMyMentorProfileV2,
  updateMyMentorProfileV2,
  getPublicMentorProfileV2
} = require("../controllers/profileController");

router.get("/student/me", verifyToken, authorizeRoles("student"), getMyStudentProfile);
router.patch(
  "/student/me",
  verifyToken,
  authorizeRoles("student"),
  validate(studentProfileUpdateSchema),
  updateMyStudentProfile
);

router.get("/mentor/me", verifyToken, authorizeRoles("mentor"), getMyMentorProfileV2);
router.patch(
  "/mentor/me",
  verifyToken,
  authorizeRoles("mentor"),
  validate(mentorProfileUpdateSchema),
  updateMyMentorProfileV2
);

router.get("/mentor/:mentorUserId", getPublicMentorProfileV2);

module.exports = router;
