const express = require("express");
const router = express.Router();
const { verifyToken, authorizeRoles } = require("../middleware/authMiddleware");
const validate = require("../middleware/validate");
const { sendNotificationSchema, sendMentorMessageSchema, reviewCollaborateSchema } = require("../validators/adminValidator");
const {
  getPendingMentors,
  approveMentor,
  getStudents,
  getDemographics,
  sendNotification,
  getNotifications,
  getAuditLogs,
  getMentorProfiles,
  sendMentorDirectMessage,
  getCollaborateApplications,
  reviewCollaborateApplication,
  getNetworkAdminOverview,
  getNetworkAdminPosts,
  deleteNetworkPostByAdmin,
  getNetworkAdminConnections,
  getNetworkAdminFollows,
  getNetworkAdminMentorGroups,
  toggleNetworkAdminMentorGroup,
  getNetworkAdminLiveSessions,
  toggleNetworkAdminLiveSession,
  getNetworkAdminChallenges,
  toggleNetworkAdminChallenge
} = require("../controllers/adminController");

router.get("/pending-mentors", verifyToken, authorizeRoles("admin"), getPendingMentors);
router.put("/approve/:id", verifyToken, authorizeRoles("admin"), approveMentor);
router.get("/students", verifyToken, authorizeRoles("admin"), getStudents);
router.get("/mentors/profiles", verifyToken, authorizeRoles("admin"), getMentorProfiles);
router.get("/demographics", verifyToken, authorizeRoles("admin"), getDemographics);
router.get("/notifications", verifyToken, authorizeRoles("admin"), getNotifications);
router.get("/audit-logs", verifyToken, authorizeRoles("admin"), getAuditLogs);
router.get("/collaborate/applications", verifyToken, authorizeRoles("admin"), getCollaborateApplications);
router.patch(
  "/collaborate/applications/:id",
  verifyToken,
  authorizeRoles("admin"),
  validate(reviewCollaborateSchema),
  reviewCollaborateApplication
);
router.post(
  "/notifications",
  verifyToken,
  authorizeRoles("admin"),
  validate(sendNotificationSchema),
  sendNotification
);
router.post(
  "/messages/mentors",
  verifyToken,
  authorizeRoles("admin"),
  validate(sendMentorMessageSchema),
  sendMentorDirectMessage
);

router.get("/network/overview", verifyToken, authorizeRoles("admin"), getNetworkAdminOverview);
router.get("/network/posts", verifyToken, authorizeRoles("admin"), getNetworkAdminPosts);
router.delete("/network/posts/:postId", verifyToken, authorizeRoles("admin"), deleteNetworkPostByAdmin);
router.get("/network/connections", verifyToken, authorizeRoles("admin"), getNetworkAdminConnections);
router.get("/network/follows", verifyToken, authorizeRoles("admin"), getNetworkAdminFollows);
router.get("/network/mentor-groups", verifyToken, authorizeRoles("admin"), getNetworkAdminMentorGroups);
router.patch("/network/mentor-groups/:groupId/toggle", verifyToken, authorizeRoles("admin"), toggleNetworkAdminMentorGroup);
router.get("/network/live-sessions", verifyToken, authorizeRoles("admin"), getNetworkAdminLiveSessions);
router.patch("/network/live-sessions/:liveSessionId/toggle", verifyToken, authorizeRoles("admin"), toggleNetworkAdminLiveSession);
router.get("/network/challenges", verifyToken, authorizeRoles("admin"), getNetworkAdminChallenges);
router.patch("/network/challenges/:challengeId/toggle", verifyToken, authorizeRoles("admin"), toggleNetworkAdminChallenge);

module.exports = router;
