const express = require("express");
const router = express.Router();
const { verifyToken, authorizeRoles } = require("../middleware/authMiddleware");
const {
  getNetworkOverview,
  getConnections,
  sendConnectionRequest,
  respondConnectionRequest,
  toggleFollow,
  getFeed,
  getPublicFeed,
  createPost,
  deletePost,
  addComment,
  reactToPost,
  endorseSkill,
  getDailyDashboard,
  completeDailyTask,
  getSmartSuggestions,
  getCollegeNetwork,
  getMentorMatches,
  getSessionHistory,
  updateStudentSessionNote,
  submitMentorReview,
  getMentorReviews,
  getCareerRoadmap,
  getCareerOpportunities,
  getCollegeLeaderboard,
  getLiveSessions,
  createLiveSession,
  generateResume,
  getSkillGapAnalysis,
  getVerifiedMentors,
  getCommunityChallenges,
  joinCommunityChallenge,
  getOrinCertifications,
  getMentorGroups,
  joinMentorGroup,
  getProjectIdeas,
  getKnowledgeLibrary,
  getReputationSummary
} = require("../controllers/networkController");

router.get("/overview", verifyToken, authorizeRoles("student", "mentor"), getNetworkOverview);

router.get("/connections", verifyToken, authorizeRoles("student", "mentor"), getConnections);
router.post("/connections/request", verifyToken, authorizeRoles("student", "mentor"), sendConnectionRequest);
router.post(
  "/connections/:connectionId/respond",
  verifyToken,
  authorizeRoles("student", "mentor"),
  respondConnectionRequest
);

router.post("/follow/:userId", verifyToken, authorizeRoles("student", "mentor"), toggleFollow);

router.get("/feed", verifyToken, authorizeRoles("student", "mentor"), getFeed);
router.get("/feed/public", verifyToken, authorizeRoles("student", "mentor"), getPublicFeed);
router.post("/feed", verifyToken, authorizeRoles("student", "mentor"), createPost);
router.delete("/feed/:postId", verifyToken, authorizeRoles("student", "mentor"), deletePost);
router.post("/feed/:postId/comment", verifyToken, authorizeRoles("student", "mentor"), addComment);
router.post("/feed/:postId/react", verifyToken, authorizeRoles("student", "mentor"), reactToPost);

router.post("/endorse/:userId", verifyToken, authorizeRoles("student", "mentor"), endorseSkill);

router.get("/daily-dashboard", verifyToken, authorizeRoles("student", "mentor"), getDailyDashboard);
router.post("/daily-task/complete", verifyToken, authorizeRoles("student", "mentor"), completeDailyTask);

router.get("/suggestions", verifyToken, authorizeRoles("student", "mentor"), getSmartSuggestions);
router.get("/college-network", verifyToken, authorizeRoles("student", "mentor"), getCollegeNetwork);
router.get("/mentor-matches", verifyToken, authorizeRoles("student"), getMentorMatches);
router.get("/session-history", verifyToken, authorizeRoles("student"), getSessionHistory);
router.patch("/session-history/:sessionId/note", verifyToken, authorizeRoles("student"), updateStudentSessionNote);
router.post("/sessions/:sessionId/review", verifyToken, authorizeRoles("student"), submitMentorReview);
router.get("/mentors/:mentorId/reviews", verifyToken, authorizeRoles("student", "mentor"), getMentorReviews);
router.get("/career-roadmap", verifyToken, authorizeRoles("student"), getCareerRoadmap);
router.get("/opportunities", verifyToken, authorizeRoles("student", "mentor"), getCareerOpportunities);
router.get("/leaderboard", verifyToken, authorizeRoles("student", "mentor"), getCollegeLeaderboard);
router.get("/live-sessions", verifyToken, authorizeRoles("student", "mentor"), getLiveSessions);
router.post("/live-sessions", verifyToken, authorizeRoles("mentor"), createLiveSession);
router.get("/resume/generate", verifyToken, authorizeRoles("student"), generateResume);
router.get("/skill-gap", verifyToken, authorizeRoles("student"), getSkillGapAnalysis);
router.get("/verified-mentors", verifyToken, authorizeRoles("student", "mentor"), getVerifiedMentors);
router.get("/challenges", verifyToken, authorizeRoles("student", "mentor"), getCommunityChallenges);
router.post("/challenges/:challengeId/join", verifyToken, authorizeRoles("student"), joinCommunityChallenge);
router.get("/certifications", verifyToken, authorizeRoles("student", "mentor"), getOrinCertifications);
router.get("/mentor-groups", verifyToken, authorizeRoles("student", "mentor"), getMentorGroups);
router.post("/mentor-groups/:groupId/join", verifyToken, authorizeRoles("student"), joinMentorGroup);
router.get("/project-ideas", verifyToken, authorizeRoles("student"), getProjectIdeas);
router.get("/knowledge-library", verifyToken, authorizeRoles("student", "mentor"), getKnowledgeLibrary);
router.get("/reputation-summary", verifyToken, authorizeRoles("student", "mentor"), getReputationSummary);

module.exports = router;
