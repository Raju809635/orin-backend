const express = require("express");
const router = express.Router();
const User = require("../models/User");
const MentorProfile = require("../models/MentorProfile");
const { verifyToken, authorizeRoles } = require("../middleware/authMiddleware");
const validate = require("../middleware/validate");
const { updateMentorProfileSchema } = require("../validators/mentorValidator");
const {
  getMyMentorProfile,
  updateMyMentorProfile,
  getPublicMentorProfile
} = require("../controllers/mentorController");

router.get("/filter", async (req, res) => {
  try {
    const primary = decodeURIComponent(req.query.primary || "").trim();
    const sub = decodeURIComponent(req.query.sub || "").trim();
    const spec = decodeURIComponent(req.query.spec || "").trim();

    const filter = {
      role: "mentor",
      approvalStatus: "approved"
    };

    if (primary) filter.primaryCategory = primary;
    if (sub) filter.subCategory = sub;
    if (spec) filter.specializations = spec;

    const mentors = await User.find(filter)
      .select(
        "name email role approvalStatus primaryCategory subCategory specializations bio expertise sessionPrice availability createdAt updatedAt"
      )
      .lean();

    const mentorIds = mentors.map((mentor) => mentor._id);
    const profiles = await MentorProfile.find({ userId: { $in: mentorIds } })
      .select("userId profilePhotoUrl title rating verifiedBadge rankingTier")
      .lean();

    const profileByUserId = new Map(
      profiles.map((profile) => [profile.userId.toString(), profile])
    );

    const merged = mentors.map((mentor) => {
      const profile = profileByUserId.get(mentor._id.toString());
      return {
        ...mentor,
        profilePhotoUrl: profile?.profilePhotoUrl || "",
        title: profile?.title || "",
        rating: profile?.rating || 0,
        verifiedBadge: Boolean(profile?.verifiedBadge),
        rankingTier: profile?.rankingTier || ""
      };
    });

    return res.status(200).json(merged);
  } catch (error) {
    console.error("[MENTOR_ROUTE_ERROR]", error);
    return res.status(500).json({ message: "Failed to fetch mentors by filters" });
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
