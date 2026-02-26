const express = require("express");
const router = express.Router();

const { verifyToken, authorizeRoles } = require("../middleware/authMiddleware");
const validate = require("../middleware/validate");
const {
  createBookingSchema,
  updateBookingStatusSchema
} = require("../validators/bookingValidator");
const {
  createBooking,
  getMentorBookings,
  getStudentBookings,
  updateBookingStatus
} = require("../controllers/bookingController");

router.post(
  "/",
  verifyToken,
  authorizeRoles("student"),
  validate(createBookingSchema),
  createBooking
);

router.get("/mentor", verifyToken, authorizeRoles("mentor"), getMentorBookings);
router.get("/student", verifyToken, authorizeRoles("student"), getStudentBookings);
router.patch(
  "/:bookingId/status",
  verifyToken,
  authorizeRoles("mentor"),
  validate(updateBookingStatusSchema),
  updateBookingStatus
);

module.exports = router;
