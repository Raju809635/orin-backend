const StudentProfile = require("../models/StudentProfile");
const MentorProfile = require("../models/MentorProfile");
const User = require("../models/User");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { createAuditLog } = require("../services/auditService");

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
    nextPayload.skills,
    nextPayload.projects,
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
  const user = await User.findOne({ _id: req.user.id, role: "mentor" }).select("name email role status domain");
  if (!user) throw new ApiError(404, "Mentor user not found");

  let profile = await MentorProfile.findOne({ userId: req.user.id }).lean();
  if (!profile) {
    profile = await MentorProfile.create({ userId: req.user.id });
    profile = profile.toObject();
  }

  res.json({ user, profile });
});

exports.updateMyMentorProfileV2 = asyncHandler(async (req, res) => {
  const nextPayload = { ...req.body };
  nextPayload.profileCompleteness = computeProfileCompleteness([
    nextPayload.profilePhotoUrl,
    nextPayload.title,
    nextPayload.company,
    nextPayload.experienceYears,
    nextPayload.expertiseDomains,
    nextPayload.about,
    nextPayload.achievements,
    nextPayload.linkedInUrl,
    nextPayload.weeklyAvailabilitySlots
  ]);

  const profile = await MentorProfile.findOneAndUpdate(
    { userId: req.user.id },
    { $set: nextPayload, $setOnInsert: { userId: req.user.id } },
    { upsert: true, new: true, runValidators: true }
  );

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
    status: "approved"
  }).select("name email role status domain");

  if (!user) throw new ApiError(404, "Mentor not found");

  const profile = await MentorProfile.findOne({ userId: user._id }).lean();

  res.json({ user, profile });
});
