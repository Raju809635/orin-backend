const express = require("express");
const router = express.Router();
const { verifyToken, authorizeRoles } = require("../middleware/authMiddleware");
const validate = require("../middleware/validate");
const { sendNotificationSchema } = require("../validators/adminValidator");
const {
  getPendingMentors,
  approveMentor,
  getStudents,
  getDemographics,
  sendNotification,
  getNotifications,
  getAuditLogs
} = require("../controllers/adminController");

router.get("/pending-mentors", verifyToken, authorizeRoles("admin"), getPendingMentors);
router.put("/approve/:id", verifyToken, authorizeRoles("admin"), approveMentor);
router.get("/students", verifyToken, authorizeRoles("admin"), getStudents);
router.get("/demographics", verifyToken, authorizeRoles("admin"), getDemographics);
router.get("/notifications", verifyToken, authorizeRoles("admin"), getNotifications);
router.get("/audit-logs", verifyToken, authorizeRoles("admin"), getAuditLogs);
router.post(
  "/notifications",
  verifyToken,
  authorizeRoles("admin"),
  validate(sendNotificationSchema),
  sendNotification
);

module.exports = router;
