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
  getCollegeNetwork
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

module.exports = router;
