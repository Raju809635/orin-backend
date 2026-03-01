const express = require("express");
const router = express.Router();
const { verifyToken, authorizeRoles } = require("../middleware/authMiddleware");
const validate = require("../middleware/validate");
const {
  bookSessionSchema,
  rescheduleSessionSchema,
  createSessionOrderSchema,
  verifySessionPaymentSchema,
  submitManualPaymentSchema,
  reviewManualPaymentSchema,
  updateMeetingLinkSchema
} = require("../validators/schedulingValidator");
const {
  bookSession,
  createSessionOrder,
  verifySessionPayment,
  submitManualPaymentProof,
  getPendingManualPayments,
  reviewManualPayment,
  approveSession,
  rejectSession,
  cancelSession,
  rescheduleSession,
  updateSessionMeetingLink,
  getStudentSessions,
  getMentorSessions
} = require("../controllers/sessionController");
const { uploadPaymentScreenshot } = require("../middleware/uploadMiddleware");

router.post("/create-order", verifyToken, authorizeRoles("student"), validate(createSessionOrderSchema), createSessionOrder);
router.post("/verify-payment", verifyToken, authorizeRoles("student"), validate(verifySessionPaymentSchema), verifySessionPayment);
router.post(
  "/:id/manual-payment",
  verifyToken,
  authorizeRoles("student"),
  (req, res, next) => {
    uploadPaymentScreenshot(req, res, (error) => {
      if (error) return next(error);
      return next();
    });
  },
  validate(submitManualPaymentSchema),
  submitManualPaymentProof
);
router.get("/admin/manual-payments", verifyToken, authorizeRoles("admin"), getPendingManualPayments);
router.patch(
  "/admin/manual-payments/:id/review",
  verifyToken,
  authorizeRoles("admin"),
  validate(reviewManualPaymentSchema),
  reviewManualPayment
);
router.post("/book", verifyToken, authorizeRoles("student"), validate(bookSessionSchema), bookSession);
router.patch("/:id/approve", verifyToken, authorizeRoles("mentor"), approveSession);
router.patch("/:id/reject", verifyToken, authorizeRoles("mentor"), rejectSession);
router.patch("/:id/cancel", verifyToken, authorizeRoles("student", "mentor"), cancelSession);
router.patch("/:id/reschedule", verifyToken, authorizeRoles("student", "mentor"), validate(rescheduleSessionSchema), rescheduleSession);
router.patch("/:id/meeting-link", verifyToken, authorizeRoles("mentor"), validate(updateMeetingLinkSchema), updateSessionMeetingLink);
router.get("/student/me", verifyToken, authorizeRoles("student"), getStudentSessions);
router.get("/mentor/me", verifyToken, authorizeRoles("mentor"), getMentorSessions);

module.exports = router;
