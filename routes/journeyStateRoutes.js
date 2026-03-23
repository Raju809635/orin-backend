const express = require("express");
const router = express.Router();
const { verifyToken, authorizeRoles } = require("../middleware/authMiddleware");
const {
  getMyJourneyState,
  patchJourneyGoal,
  patchJourneySkills,
  recomputeMyJourneyState
} = require("../controllers/journeyStateController");

router.get("/me", verifyToken, authorizeRoles("student", "mentor"), getMyJourneyState);
router.patch("/goal", verifyToken, authorizeRoles("student", "mentor"), patchJourneyGoal);
router.patch("/skills", verifyToken, authorizeRoles("student", "mentor"), patchJourneySkills);
router.post("/recompute", verifyToken, authorizeRoles("student", "mentor"), recomputeMyJourneyState);

module.exports = router;
