const express = require("express");
const router = express.Router();
const { verifyToken, authorizeRoles } = require("../middleware/authMiddleware");
const validate = require("../middleware/validate");
const { sendChatMessageSchema, updateChatMessageSchema } = require("../validators/chatValidator");
const {
  getConversations,
  getMessagesWithUser,
  sendMessage,
  updateMessage,
  deleteMessage,
  markConversationRead,
  setTypingIndicator,
  getTypingIndicator
} = require("../controllers/chatController");

router.use(verifyToken, authorizeRoles("student", "mentor", "admin"));

router.get("/conversations", getConversations);
router.get("/messages/:userId", getMessagesWithUser);
router.post("/messages/:userId", validate(sendChatMessageSchema), sendMessage);
router.patch("/messages/item/:messageId", validate(updateChatMessageSchema), updateMessage);
router.delete("/messages/item/:messageId", deleteMessage);
router.patch("/messages/:userId/read", markConversationRead);
router.get("/messages/:userId/typing", getTypingIndicator);
router.post("/messages/:userId/typing", setTypingIndicator);

module.exports = router;
