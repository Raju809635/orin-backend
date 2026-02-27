const express = require("express");
const router = express.Router();
const { verifyToken, authorizeAdmin } = require("../middleware/authMiddleware");
const validate = require("../middleware/validate");
const { sendNotificationSchema } = require("../validators/adminValidator");
const {
  getPendingMentors,
  approveMentor,
  getStudents,
  getDemographics,
  sendNotification,
  getNotifications,
  getAuditLogs,
  getApprovedMentors,
  getCollaborateApplications
} = require("../controllers/adminController");

router.get("/pending-mentors", verifyToken, authorizeAdmin, getPendingMentors);
router.get("/approved-mentors", verifyToken, authorizeAdmin, getApprovedMentors);
router.put("/approve/:id", verifyToken, authorizeAdmin, approveMentor);
router.get("/students", verifyToken, authorizeAdmin, getStudents);
router.get("/demographics", verifyToken, authorizeAdmin, getDemographics);
router.get("/notifications", verifyToken, authorizeAdmin, getNotifications);
router.get("/collaborate-applications", verifyToken, authorizeAdmin, getCollaborateApplications);
router.get("/audit-logs", verifyToken, authorizeAdmin, getAuditLogs);
router.post(
  "/notifications",
  verifyToken,
  authorizeAdmin,
  validate(sendNotificationSchema),
  sendNotification
);

module.exports = router;
