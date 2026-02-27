const express = require("express");
const router = express.Router();
const { verifyToken, authorizeRoles } = require("../middleware/authMiddleware");
const { getStudentDashboard, getMentorDashboard } = require("../controllers/dashboardController");

router.get("/student", verifyToken, authorizeRoles("student"), getStudentDashboard);
router.get("/mentor", verifyToken, authorizeRoles("mentor"), getMentorDashboard);

module.exports = router;
