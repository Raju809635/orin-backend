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
  getNetworkAdminLiveSessionBookings,
  toggleNetworkAdminLiveSession,
  reviewNetworkAdminLiveSession,
  deleteNetworkAdminLiveSession,
  getNetworkAdminSprints,
  toggleNetworkAdminSprint,
  reviewNetworkAdminSprint,
  deleteNetworkAdminSprint,
  getNetworkAdminSprintPayouts,
  markNetworkAdminSprintPayoutPaid,
  getNetworkAdminChallenges,
  getNetworkAdminChallengeSubmissions,
  toggleNetworkAdminChallenge,
  createNetworkAdminChallenge,
  updateNetworkAdminChallenge,
  deleteNetworkAdminChallenge,
  getNetworkAdminOpportunities,
  toggleNetworkAdminOpportunity,
  createNetworkAdminOpportunity,
  deleteNetworkAdminOpportunity,
  getNetworkAdminKnowledgeResources,
  reviewNetworkAdminKnowledgeResource,
  createNetworkAdminKnowledgeResource,
  deleteNetworkAdminKnowledgeResource,
  getNetworkAdminCertificationTracks,
  getNetworkAdminCertificateTemplates,
  toggleNetworkAdminCertificationTrack,
  createNetworkAdminCertificationTrack,
  createNetworkAdminCertificateTemplate,
  getNetworkAdminCertificationRequests,
  reviewNetworkAdminCertificationRequest,
  issueNetworkAdminCertificate,
  issueNetworkAdminCertificatesBulk,
  getNetworkAdminBootcamps,
  createNetworkAdminBootcamp,
  toggleNetworkAdminBootcamp
} = require("../controllers/adminController");
const {
  getAppMetricsSummary,
  getAppMetricsCountries,
  getAppMetricsDevices,
  getAppMetricsVersions,
  getAppMetricsActivity
} = require("../controllers/appMetricsController");

router.get("/pending-mentors", verifyToken, authorizeRoles("admin"), getPendingMentors);
router.put("/approve/:id", verifyToken, authorizeRoles("admin"), approveMentor);
router.get("/students", verifyToken, authorizeRoles("admin"), getStudents);
router.get("/mentors/profiles", verifyToken, authorizeRoles("admin"), getMentorProfiles);
router.get("/demographics", verifyToken, authorizeRoles("admin"), getDemographics);
router.get("/app-metrics/summary", verifyToken, authorizeRoles("admin"), getAppMetricsSummary);
router.get("/app-metrics/countries", verifyToken, authorizeRoles("admin"), getAppMetricsCountries);
router.get("/app-metrics/devices", verifyToken, authorizeRoles("admin"), getAppMetricsDevices);
router.get("/app-metrics/versions", verifyToken, authorizeRoles("admin"), getAppMetricsVersions);
router.get("/app-metrics/activity", verifyToken, authorizeRoles("admin"), getAppMetricsActivity);
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
router.get("/network/live-sessions/bookings", verifyToken, authorizeRoles("admin"), getNetworkAdminLiveSessionBookings);
router.patch("/network/live-sessions/:liveSessionId/toggle", verifyToken, authorizeRoles("admin"), toggleNetworkAdminLiveSession);
router.patch("/network/live-sessions/:liveSessionId/review", verifyToken, authorizeRoles("admin"), reviewNetworkAdminLiveSession);
router.delete("/network/live-sessions/:liveSessionId", verifyToken, authorizeRoles("admin"), deleteNetworkAdminLiveSession);
router.get("/network/sprints", verifyToken, authorizeRoles("admin"), getNetworkAdminSprints);
router.patch("/network/sprints/:sprintId/toggle", verifyToken, authorizeRoles("admin"), toggleNetworkAdminSprint);
router.patch("/network/sprints/:sprintId/review", verifyToken, authorizeRoles("admin"), reviewNetworkAdminSprint);
router.delete("/network/sprints/:sprintId", verifyToken, authorizeRoles("admin"), deleteNetworkAdminSprint);
router.get("/network/sprint-payouts", verifyToken, authorizeRoles("admin"), getNetworkAdminSprintPayouts);
router.patch("/network/sprint-payouts/:enrollmentId/pay", verifyToken, authorizeRoles("admin"), markNetworkAdminSprintPayoutPaid);
router.get("/network/challenges", verifyToken, authorizeRoles("admin"), getNetworkAdminChallenges);
router.get(
  "/network/challenges/:challengeId/submissions",
  verifyToken,
  authorizeRoles("admin"),
  getNetworkAdminChallengeSubmissions
);
router.patch("/network/challenges/:challengeId/toggle", verifyToken, authorizeRoles("admin"), toggleNetworkAdminChallenge);
router.post("/network/challenges", verifyToken, authorizeRoles("admin"), createNetworkAdminChallenge);
router.patch("/network/challenges/:challengeId", verifyToken, authorizeRoles("admin"), updateNetworkAdminChallenge);
router.delete("/network/challenges/:challengeId", verifyToken, authorizeRoles("admin"), deleteNetworkAdminChallenge);

router.get("/network/opportunities", verifyToken, authorizeRoles("admin"), getNetworkAdminOpportunities);
router.post("/network/opportunities", verifyToken, authorizeRoles("admin"), createNetworkAdminOpportunity);
router.patch("/network/opportunities/:opportunityId/toggle", verifyToken, authorizeRoles("admin"), toggleNetworkAdminOpportunity);
router.delete("/network/opportunities/:opportunityId", verifyToken, authorizeRoles("admin"), deleteNetworkAdminOpportunity);

router.get("/network/bootcamps", verifyToken, authorizeRoles("admin"), getNetworkAdminBootcamps);
router.post("/network/bootcamps", verifyToken, authorizeRoles("admin"), createNetworkAdminBootcamp);
router.patch("/network/bootcamps/:bootcampId/toggle", verifyToken, authorizeRoles("admin"), toggleNetworkAdminBootcamp);

router.get("/network/knowledge-resources", verifyToken, authorizeRoles("admin"), getNetworkAdminKnowledgeResources);
router.post("/network/knowledge-resources", verifyToken, authorizeRoles("admin"), createNetworkAdminKnowledgeResource);
router.patch("/network/knowledge-resources/:resourceId/review", verifyToken, authorizeRoles("admin"), reviewNetworkAdminKnowledgeResource);
router.delete("/network/knowledge-resources/:resourceId", verifyToken, authorizeRoles("admin"), deleteNetworkAdminKnowledgeResource);

router.get("/network/certification-tracks", verifyToken, authorizeRoles("admin"), getNetworkAdminCertificationTracks);
router.get("/network/certificate-templates", verifyToken, authorizeRoles("admin"), getNetworkAdminCertificateTemplates);
router.post("/network/certificate-templates", verifyToken, authorizeRoles("admin"), createNetworkAdminCertificateTemplate);
router.post("/network/certification-tracks", verifyToken, authorizeRoles("admin"), createNetworkAdminCertificationTrack);
router.patch("/network/certification-tracks/:trackId/toggle", verifyToken, authorizeRoles("admin"), toggleNetworkAdminCertificationTrack);

router.get("/network/certification-requests", verifyToken, authorizeRoles("admin"), getNetworkAdminCertificationRequests);
router.patch("/network/certification-requests/:requestId/review", verifyToken, authorizeRoles("admin"), reviewNetworkAdminCertificationRequest);
router.post("/network/certificates/issue", verifyToken, authorizeRoles("admin"), issueNetworkAdminCertificate);
router.post("/network/certificates/issue-bulk", verifyToken, authorizeRoles("admin"), issueNetworkAdminCertificatesBulk);

module.exports = router;
