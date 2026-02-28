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

async function fetchApprovedMentors(filters = {}) {
  const matchStage = {};

  if (filters.primaryCategory) {
    matchStage.primaryCategory = filters.primaryCategory;
  }

  if (filters.subCategory) {
    matchStage.subCategory = filters.subCategory;
  }

  if (filters.specialization) {
    matchStage.specializations = filters.specialization;
  }

  const pipeline = [
    { $match: matchStage },
    {
      $lookup: {
        from: "users",
        localField: "userId",
        foreignField: "_id",
        as: "user"
      }
    },
    { $unwind: "$user" },
    {
      $match: {
        "user.role": "mentor",
        "user.status": "approved",
        "user.isDeleted": { $ne: true }
      }
    },
    {
      $project: {
        _id: "$user._id",
        name: "$user.name",
        email: "$user.email",
        role: "$user.role",
        status: "$user.status",
        profilePhotoUrl: "$profilePhotoUrl",
        primaryCategory: "$primaryCategory",
        subCategory: "$subCategory",
        specializations: "$specializations",
        sessionPrice: "$sessionPrice",
        rating: "$rating",
        totalSessionsConducted: "$totalSessionsConducted",
        updatedAt: "$updatedAt"
      }
    },
    { $sort: { rating: -1, totalSessionsConducted: -1, updatedAt: -1 } }
  ];

  return MentorProfile.aggregate(pipeline);
}

router.get("/", async (req, res) => {
  try {
    const mentors = await fetchApprovedMentors();
    return res.status(200).json(mentors);
  } catch (error) {
    console.error("[MENTOR_ROUTE_ERROR]", error);
    return res.status(500).json({ message: "Failed to fetch mentors" });
  }
});

router.get("/filter", async (req, res) => {
  try {
    const primaryCategory = (req.query.primary || "").toString().trim();
    const subCategory = (req.query.sub || "").toString().trim();
    const specialization = (req.query.spec || "").toString().trim();

    const mentors = await fetchApprovedMentors({
      primaryCategory: primaryCategory || undefined,
      subCategory: subCategory || undefined,
      specialization: specialization || undefined
    });

    return res.status(200).json(mentors);
  } catch (error) {
    console.error("[MENTOR_ROUTE_ERROR]", error);
    return res.status(500).json({ message: "Failed to filter mentors" });
  }
});

router.get("/by-domain/:domain", async (req, res) => {
  try {
    const primaryCategory = decodeURIComponent(req.params.domain || "").trim();

    if (!primaryCategory) {
      return res.status(400).json({ message: "Domain is required" });
    }

    const mentors = await fetchApprovedMentors({ primaryCategory });
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
