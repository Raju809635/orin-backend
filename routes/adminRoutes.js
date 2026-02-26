const express = require("express");
const router = express.Router();
const { verifyToken, authorizeRoles } = require("../middleware/authMiddleware");
const { getPendingMentors, approveMentor } = require("../controllers/adminController");

router.get("/pending-mentors", verifyToken, authorizeRoles("admin"), getPendingMentors);
router.put("/approve/:id", verifyToken, authorizeRoles("admin"), approveMentor);

module.exports = router;
