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
  generateHighSchoolStudyPlanner,
  generateHighSchoolExamStrategy,
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
router.post(
  "/highschool/study-planner",
  verifyToken,
  authorizeRoles("student"),
  generateHighSchoolStudyPlanner
);
router.post(
  "/highschool/exam-strategy",
  verifyToken,
  authorizeRoles("student"),
  generateHighSchoolExamStrategy
);
router.post(
  "/chat",
  verifyToken,
  authorizeRoles("student", "mentor"),
  validate(aiChatSchema),
  chatWithAi
);

module.exports = router;
