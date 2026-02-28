const express = require("express");
const router = express.Router();
const { verifyToken, authorizeRoles } = require("../middleware/authMiddleware");
const validate = require("../middleware/validate");
const {
  createComplaintSchema,
  updateComplaintSchema
} = require("../validators/complaintValidator");
const {
  createComplaint,
  getMyComplaints,
  getAllComplaints,
  updateComplaintByAdmin
} = require("../controllers/complaintController");

router.post(
  "/",
  verifyToken,
  authorizeRoles("student"),
  validate(createComplaintSchema),
  createComplaint
);

router.get(
  "/me",
  verifyToken,
  authorizeRoles("student"),
  getMyComplaints
);

router.get(
  "/admin",
  verifyToken,
  authorizeRoles("admin"),
  getAllComplaints
);

router.patch(
  "/admin/:complaintId",
  verifyToken,
  authorizeRoles("admin"),
  validate(updateComplaintSchema),
  updateComplaintByAdmin
);

module.exports = router;
