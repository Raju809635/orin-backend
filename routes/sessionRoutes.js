const express = require("express");
const router = express.Router();
const { verifyToken, authorizeRoles } = require("../middleware/authMiddleware");
const validate = require("../middleware/validate");
const { bookSessionSchema, rescheduleSessionSchema } = require("../validators/schedulingValidator");
const {
  bookSession,
  approveSession,
  rejectSession,
  cancelSession,
  rescheduleSession,
  getStudentSessions,
  getMentorSessions
} = require("../controllers/sessionController");

router.post("/book", verifyToken, authorizeRoles("student"), validate(bookSessionSchema), bookSession);
router.patch("/:id/approve", verifyToken, authorizeRoles("mentor"), approveSession);
router.patch("/:id/reject", verifyToken, authorizeRoles("mentor"), rejectSession);
router.patch("/:id/cancel", verifyToken, authorizeRoles("student", "mentor"), cancelSession);
router.patch("/:id/reschedule", verifyToken, authorizeRoles("student", "mentor"), validate(rescheduleSessionSchema), rescheduleSession);
router.get("/student/me", verifyToken, authorizeRoles("student"), getStudentSessions);
router.get("/mentor/me", verifyToken, authorizeRoles("mentor"), getMentorSessions);

module.exports = router;
