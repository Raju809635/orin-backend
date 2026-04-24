const JourneyState = require("../models/JourneyState");
const User = require("../models/User");
const StudentProfile = require("../models/StudentProfile");

function normalizeList(items = []) {
  const source = Array.isArray(items) ? items : [items];
  return [...new Set(source.map((item) => String(item || "").trim()).filter(Boolean))];
}

function normalizeKey(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function buildRoadmapSteps(nextTitles = [], existingSteps = []) {
  const existingByKey = new Map();
  (existingSteps || []).forEach((step, index) => {
    const key = normalizeKey(step?.title) || `step-${index + 1}`;
    if (!existingByKey.has(key)) existingByKey.set(key, step);
  });

  return (nextTitles || []).map((title, index) => {
    const normalizedTitle = String(title || "").trim();
    const key = normalizeKey(normalizedTitle) || `step-${index + 1}`;
    const existing = existingByKey.get(key);
    const isFirst = index === 0;

    return {
      id: existing?.id || `step-${index + 1}`,
      title: normalizedTitle,
      status: existing?.status || (isFirst ? "active" : "locked"),
      priority: index + 1,
      xpReward: Number(existing?.xpReward || 20),
      startedAt: existing?.startedAt || null,
      completedAt: existing?.completedAt || null,
      unlockedAt: existing?.unlockedAt || (isFirst ? new Date() : null),
      proofStatus: existing?.proofStatus || "not_submitted",
      proofText: existing?.proofText || "",
      proofLink: existing?.proofLink || "",
      proofImageUrl: existing?.proofImageUrl || "",
      proofSubmittedAt: existing?.proofSubmittedAt || null
    };
  });
}

function inferSkillLevel({ knownSkills = [], missingSkills = [], readinessScore = 0 }) {
  if (readinessScore >= 70 || knownSkills.length >= 8) return "advanced";
  if (readinessScore >= 35 || knownSkills.length >= 4 || missingSkills.length <= 4) return "intermediate";
  return "beginner";
}

async function ensureJourneyState(userId, fallbackRole = "student") {
  let state = await JourneyState.findOne({ userId });
  if (state) return state;

  const [user, profile] = await Promise.all([
    User.findById(userId).select("role goals primaryCategory subCategory").lean(),
    StudentProfile.findOne({ userId }).select("careerGoals skills").lean()
  ]);

  state = await JourneyState.create({
    userId,
    role: user?.role || fallbackRole,
    goal: {
      title: String(profile?.careerGoals || user?.goals || "").trim(),
      domain: String(user?.primaryCategory || "").trim(),
      subDomain: String(user?.subCategory || "").trim(),
      focus: "",
      source: profile?.careerGoals || user?.goals ? "profile" : "",
      updatedAt: profile?.careerGoals || user?.goals ? new Date() : null
    },
    skillProfile: {
      knownSkills: normalizeList(profile?.skills || []),
      missingSkills: [],
      readinessScore: 0,
      level: normalizeList(profile?.skills || []).length >= 4 ? "intermediate" : "beginner",
      updatedAt: profile?.skills?.length ? new Date() : null
    }
  });

  return state;
}

async function getJourneyState(userId, fallbackRole = "student") {
  return ensureJourneyState(userId, fallbackRole);
}

async function updateJourneyGoal(userId, payload = {}, fallbackRole = "student") {
  const state = await ensureJourneyState(userId, fallbackRole);
  state.goal = {
    ...state.goal.toObject?.() || state.goal,
    title: String(payload.title || state.goal?.title || "").trim(),
    domain: String(payload.domain || state.goal?.domain || "").trim(),
    subDomain: String(payload.subDomain || state.goal?.subDomain || "").trim(),
    focus: String(payload.focus || state.goal?.focus || "").trim(),
    source: String(payload.source || state.goal?.source || "manual").trim(),
    updatedAt: new Date()
  };
  await state.save();
  return state;
}

async function updateSkillProfile(userId, payload = {}, fallbackRole = "student") {
  const state = await ensureJourneyState(userId, fallbackRole);
  const knownSkills = normalizeList(payload.knownSkills || state.skillProfile?.knownSkills || []);
  const missingSkills = normalizeList(payload.missingSkills || state.skillProfile?.missingSkills || []);
  const readinessScore = Number(payload.readinessScore ?? state.skillProfile?.readinessScore ?? 0);
  const level = String(payload.level || inferSkillLevel({ knownSkills, missingSkills, readinessScore }));

  state.skillProfile = {
    ...state.skillProfile.toObject?.() || state.skillProfile,
    knownSkills,
    missingSkills,
    readinessScore,
    level,
    updatedAt: new Date()
  };

  if (payload.roadmapSteps) {
    const steps = buildRoadmapSteps(payload.roadmapSteps || [], state.roadmap?.steps || []);
    state.roadmap = {
      ...state.roadmap.toObject?.() || state.roadmap,
      roadmapId: String(payload.roadmapId || state.roadmap?.roadmapId || state.goal?.title || "journey").trim(),
      steps,
      progressPercent: Number(payload.progressPercent ?? state.roadmap?.progressPercent ?? 0),
      currentStepId: steps[0]?.id || "",
      updatedAt: new Date()
    };
  }

  if (payload.recommendations) {
    state.recommendations = {
      ...state.recommendations.toObject?.() || state.recommendations,
      ...payload.recommendations,
      updatedAt: new Date()
    };
  }

  await state.save();
  return state;
}

async function recomputeJourneyState(userId, payload = {}, fallbackRole = "student") {
  const state = await ensureJourneyState(userId, fallbackRole);
  if (payload.goal) {
    await updateJourneyGoal(userId, payload.goal, fallbackRole);
  }
  if (payload.skillProfile || payload.roadmapSteps || payload.recommendations) {
    await updateSkillProfile(
      userId,
      {
        ...(payload.skillProfile || {}),
        roadmapSteps: payload.roadmapSteps,
        roadmapId: payload.roadmapId,
        recommendations: payload.recommendations
      },
      fallbackRole
    );
  }
  return JourneyState.findOne({ userId }).lean();
}

module.exports = {
  getJourneyState,
  ensureJourneyState,
  updateJourneyGoal,
  updateSkillProfile,
  recomputeJourneyState,
  inferSkillLevel
};
