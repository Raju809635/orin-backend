const express = require("express");
const router = express.Router();
const { verifyToken, authorizeRoles } = require("../middleware/authMiddleware");
const { getEmailSystemStatus, sendAdminTestEmail } = require("../controllers/emailAdminController");

router.get("/status", verifyToken, authorizeRoles("admin"), getEmailSystemStatus);
router.post("/test", verifyToken, authorizeRoles("admin"), sendAdminTestEmail);

module.exports = router;
