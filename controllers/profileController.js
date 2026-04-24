const mongoose = require("mongoose");
const StudentProfile = require("../models/StudentProfile");
const MentorProfile = require("../models/MentorProfile");
const User = require("../models/User");
const Connection = require("../models/Connection");
const UserFollow = require("../models/UserFollow");
const SkillEndorsement = require("../models/SkillEndorsement");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { createAuditLog } = require("../services/auditService");
const { searchInstitutions, canonicalInstitutionType, normalizeStateName: normalizeEducationStateName } = require("../services/educationCatalogService");
const { updateSkillProfile } = require("../services/journeyStateService");
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

function toStringArray(value) {
  return Array.isArray(value)
    ? value
        .map((item) => String(item || "").trim())
        .filter(Boolean)
      : [];
}

function normalizeStateName(value = "") {
  const normalized = normalizeEducationStateName(value);
  const aliases = new Map([
    ["Ap", "Andhra Pradesh"],
    ["Andhra", "Andhra Pradesh"],
    ["Ts", "Telangana"],
    ["Tg", "Telangana"],
    ["Tn", "Tamil Nadu"],
    ["Ka", "Karnataka"],
    ["Mh", "Maharashtra"],
    ["Dl", "Delhi"]
  ]);
  return aliases.get(normalized) || normalized;
}

function normalizeProfileType(value = "", fallback = "student") {
  const normalized = String(value || "").trim().toLowerCase().replace(/\s+/g, "_");
  return ["student", "graduate", "job_seeker"].includes(normalized) ? normalized : fallback;
}

function normalizeProject(project = {}) {
  const tech = Array.isArray(project.tech)
    ? project.tech
    : Array.isArray(project.techStack)
      ? project.techStack
      : [];

  const title = String(project.title || project.name || "").trim();
  const description = String(project.description || project.summary || "").trim();
  const link = String(project.link || "").trim();
  const nextTech = tech.map((item) => String(item || "").trim()).filter(Boolean);

  return {
    title,
    name: title,
    description,
    summary: description,
    link,
    tech: nextTech,
    techStack: nextTech,
    demoVideoUrl: String(project.demoVideoUrl || "").trim(),
    screenshots: Array.isArray(project.screenshots) ? project.screenshots.filter(Boolean) : []
  };
}

function normalizeAchievement(achievement = {}) {
  return {
    title: String(achievement.title || "").trim(),
    issuer: String(achievement.issuer || "").trim(),
    date: String(achievement.date || "").trim(),
    url: String(achievement.url || "").trim(),
    type: String(achievement.type || "").trim(),
    description: String(achievement.description || "").trim()
  };
}

function normalizeMentorAchievement(achievement = {}) {
  if (typeof achievement === "string") {
    return {
      title: achievement.trim(),
      issuer: "",
      date: "",
      url: ""
    };
  }

  return {
    title: String(achievement.title || "").trim(),
    issuer: String(achievement.issuer || "").trim(),
    date: String(achievement.date || "").trim(),
    url: String(achievement.url || "").trim()
  };
}

function normalizeExperience(experience = {}) {
  const start = String(experience.start || experience.startDate || "").trim();
  const end = String(experience.end || experience.endDate || "").trim();

  return {
    organization: String(experience.organization || "").trim(),
    role: String(experience.role || "").trim(),
    start,
    startDate: start,
    end,
    endDate: end,
    description: String(experience.description || "").trim()
  };
}

function normalizeStudentProfilePayload(payload = {}) {
  const nextPayload = { ...payload };

  if (Object.prototype.hasOwnProperty.call(nextPayload, "skills")) {
    nextPayload.skills = toStringArray(nextPayload.skills);
  }
  if (Object.prototype.hasOwnProperty.call(nextPayload, "projects")) {
    nextPayload.projects = Array.isArray(nextPayload.projects)
      ? nextPayload.projects.map(normalizeProject).filter((item) => item.title || item.description || item.link || item.tech.length)
      : [];
  }
  if (Object.prototype.hasOwnProperty.call(nextPayload, "achievements")) {
    nextPayload.achievements = Array.isArray(nextPayload.achievements)
      ? nextPayload.achievements.map(normalizeAchievement).filter((item) => item.title || item.issuer || item.date || item.url)
      : [];
  }
  if (Object.prototype.hasOwnProperty.call(nextPayload, "experiences")) {
    nextPayload.experiences = Array.isArray(nextPayload.experiences)
      ? nextPayload.experiences
          .map(normalizeExperience)
          .filter((item) => item.organization || item.role || item.start || item.end || item.description)
      : [];
  }
  if (Object.prototype.hasOwnProperty.call(nextPayload, "education")) {
    nextPayload.education = Array.isArray(nextPayload.education)
      ? nextPayload.education
          .map((item = {}) => ({
            school: String(item.school || "").trim(),
            degree: String(item.degree || "").trim(),
            year: String(item.year || "").trim()
          }))
          .filter((item) => item.school || item.degree || item.year)
      : [];
  }
  if (Object.prototype.hasOwnProperty.call(nextPayload, "state")) {
    nextPayload.state = normalizeStateName(nextPayload.state);
  }
  if (Object.prototype.hasOwnProperty.call(nextPayload, "profileType")) {
    nextPayload.profileType = normalizeProfileType(nextPayload.profileType, "student");
  }
  if (Object.prototype.hasOwnProperty.call(nextPayload, "institutionName")) {
    nextPayload.institutionName = String(nextPayload.institutionName || "").trim();
  }
  if (Object.prototype.hasOwnProperty.call(nextPayload, "institutionType")) {
    nextPayload.institutionType = canonicalInstitutionType(nextPayload.institutionType || "");
  }
  if (Object.prototype.hasOwnProperty.call(nextPayload, "institutionDistrict")) {
    nextPayload.institutionDistrict = String(nextPayload.institutionDistrict || "").trim();
  }
  if (Object.prototype.hasOwnProperty.call(nextPayload, "institutionSource")) {
    nextPayload.institutionSource = String(nextPayload.institutionSource || "").trim();
  }
  if (Object.prototype.hasOwnProperty.call(nextPayload, "className")) {
    nextPayload.className = String(nextPayload.className || "").trim();
  }
  if (nextPayload.institutionName) {
    nextPayload.collegeName = nextPayload.institutionName;
  }
  if (Object.prototype.hasOwnProperty.call(nextPayload, "payoutUpiId")) {
    nextPayload.payoutUpiId = String(nextPayload.payoutUpiId || "").trim();
  }
  if (Object.prototype.hasOwnProperty.call(nextPayload, "payoutQrCodeUrl")) {
    nextPayload.payoutQrCodeUrl = String(nextPayload.payoutQrCodeUrl || "").trim();
  }
  if (Object.prototype.hasOwnProperty.call(nextPayload, "payoutPhoneNumber")) {
    nextPayload.payoutPhoneNumber = String(nextPayload.payoutPhoneNumber || "").trim();
  }

  return nextPayload;
}

function normalizeMentorProfilePayload(payload = {}) {
  const nextPayload = { ...payload };

  if (Object.prototype.hasOwnProperty.call(nextPayload, "specializations")) {
    nextPayload.specializations = toStringArray(nextPayload.specializations);
  }
  if (Object.prototype.hasOwnProperty.call(nextPayload, "expertiseDomains")) {
    nextPayload.expertiseDomains = toStringArray(nextPayload.expertiseDomains);
  }
  if (Object.prototype.hasOwnProperty.call(nextPayload, "achievements")) {
    nextPayload.achievements = Array.isArray(nextPayload.achievements)
      ? nextPayload.achievements
          .map(normalizeMentorAchievement)
          .filter((item) => item.title || item.issuer || item.date || item.url)
      : [];
  }
  if (Object.prototype.hasOwnProperty.call(nextPayload, "projects")) {
    nextPayload.projects = Array.isArray(nextPayload.projects)
      ? nextPayload.projects.map(normalizeProject).filter((item) => item.title || item.description || item.link || item.tech.length)
      : [];
  }
  if (Object.prototype.hasOwnProperty.call(nextPayload, "experiences")) {
    nextPayload.experiences = Array.isArray(nextPayload.experiences)
      ? nextPayload.experiences
          .map(normalizeExperience)
          .filter((item) => item.organization || item.role || item.start || item.end || item.description)
      : [];
  }
  if (Object.prototype.hasOwnProperty.call(nextPayload, "education")) {
    nextPayload.education = Array.isArray(nextPayload.education)
      ? nextPayload.education
          .map((item = {}) => ({
            school: String(item.school || "").trim(),
            degree: String(item.degree || "").trim(),
            year: String(item.year || "").trim()
          }))
          .filter((item) => item.school || item.degree || item.year)
      : [];
  }
  if (Object.prototype.hasOwnProperty.call(nextPayload, "state")) {
    nextPayload.state = normalizeStateName(nextPayload.state);
  }
  if (Object.prototype.hasOwnProperty.call(nextPayload, "profileType")) {
    nextPayload.profileType = normalizeProfileType(nextPayload.profileType, "graduate");
  }
  if (Object.prototype.hasOwnProperty.call(nextPayload, "institutionName")) {
    nextPayload.institutionName = String(nextPayload.institutionName || "").trim();
  }
  if (Object.prototype.hasOwnProperty.call(nextPayload, "institutionType")) {
    nextPayload.institutionType = canonicalInstitutionType(nextPayload.institutionType || "");
  }
  if (Object.prototype.hasOwnProperty.call(nextPayload, "institutionDistrict")) {
    nextPayload.institutionDistrict = String(nextPayload.institutionDistrict || "").trim();
  }
  if (Object.prototype.hasOwnProperty.call(nextPayload, "institutionSource")) {
    nextPayload.institutionSource = String(nextPayload.institutionSource || "").trim();
  }
  if (nextPayload.institutionName) {
    nextPayload.collegeName = nextPayload.institutionName;
  }

  return nextPayload;
}

async function upsertProfileDocument(Model, userId, nextPayload) {
  const objectUserId = new mongoose.Types.ObjectId(String(userId));
  await Model.collection.updateOne(
    { userId: objectUserId },
    {
      $set: nextPayload,
      $setOnInsert: { userId: objectUserId }
    },
    { upsert: true }
  );

  return Model.findOne({ userId }).lean();
}

function stripSensitiveMentorPayoutFields(profile) {
  if (!profile) return profile;
  const {
    payoutUpiId,
    payoutQrCodeUrl,
    payoutPhoneNumber,
    ...safeProfile
  } = profile;
  return safeProfile;
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
  const nextPayload = normalizeStudentProfilePayload(req.body);
  nextPayload.profileCompleteness = computeProfileCompleteness([
    nextPayload.profilePhotoUrl,
    nextPayload.headline,
    nextPayload.profileType,
    nextPayload.about,
    nextPayload.state,
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

  const profile = await upsertProfileDocument(StudentProfile, req.user.id, nextPayload);
  const resolvedProfile = {
    ...profile,
    profileType:
      Object.prototype.hasOwnProperty.call(nextPayload, "profileType")
        ? nextPayload.profileType
        : String(profile?.profileType || "student").trim(),
    state:
      Object.prototype.hasOwnProperty.call(nextPayload, "state")
        ? nextPayload.state
        : String(profile?.state || "").trim()
  };

  if (Object.prototype.hasOwnProperty.call(nextPayload, "skills")) {
    await updateSkillProfile(
      req.user.id,
      {
        knownSkills: nextPayload.skills || []
      },
      req.user.role
    );
  }

  await createAuditLog({
    req,
    actorId: req.user.id,
    action: "profile.student.update",
    entityType: "StudentProfile",
    entityId: resolvedProfile?._id,
    metadata: { profileCompleteness: resolvedProfile?.profileCompleteness || nextPayload.profileCompleteness }
  });

  res.json({ message: "Student profile updated", profile: resolvedProfile });
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

exports.searchEducationInstitutions = asyncHandler(async (req, res) => {
  const q = String(req.query?.q || "").trim();
  const institutionType = String(req.query?.institutionType || "").trim();
  const state = String(req.query?.state || "").trim();
  const limit = Number(req.query?.limit || 12);

  const results = searchInstitutions({ q, institutionType, state, limit });
  res.json({ results });
});

exports.updateMyMentorProfileV2 = asyncHandler(async (req, res) => {
  const nextPayload = normalizeMentorProfilePayload(req.body);
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
    mergedProfile.profileType,
    mergedProfile.company,
    mergedProfile.experienceYears,
    mergedProfile.primaryCategory,
    mergedProfile.subCategory,
    mergedProfile.specializations,
    mergedProfile.about,
    mergedProfile.state,
    mergedProfile.education,
    mergedProfile.achievements,
    mergedProfile.projects,
    mergedProfile.experiences,
    mergedProfile.linkedInUrl,
    mergedProfile.resumeUrl,
    mergedProfile.payoutUpiId,
    mergedProfile.payoutQrCodeUrl,
    mergedProfile.payoutPhoneNumber,
    mergedProfile.weeklyAvailabilitySlots
  ]);

  const profile = await upsertProfileDocument(MentorProfile, req.user.id, nextPayload);
  const resolvedProfile = {
    ...profile,
    profileType:
      Object.prototype.hasOwnProperty.call(nextPayload, "profileType")
        ? nextPayload.profileType
        : String(profile?.profileType || "graduate").trim(),
    state:
      Object.prototype.hasOwnProperty.call(nextPayload, "state")
        ? nextPayload.state
        : String(profile?.state || "").trim()
  };

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
    entityId: resolvedProfile?._id,
    metadata: { profileCompleteness: resolvedProfile?.profileCompleteness || nextPayload.profileCompleteness }
  });

  res.json({ message: "Mentor profile updated", profile: resolvedProfile });
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
    profile: stripSensitiveMentorPayoutFields(profile)
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
    profile = stripSensitiveMentorPayoutFields(profile);
  } else {
    profile = await StudentProfile.findOne({ userId: user._id }).lean();
  }

  const viewerId = String(req.user?.id || "");
  const targetUserId = String(user._id);

  const profileSkills =
    user.role === "mentor"
      ? Array.isArray(user.specializations) ? user.specializations.filter(Boolean) : []
      : Array.isArray(profile?.skills) ? profile.skills.filter(Boolean) : [];

  const [followers, following, acceptedConnections, isFollowing, followsYou, relation, followerRows, followingRows, endorsementRows, viewerEndorsements] =
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
        .lean(),
      profileSkills.length
        ? SkillEndorsement.aggregate([
            {
              $match: {
                endorsedUserId: user._id,
                skill: { $in: profileSkills }
              }
            },
            {
              $group: {
                _id: "$skill",
                count: { $sum: 1 }
              }
            }
          ])
        : [],
      viewerId && viewerId !== targetUserId && profileSkills.length
        ? SkillEndorsement.find({
            endorsedUserId: user._id,
            endorsedByUserId: viewerId,
            skill: { $in: profileSkills }
          })
            .select("skill")
            .lean()
        : []
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

  const endorsementCounts = (endorsementRows || []).reduce((acc, item) => {
    const key = String(item?._id || "").trim();
    if (!key) return acc;
    acc[key] = Number(item.count || 0);
    return acc;
  }, {});

  const viewerEndorsedSkills = (viewerEndorsements || [])
    .map((item) => String(item.skill || "").trim())
    .filter(Boolean);

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
    },
    endorsements: {
      counts: endorsementCounts,
      viewerEndorsedSkills
    }
  });
});
