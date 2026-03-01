const express = require("express");
const router = express.Router();
const { verifyToken, authorizeRoles } = require("../middleware/authMiddleware");
const validate = require("../middleware/validate");
const { sendChatMessageSchema } = require("../validators/chatValidator");
const {
  getConversations,
  getMessagesWithUser,
  sendMessage,
  markConversationRead
} = require("../controllers/chatController");

router.use(verifyToken, authorizeRoles("student", "mentor", "admin"));

router.get("/conversations", getConversations);
router.get("/messages/:userId", getMessagesWithUser);
router.post("/messages/:userId", validate(sendChatMessageSchema), sendMessage);
router.patch("/messages/:userId/read", markConversationRead);

module.exports = router;
