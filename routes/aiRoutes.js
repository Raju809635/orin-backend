const express = require("express");
const router = express.Router();
const { verifyToken, authorizeRoles } = require("../middleware/authMiddleware");
const validate = require("../middleware/validate");
const { aiChatSchema, aiConversationUpdateSchema } = require("../validators/aiValidator");
const {
  chatWithAi,
  generateHighSchoolSubjectGapQuiz,
  analyzeHighSchoolSubjectGap,
  generateHighSchoolStudyRoadmap,
  generateHighSchoolStudyAssistantAnswer,
  chatWithHighSchoolAssistant,
  getHighSchoolStudyProfile,
  getHighSchoolAssistantHistory,
  getHighSchoolAssistantConversationMessages,
  updateHighSchoolAssistantConversation,
  deleteHighSchoolAssistantConversation,
  generateHighSchoolStudyPlanner,
  generateHighSchoolCareerExplorer,
  generateHighSchoolExamStrategy,
  generateHighSchoolSchoolProjects,
  getMyAiHistory,
  getAiConversationMessages,
  updateAiConversation,
  deleteAiConversation
} = require("../controllers/aiController");

router.get("/history", verifyToken, authorizeRoles("student", "mentor"), getMyAiHistory);
router.get("/conversations/:conversationId", verifyToken, authorizeRoles("student", "mentor"), getAiConversationMessages);
router.patch(
  "/conversations/:conversationId",
  verifyToken,
  authorizeRoles("student", "mentor"),
  validate(aiConversationUpdateSchema),
  updateAiConversation
);
router.delete("/conversations/:conversationId", verifyToken, authorizeRoles("student", "mentor"), deleteAiConversation);
router.get("/highschool/assistant/history", verifyToken, authorizeRoles("student"), getHighSchoolAssistantHistory);
router.get(
  "/highschool/assistant/conversations/:conversationId",
  verifyToken,
  authorizeRoles("student"),
  getHighSchoolAssistantConversationMessages
);
router.patch(
  "/highschool/assistant/conversations/:conversationId",
  verifyToken,
  authorizeRoles("student"),
  validate(aiConversationUpdateSchema),
  updateHighSchoolAssistantConversation
);
router.delete(
  "/highschool/assistant/conversations/:conversationId",
  verifyToken,
  authorizeRoles("student"),
  deleteHighSchoolAssistantConversation
);
router.post("/highschool/assistant/chat", verifyToken, authorizeRoles("student"), chatWithHighSchoolAssistant);
router.post(
  "/highschool/subject-gap/quiz",
  verifyToken,
  authorizeRoles("student"),
  generateHighSchoolSubjectGapQuiz
);
router.post(
  "/highschool/subject-gap/analyze",
  verifyToken,
  authorizeRoles("student"),
  analyzeHighSchoolSubjectGap
);
router.post(
  "/highschool/study-roadmap",
  verifyToken,
  authorizeRoles("student"),
  generateHighSchoolStudyRoadmap
);
router.post(
  "/highschool/study-assistant",
  verifyToken,
  authorizeRoles("student"),
  generateHighSchoolStudyAssistantAnswer
);
router.get(
  "/highschool/study-profile",
  verifyToken,
  authorizeRoles("student"),
  getHighSchoolStudyProfile
);
router.post(
  "/highschool/study-planner",
  verifyToken,
  authorizeRoles("student"),
  generateHighSchoolStudyPlanner
);
router.post(
  "/highschool/career-explorer",
  verifyToken,
  authorizeRoles("student"),
  generateHighSchoolCareerExplorer
);
router.post(
  "/highschool/exam-strategy",
  verifyToken,
  authorizeRoles("student"),
  generateHighSchoolExamStrategy
);
router.post(
  "/highschool/school-projects",
  verifyToken,
  authorizeRoles("student"),
  generateHighSchoolSchoolProjects
);
router.post(
  "/chat",
  verifyToken,
  authorizeRoles("student", "mentor"),
  validate(aiChatSchema),
  chatWithAi
);

module.exports = router;
