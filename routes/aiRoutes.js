const express = require("express");
const router = express.Router();
const { verifyToken, authorizeRoles } = require("../middleware/authMiddleware");
const validate = require("../middleware/validate");
const { aiChatSchema, aiConversationUpdateSchema } = require("../validators/aiValidator");
const {
  chatWithAi,
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
  "/chat",
  verifyToken,
  authorizeRoles("student", "mentor"),
  validate(aiChatSchema),
  chatWithAi
);

module.exports = router;
