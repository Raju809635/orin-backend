const express = require("express");
const router = express.Router();
const { verifyToken, authorizeRoles } = require("../middleware/authMiddleware");
const validate = require("../middleware/validate");
const { sendMessageToAdminSchema } = require("../validators/messageValidator");
const {
  getMyMessages,
  sendMessageToAdmin,
  getMyNotifications,
  markNotificationRead
} = require("../controllers/messageController");

router.get("/me", verifyToken, getMyMessages);
router.get("/notifications", verifyToken, getMyNotifications);
router.patch("/notifications/:id/read", verifyToken, markNotificationRead);
router.post(
  "/admin",
  verifyToken,
  authorizeRoles("mentor", "student"),
  validate(sendMessageToAdminSchema),
  sendMessageToAdmin
);

module.exports = router;
