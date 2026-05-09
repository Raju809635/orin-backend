const express = require("express");
const router = express.Router();
const { verifyToken, authorizeRoles } = require("../middleware/authMiddleware");
const {
  getSubscriptionPlans,
  getMySubscription,
  recordGooglePlayPurchase
} = require("../controllers/subscriptionController");

router.get("/plans", getSubscriptionPlans);
router.get("/me", verifyToken, authorizeRoles("student", "mentor"), getMySubscription);
router.post("/google-play/purchase", verifyToken, authorizeRoles("student"), recordGooglePlayPurchase);

module.exports = router;
