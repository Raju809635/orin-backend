const express = require("express");
const router = express.Router();
const { verifyToken, authorizeRoles } = require("../middleware/authMiddleware");
const validate = require("../middleware/validate");
const {
  bookSessionSchema,
  rescheduleSessionSchema,
  createSessionOrderSchema,
  verifySessionPaymentSchema,
  updateMeetingLinkSchema
} = require("../validators/schedulingValidator");
const {
  bookSession,
  createSessionOrder,
  verifySessionPayment,
  approveSession,
  rejectSession,
  cancelSession,
  rescheduleSession,
  updateSessionMeetingLink,
  getStudentSessions,
  getMentorSessions
} = require("../controllers/sessionController");

router.post("/create-order", verifyToken, authorizeRoles("student"), validate(createSessionOrderSchema), createSessionOrder);
router.post("/verify-payment", verifyToken, authorizeRoles("student"), validate(verifySessionPaymentSchema), verifySessionPayment);
router.post("/book", verifyToken, authorizeRoles("student"), validate(bookSessionSchema), bookSession);
router.patch("/:id/approve", verifyToken, authorizeRoles("mentor"), approveSession);
router.patch("/:id/reject", verifyToken, authorizeRoles("mentor"), rejectSession);
router.patch("/:id/cancel", verifyToken, authorizeRoles("student", "mentor"), cancelSession);
router.patch("/:id/reschedule", verifyToken, authorizeRoles("student", "mentor"), validate(rescheduleSessionSchema), rescheduleSession);
router.patch("/:id/meeting-link", verifyToken, authorizeRoles("mentor"), validate(updateMeetingLinkSchema), updateSessionMeetingLink);
router.get("/student/me", verifyToken, authorizeRoles("student"), getStudentSessions);
router.get("/mentor/me", verifyToken, authorizeRoles("mentor"), getMentorSessions);

module.exports = router;
