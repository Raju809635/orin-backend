const express = require("express");
const router = express.Router();
const { verifyToken, authorizeRoles } = require("../middleware/authMiddleware");
const validate = require("../middleware/validate");
const { sendMessageToAdminSchema, pushTokenSchema } = require("../validators/messageValidator");
const {
  getMyMessages,
  sendMessageToAdmin,
  getMyNotifications,
  markNotificationRead,
  registerPushToken,
  unregisterPushToken,
  sendTestPushNotification
} = require("../controllers/messageController");

router.get("/me", verifyToken, getMyMessages);
router.get("/notifications", verifyToken, getMyNotifications);
router.patch("/notifications/:id/read", verifyToken, markNotificationRead);
router.post("/notifications/test-push", verifyToken, sendTestPushNotification);
router.post("/push-token", verifyToken, validate(pushTokenSchema), registerPushToken);
router.delete("/push-token", verifyToken, validate(pushTokenSchema), unregisterPushToken);
router.post(
  "/admin",
  verifyToken,
  authorizeRoles("mentor", "student"),
  validate(sendMessageToAdminSchema),
  sendMessageToAdmin
);

module.exports = router;
