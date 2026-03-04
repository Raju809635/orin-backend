const StudentProfile = require("../models/StudentProfile");
const MentorProfile = require("../models/MentorProfile");
const User = require("../models/User");
const Connection = require("../models/Connection");
const UserFollow = require("../models/UserFollow");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { createAuditLog } = require("../services/auditService");
const {
  getMentorCategoryOptions,
  isValidMentorCategorySelection
} = require("../config/mentorCategories");

function computeProfileCompleteness(fields) {
  let score = 0;
  fields.forEach((field) => {
    if (Array.isArray(field) && field.length > 0) score += 1;
    else if (typeof field === "string" && field.trim().length > 0) score += 1;
    else if (typeof field === "number" && field > 0) score += 1;
    else if (typeof field === "boolean" && field) score += 1;
  });

  return Math.round((score / fields.length) * 100);
}

exports.getMyStudentProfile = asyncHandler(async (req, res) => {
  const user = await User.findOne({ _id: req.user.id, role: "student" }).select("name email role");
  if (!user) throw new ApiError(404, "Student user not found");

  let profile = await StudentProfile.findOne({ userId: req.user.id }).lean();
  if (!profile) {
    profile = await StudentProfile.create({ userId: req.user.id });
    profile = profile.toObject();
  }

  res.json({ user, profile });
});

exports.updateMyStudentProfile = asyncHandler(async (req, res) => {
  const nextPayload = { ...req.body };
  nextPayload.profileCompleteness = computeProfileCompleteness([
    nextPayload.profilePhotoUrl,
    nextPayload.headline,
    nextPayload.about,
    nextPayload.education,
    nextPayload.collegeName,
    nextPayload.skills,
    nextPayload.projects,
    nextPayload.achievements,
    nextPayload.experiences,
    nextPayload.certifications,
    nextPayload.careerGoals,
    nextPayload.resumeUrl
  ]);

  const profile = await StudentProfile.findOneAndUpdate(
    { userId: req.user.id },
    { $set: nextPayload, $setOnInsert: { userId: req.user.id } },
    { upsert: true, new: true, runValidators: true }
  );

  await createAuditLog({
    req,
    actorId: req.user.id,
    action: "profile.student.update",
    entityType: "StudentProfile",
    entityId: profile._id,
    metadata: { profileCompleteness: profile.profileCompleteness }
  });

  res.json({ message: "Student profile updated", profile });
});

exports.getMyMentorProfileV2 = asyncHandler(async (req, res) => {
  const user = await User.findOne({ _id: req.user.id, role: "mentor" }).select(
    "name email role approvalStatus primaryCategory subCategory specializations"
  );
  if (!user) throw new ApiError(404, "Mentor user not found");

  let profile = await MentorProfile.findOne({ userId: req.user.id }).lean();
  if (!profile) {
    profile = await MentorProfile.create({ userId: req.user.id });
    profile = profile.toObject();
  }

  res.json({
    user: {
      ...user.toObject(),
      status: user.approvalStatus
    },
    profile
  });
});

exports.getMentorCategoryOptions = asyncHandler(async (_req, res) => {
  res.json({ categories: getMentorCategoryOptions() });
});

exports.updateMyMentorProfileV2 = asyncHandler(async (req, res) => {
  const nextPayload = { ...req.body };
  const existingProfile = await MentorProfile.findOne({ userId: req.user.id }).lean();
  const mergedProfile = {
    ...(existingProfile || {}),
    ...nextPayload
  };

  if (
    nextPayload.primaryCategory !== undefined ||
    nextPayload.subCategory !== undefined ||
    nextPayload.specializations !== undefined
  ) {
    const primaryCategory = nextPayload.primaryCategory || "";
    const subCategory = nextPayload.subCategory || "";
    const specializations = nextPayload.specializations || [];

    const isValid = isValidMentorCategorySelection(primaryCategory, subCategory, specializations);
    if (!isValid) {
      throw new ApiError(400, "Invalid category selection. Choose from allowed backend categories.");
    }

    nextPayload.expertiseDomains = specializations;
  }

  nextPayload.profileCompleteness = computeProfileCompleteness([
    mergedProfile.profilePhotoUrl,
    mergedProfile.title,
    mergedProfile.company,
    mergedProfile.experienceYears,
    mergedProfile.primaryCategory,
    mergedProfile.subCategory,
    mergedProfile.specializations,
    mergedProfile.about,
    mergedProfile.achievements,
    mergedProfile.linkedInUrl,
    mergedProfile.weeklyAvailabilitySlots
  ]);

  const profile = await MentorProfile.findOneAndUpdate(
    { userId: req.user.id },
    { $set: nextPayload, $setOnInsert: { userId: req.user.id } },
    { upsert: true, new: true, runValidators: true }
  );

  const userUpdates = {};
  if (Object.prototype.hasOwnProperty.call(nextPayload, "primaryCategory")) {
    userUpdates.primaryCategory = nextPayload.primaryCategory || "";
  }
  if (Object.prototype.hasOwnProperty.call(nextPayload, "subCategory")) {
    userUpdates.subCategory = nextPayload.subCategory || "";
  }
  if (Object.prototype.hasOwnProperty.call(nextPayload, "specializations")) {
    userUpdates.specializations = Array.isArray(nextPayload.specializations) ? nextPayload.specializations : [];
  }
  if (Object.prototype.hasOwnProperty.call(nextPayload, "sessionPrice")) {
    userUpdates.sessionPrice = Number(nextPayload.sessionPrice || 0);
  }
  if (Object.prototype.hasOwnProperty.call(nextPayload, "about")) {
    userUpdates.bio = nextPayload.about || "";
  }
  if (
    Object.prototype.hasOwnProperty.call(nextPayload, "expertiseDomains") ||
    Object.prototype.hasOwnProperty.call(nextPayload, "specializations")
  ) {
    userUpdates.expertise = Array.isArray(nextPayload.expertiseDomains)
      ? nextPayload.expertiseDomains
      : Array.isArray(nextPayload.specializations)
        ? nextPayload.specializations
        : [];
  }

  if (Object.keys(userUpdates).length > 0) {
    await User.updateOne({ _id: req.user.id, role: "mentor" }, { $set: userUpdates });
  }

  await createAuditLog({
    req,
    actorId: req.user.id,
    action: "profile.mentor.update",
    entityType: "MentorProfile",
    entityId: profile._id,
    metadata: { profileCompleteness: profile.profileCompleteness }
  });

  res.json({ message: "Mentor profile updated", profile });
});

exports.getPublicMentorProfileV2 = asyncHandler(async (req, res) => {
  const user = await User.findOne({
    _id: req.params.mentorUserId,
    role: "mentor",
    approvalStatus: "approved"
  }).select("name email role approvalStatus primaryCategory subCategory specializations");

  if (!user) throw new ApiError(404, "Mentor not found");

  const profile = await MentorProfile.findOne({ userId: user._id }).lean();

  res.json({
    user: {
      ...user.toObject(),
      status: user.approvalStatus
    },
    profile
  });
});

exports.getPublicUserProfile = asyncHandler(async (req, res) => {
  const user = await User.findOne({
    _id: req.params.userId,
    isDeleted: false
  }).select("name email role approvalStatus primaryCategory subCategory specializations createdAt");

  if (!user) throw new ApiError(404, "User not found");

  let profile = null;
  if (user.role === "mentor") {
    profile = await MentorProfile.findOne({ userId: user._id }).lean();
  } else {
    profile = await StudentProfile.findOne({ userId: user._id }).lean();
  }

  const viewerId = String(req.user?.id || "");
  const targetUserId = String(user._id);

  const [followers, following, acceptedConnections, isFollowing, followsYou, relation, followerRows, followingRows] =
    await Promise.all([
      UserFollow.countDocuments({ followingId: user._id }),
      UserFollow.countDocuments({ followerId: user._id }),
      Connection.countDocuments({
        status: "accepted",
        $or: [{ requesterId: user._id }, { recipientId: user._id }]
      }),
      viewerId && viewerId !== targetUserId
        ? UserFollow.exists({ followerId: viewerId, followingId: user._id })
        : null,
      viewerId && viewerId !== targetUserId
        ? UserFollow.exists({ followerId: user._id, followingId: viewerId })
        : null,
      viewerId && viewerId !== targetUserId
        ? Connection.findOne({
            $or: [
              { requesterId: viewerId, recipientId: user._id },
              { requesterId: user._id, recipientId: viewerId }
            ]
          })
            .select("_id requesterId recipientId status")
            .lean()
        : null,
      UserFollow.find({ followingId: user._id })
        .populate("followerId", "name role")
        .sort({ createdAt: -1 })
        .limit(20)
        .lean(),
      UserFollow.find({ followerId: user._id })
        .populate("followingId", "name role")
        .sort({ createdAt: -1 })
        .limit(20)
        .lean()
    ]);

  let connectionStatus = "none";
  if (relation) {
    if (relation.status === "accepted") {
      connectionStatus = "accepted";
    } else if (relation.status === "pending") {
      connectionStatus = String(relation.requesterId) === viewerId ? "pending_outgoing" : "pending_incoming";
    } else {
      connectionStatus = relation.status;
    }
  }

  res.json({
    user: {
      ...user.toObject(),
      status: user.approvalStatus
    },
    profile,
    social: {
      followers,
      following,
      connections: acceptedConnections,
      isFollowing: !!isFollowing,
      followsYou: !!followsYou,
      connectionStatus,
      connectionId: relation?._id ? String(relation._id) : null
    },
    socialPreview: {
      followers: (followerRows || [])
        .map((item) => item.followerId)
        .filter(Boolean)
        .map((row) => ({ _id: row._id, name: row.name, role: row.role })),
      following: (followingRows || [])
        .map((item) => item.followingId)
        .filter(Boolean)
        .map((row) => ({ _id: row._id, name: row.name, role: row.role }))
    }
  });
});
