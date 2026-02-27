const express = require("express");
const router = express.Router();
const User = require("../models/User");
const { verifyToken, authorizeRoles } = require("../middleware/authMiddleware");
const validate = require("../middleware/validate");
const { updateMentorProfileSchema } = require("../validators/mentorValidator");
const {
  getMyMentorProfile,
  updateMyMentorProfile,
  getPublicMentorProfile
} = require("../controllers/mentorController");

router.get("/by-domain/:domain", async (req, res) => {
  try {
    const domain = decodeURIComponent(req.params.domain || "").trim();

    if (!domain) {
      return res.status(400).json({ message: "Domain is required" });
    }

    const mentors = await User.find({
      role: "mentor",
      status: "approved",
      domain
    })
      .select("name email role status domain bio expertise createdAt updatedAt")
      .lean();

    return res.status(200).json(mentors);
  } catch (error) {
    console.error("[MENTOR_ROUTE_ERROR]", error);
    return res.status(500).json({ message: "Failed to fetch mentors by domain" });
  }
});

router.get("/me/profile", verifyToken, authorizeRoles("mentor"), getMyMentorProfile);
router.patch(
  "/me/profile",
  verifyToken,
  authorizeRoles("mentor"),
  validate(updateMentorProfileSchema),
  updateMyMentorProfile
);

router.get("/:mentorId", getPublicMentorProfile);

module.exports = router;
