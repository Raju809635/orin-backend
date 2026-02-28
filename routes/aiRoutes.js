const express = require("express");
const router = express.Router();
const { verifyToken, authorizeRoles } = require("../middleware/authMiddleware");
const validate = require("../middleware/validate");
const { aiChatSchema } = require("../validators/aiValidator");
const { chatWithAi } = require("../controllers/aiController");

router.post(
  "/chat",
  verifyToken,
  authorizeRoles("student", "mentor"),
  validate(aiChatSchema),
  chatWithAi
);

module.exports = router;
