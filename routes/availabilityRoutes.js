const express = require("express");
const router = express.Router();
const { verifyToken, authorizeRoles } = require("../middleware/authMiddleware");
const validate = require("../middleware/validate");
const {
  createAvailabilitySchema,
  updateAvailabilitySchema,
  blockDateSchema
} = require("../validators/schedulingValidator");
const {
  createAvailability,
  updateAvailability,
  blockDate,
  getMentorAvailability
} = require("../controllers/availabilityController");

router.post("/", verifyToken, authorizeRoles("mentor"), validate(createAvailabilitySchema), createAvailability);
router.patch("/:id", verifyToken, authorizeRoles("mentor"), validate(updateAvailabilitySchema), updateAvailability);
router.post("/block-date", verifyToken, authorizeRoles("mentor"), validate(blockDateSchema), blockDate);
router.get("/mentor/:mentorId", getMentorAvailability);

module.exports = router;
