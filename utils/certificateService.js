const OrinCertification = require("../models/OrinCertification");
const ReputationScore = require("../models/ReputationScore");
const LeaderboardSnapshot = require("../models/LeaderboardSnapshot");
const StudentProfile = require("../models/StudentProfile");
const User = require("../models/User");
const { publicBaseUrl } = require("../config/env");

function toDateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function computeLevelTag(score) {
  if (score >= 1200) return "Top 5% Career Builders";
  if (score >= 900) return "Top 10% AI Learners";
  if (score >= 600) return "High Momentum";
  if (score >= 300) return "Consistent Builder";
  return "Starter";
}

function buildCertificateId() {
  const year = new Date().getFullYear();
  const randomNumber = Math.floor(100000 + Math.random() * 900000);
  return `ORIN-${year}-${randomNumber}`;
}

function buildVerificationUrl(certificateId) {
  const base = (publicBaseUrl || "https://orin-backend.onrender.com").replace(/\/+$/, "");
  return `${base}/api/network/certifications/verify/${encodeURIComponent(certificateId)}`;
}

function buildQrCodeUrl(verificationUrl) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(verificationUrl)}`;
}

async function ensureReputation(userId) {
  let rep = await ReputationScore.findOne({ userId });
  if (!rep) {
    rep = await ReputationScore.create({ userId, score: 0, levelTag: "Starter" });
  }
  return rep;
}

async function rewardCertificateXp(userId, type) {
  const rep = await ensureReputation(userId);
  const rewardMap = {
    challenge: { bucket: "dailyChallenges", amount: 3 },
    roadmap: { bucket: "projectUploads", amount: 2 },
    mentorship: { bucket: "mentorReviews", amount: 2 },
    internship: { bucket: "projectUploads", amount: 3 },
    achievement: { bucket: "skillEndorsements", amount: 2 },
    course: { bucket: "skillEndorsements", amount: 2 },
    manual: { bucket: "skillEndorsements", amount: 1 }
  };

  const reward = rewardMap[type] || rewardMap.manual;
  rep.breakdown[reward.bucket] += reward.amount;
  rep.score =
    rep.breakdown.projectUploads * 40 +
    rep.breakdown.skillEndorsements * 25 +
    rep.breakdown.dailyChallenges * 20 +
    rep.breakdown.mentorReviews * 30 +
    rep.breakdown.activityPosts * 15;
  rep.levelTag = computeLevelTag(rep.score);
  await rep.save();
  return rep;
}

async function upsertLeaderboardsForUser(userId) {
  const dateKey = toDateKey();
  const allReps = await ReputationScore.find({})
    .populate("userId", "name role")
    .sort({ score: -1, updatedAt: -1 })
    .limit(300)
    .lean();

  const globalEntries = allReps.map((item, idx) => ({
    userId: item.userId?._id,
    score: item.score || 0,
    rank: idx + 1
  }));

  await LeaderboardSnapshot.findOneAndUpdate(
    { dateKey, scope: "global", collegeName: "" },
    { $set: { entries: globalEntries } },
    { upsert: true, new: true }
  );

  const profile = await StudentProfile.findOne({ userId }).select("collegeName").lean();
  if (!profile?.collegeName) return;

  const collegeProfiles = await StudentProfile.find({ collegeName: profile.collegeName }).select("userId").lean();
  const collegeUserIds = new Set(collegeProfiles.map((item) => String(item.userId)));
  const collegeEntries = allReps
    .filter((item) => collegeUserIds.has(String(item.userId?._id)))
    .map((item, idx) => ({
      userId: item.userId?._id,
      score: item.score || 0,
      rank: idx + 1
    }));

  await LeaderboardSnapshot.findOneAndUpdate(
    { dateKey, scope: "college", collegeName: profile.collegeName },
    { $set: { entries: collegeEntries } },
    { upsert: true, new: true }
  );
}

async function issueCertificate({
  userId,
  userName = "",
  title,
  type = "manual",
  issuedBy = "ORIN",
  source = "ORIN",
  level = "Beginner",
  domain = "",
  referenceType = "",
  referenceId = "",
  requestId = null,
  metadata = {},
  status = "approved"
}) {
  const existingQuery = {
    userId,
    title: String(title || "").trim(),
    type,
    referenceType: referenceType || "",
    referenceId: String(referenceId || "").trim()
  };

  if (existingQuery.referenceType || existingQuery.referenceId) {
    const existing = await OrinCertification.findOne(existingQuery).lean();
    if (existing) return { certificate: existing, created: false };
  }

  const resolvedUserName =
    String(userName || "").trim() ||
    (await User.findById(userId).select("name").lean())?.name ||
    "ORIN User";
  const certificateId = buildCertificateId();
  const verificationUrl = buildVerificationUrl(certificateId);
  const qrCodeUrl = buildQrCodeUrl(verificationUrl);

  const certificate = await OrinCertification.create({
    certificateId,
    userId,
    userName: resolvedUserName,
    title: String(title || "").trim(),
    type,
    level: String(level || "Beginner").trim(),
    domain: String(domain || metadata?.domain || "").trim(),
    issuedBy: String(issuedBy || "ORIN").trim(),
    issuedAt: new Date(),
    source: String(source || "ORIN").trim(),
    status,
    qrCodeUrl,
    verificationUrl,
    certificateUrl: verificationUrl,
    referenceType: String(referenceType || "").trim(),
    referenceId: String(referenceId || "").trim(),
    requestId: requestId || null,
    metadata: {
      domain: String(metadata?.domain || domain || "").trim(),
      level: String(metadata?.level || level || "").trim(),
      score: Number(metadata?.score || 0),
      goal: String(metadata?.goal || "").trim(),
      totalSteps: Number(metadata?.totalSteps || 0),
      completedSteps: Number(metadata?.completedSteps || 0),
      challengeTitle: String(metadata?.challengeTitle || "").trim()
    }
  });

  await rewardCertificateXp(userId, type);
  await upsertLeaderboardsForUser(userId);

  return { certificate: certificate.toObject(), created: true };
}

module.exports = {
  buildCertificateId,
  buildQrCodeUrl,
  buildVerificationUrl,
  issueCertificate
};
