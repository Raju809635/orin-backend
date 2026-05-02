const express = require("express");
const { verifyToken, authorizeRoles } = require("../middleware/authMiddleware");
const asyncHandler = require("../utils/asyncHandler");
const {
  getOverview,
  getClasses,
  getClassStudents,
  getTeachers,
  getReviews,
  getReports,
  getApprovals
} = require("../controllers/institutionManagementController");

const router = express.Router();

router.use(verifyToken, authorizeRoles("mentor"));

router.get("/overview", asyncHandler(getOverview));
router.get("/classes", asyncHandler(getClasses));
router.get("/classes/:className/students", asyncHandler(getClassStudents));
router.get("/teachers", asyncHandler(getTeachers));
router.get("/reviews", asyncHandler(getReviews));
router.get("/reports", asyncHandler(getReports));
router.get("/approvals", asyncHandler(getApprovals));

module.exports = router;
