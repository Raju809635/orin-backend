const mongoose = require("mongoose");
const Connection = require("../models/Connection");
const UserFollow = require("../models/UserFollow");
const FeedPost = require("../models/FeedPost");
const FeedComment = require("../models/FeedComment");
const SkillEndorsement = require("../models/SkillEndorsement");
const ReputationScore = require("../models/ReputationScore");
const LeaderboardSnapshot = require("../models/LeaderboardSnapshot");
const StudentProfile = require("../models/StudentProfile");
const MentorProfile = require("../models/MentorProfile");
const Session = require("../models/Session");
const MentorReview = require("../models/MentorReview");
const CareerOpportunity = require("../models/CareerOpportunity");
const MentorLiveSession = require("../models/MentorLiveSession");
const MentorLiveSessionBooking = require("../models/MentorLiveSessionBooking");
const MentorSprint = require("../models/MentorSprint");
const MentorSprintEnrollment = require("../models/MentorSprintEnrollment");
const CommunityChallenge = require("../models/CommunityChallenge");
const CommunityChallengeSubmission = require("../models/CommunityChallengeSubmission");
const OrinCertification = require("../models/OrinCertification");
const CertificationTrack = require("../models/CertificationTrack");
const CertificationRequest = require("../models/CertificationRequest");
const CertificateTemplate = require("../models/CertificateTemplate");
const MentorGroup = require("../models/MentorGroup");
const MentorGroupMessage = require("../models/MentorGroupMessage");
const HighSchoolQuizBattleRoom = require("../models/HighSchoolQuizBattleRoom");
const HighSchoolCompetition = require("../models/HighSchoolCompetition");
const InstitutionRoadmap = require("../models/InstitutionRoadmap");
const InstitutionRoadmapSubmission = require("../models/InstitutionRoadmapSubmission");
const KnowledgeResource = require("../models/KnowledgeResource");
const KnowledgeResourceSubmission = require("../models/KnowledgeResourceSubmission");
const UserSkillLevel = require("../models/UserSkillLevel");
const QuizStreak = require("../models/QuizStreak");
const QuizAttempt = require("../models/QuizAttempt");
const User = require("../models/User");
const Notification = require("../models/Notification");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { issueCertificate } = require("../utils/certificateService");
const { createAuditLog } = require("../services/auditService");
const { requestAiResponse } = require("../services/aiService");
const { mentorCategoryTree } = require("../config/mentorCategories");
const { getJourneyState, updateJourneyGoal, updateSkillProfile, inferSkillLevel } = require("../services/journeyStateService");
const { createRazorpayOrder, verifyRazorpaySignature, razorpayKeyId } = require("../services/paymentService");
const { buildJitsiMeetingPayload, buildManualMeetingPayload } = require("../services/jitsiMeetingService");
const { paymentMode, manualPaymentWindowMinutes } = require("../config/env");

const QUIZ_XP_BY_SCORE = {
  1: 10,
  2: 20,
  3: 30,
  4: 40,
  5: 50
};
const STREAK_BONUS_XP = {
  3: 20,
  7: 50,
  30: 200
};
const ROADMAP_STEP_LOCK_HOURS = 24;
const QUIZ_DAILY_LIMIT_MESSAGE = "You have completed today's quiz. Come back tomorrow.";
const QUIZ_AI_RECENT_ATTEMPTS_LIMIT = 8;
const QUIZ_AI_POOL_SIZE = 9;
const REACTION_TYPES = ["like", "love", "care", "haha", "wow", "sad", "angry"];
const SPRINT_PLATFORM_FEE_PERCENT = 40;
const SPRINT_MENTOR_SHARE_PERCENT = 60;
const QUIZ_BATTLE_QUESTION_COUNT = 8;
const QUIZ_BATTLE_DEFAULT_DURATION_SEC = 25;

const QUIZ_BATTLE_QUESTION_BANK = [
  {
    subject: "Mathematics",
    topic: "Algebra",
    text: "What is the value of x in 2x + 5 = 19?",
    options: ["5", "7", "9", "12"],
    correctOption: "7",
    explanation: "2x = 14, so x = 7."
  },
  {
    subject: "Mathematics",
    topic: "Geometry",
    text: "What is the area of a triangle with base 10 and height 6?",
    options: ["30", "60", "16", "40"],
    correctOption: "30",
    explanation: "Area = 1/2 * base * height = 30."
  },
  {
    subject: "Science",
    topic: "Physics",
    text: "What is the SI unit of force?",
    options: ["Joule", "Newton", "Watt", "Pascal"],
    correctOption: "Newton",
    explanation: "Force is measured in Newtons."
  },
  {
    subject: "Science",
    topic: "Biology",
    text: "Which organ pumps blood through the body?",
    options: ["Lungs", "Kidney", "Heart", "Liver"],
    correctOption: "Heart",
    explanation: "The heart pumps blood."
  },
  {
    subject: "English",
    topic: "Grammar",
    text: "Choose the correct sentence.",
    options: ["She don't like apples.", "She doesn't likes apples.", "She doesn't like apples.", "She not likes apples."],
    correctOption: "She doesn't like apples.",
    explanation: "Third-person singular uses does not + base verb."
  },
  {
    subject: "Social",
    topic: "Civics",
    text: "Who is known as the Father of the Indian Constitution?",
    options: ["Mahatma Gandhi", "Jawaharlal Nehru", "B. R. Ambedkar", "Sardar Patel"],
    correctOption: "B. R. Ambedkar",
    explanation: "Dr. B. R. Ambedkar is credited with drafting the Constitution."
  },
  {
    subject: "General Studies",
    topic: "Current Affairs",
    text: "Which gas do plants mainly absorb during photosynthesis?",
    options: ["Oxygen", "Hydrogen", "Nitrogen", "Carbon dioxide"],
    correctOption: "Carbon dioxide",
    explanation: "Plants absorb carbon dioxide during photosynthesis."
  },
  {
    subject: "General Studies",
    topic: "Reasoning",
    text: "What comes next in the pattern: 2, 4, 8, 16, ?",
    options: ["18", "24", "32", "20"],
    correctOption: "32",
    explanation: "Each number doubles."
  }
];

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

function normalizeText(value = "") {
  return String(value || "")
    .toLowerCase()
    .trim();
}

function tokenize(value = "") {
  return normalizeText(value)
    .split(/[^a-z0-9+#.]+/i)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeList(values = []) {
  const seen = new Set();
  return (Array.isArray(values) ? values : [values])
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .filter((value) => {
      const key = normalizeText(value);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function normalizeContentScope({ requestedScope = "", role = "student", institutionName = "", className = "" } = {}) {
  const normalizedInstitution = String(institutionName || "").trim();
  const normalizedClass = String(className || "").trim();
  const scopeKey = normalizeText(requestedScope);

  if (role === "mentor") {
    if (scopeKey === "class" && normalizedInstitution && normalizedClass) {
      return { scope: "class", institutionName: normalizedInstitution, className: normalizedClass };
    }
    if (scopeKey === "institution" && normalizedInstitution) {
      return { scope: "institution", institutionName: normalizedInstitution, className: "" };
    }
    if (scopeKey === "global") {
      return { scope: "global", institutionName: "", className: "" };
    }
    return normalizedInstitution
      ? { scope: "institution", institutionName: normalizedInstitution, className: "" }
      : { scope: "global", institutionName: "", className: "" };
  }

  if (normalizedInstitution && scopeKey === "class" && normalizedClass) {
    return { scope: "class", institutionName: normalizedInstitution, className: normalizedClass };
  }
  if (normalizedInstitution) {
    return { scope: "institution", institutionName: normalizedInstitution, className: "" };
  }
  return { scope: "global", institutionName: "", className: "" };
}

function normalizeAudienceStage(value = "") {
  const key = normalizeText(value);
  if (["highschool", "high_school", "school"].includes(key)) return "highschool";
  if (["after12", "after_12", "after12th", "career"].includes(key)) return "after12";
  return "";
}

function audienceStageForMentorProfile(profile, requestedStage = "") {
  const explicitStage = normalizeAudienceStage(requestedStage);
  if (explicitStage) return explicitStage;
  return profile?.mentorOrgRole === "institution_teacher" ? "highschool" : "after12";
}

function audienceStageForViewer(role = "student", profile = null) {
  if (role === "mentor") return profile?.mentorOrgRole === "institution_teacher" ? "highschool" : "after12";
  return profile?.learnerStage === "highschool" || profile?.learnerStage === "kid" ? "highschool" : "after12";
}

function audienceStageVisibilityFilter(stage = "", ownerField = "", ownerId = "") {
  const filters = [
    { audienceStage: { $exists: false } },
    { audienceStage: "" }
  ];
  if (stage) filters.push({ audienceStage: stage });
  if (ownerField && ownerId) filters.push({ [ownerField]: ownerId });
  return { $or: filters };
}

function uniqueTokens(values = []) {
  const set = new Set();
  values.forEach((value) => {
    tokenize(value).forEach((token) => set.add(token));
  });
  return set;
}

function parseCsvList(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.flatMap((item) => String(item || "").split(","))
      .map((item) => String(item || "").trim())
      .filter(Boolean);
  }
  return String(value || "")
    .split(",")
    .map((item) => String(item || "").trim())
    .filter(Boolean);
}

function normalizeInstitutionRoadmapWeek(item = {}, index = 0) {
  return {
    id: String(item?.id || `week-${index + 1}`).trim(),
    title: String(item?.title || `Week ${index + 1}`).trim(),
    description: String(item?.description || "").trim(),
    tasks: normalizeList(item?.tasks || []),
    resources: normalizeList(item?.resources || []),
    quizTitle: String(item?.quizTitle || "").trim(),
    challengeTitle: String(item?.challengeTitle || "").trim(),
    xpReward: Math.max(0, Number(item?.xpReward || 20))
  };
}

function roundCurrency(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function normalizeRoadmapStep(step = {}, index = 0) {
  return {
    id: String(step?.id || `step-${index + 1}`),
    title: String(step?.title || "").trim(),
    status: String(step?.status || "locked"),
    priority: Number(step?.priority || index + 1),
    xpReward: Number(step?.xpReward || 20),
    startedAt: step?.startedAt ? new Date(step.startedAt) : null,
    completedAt: step?.completedAt ? new Date(step.completedAt) : null,
    unlockedAt: step?.unlockedAt ? new Date(step.unlockedAt) : null,
    proofStatus: String(step?.proofStatus || "not_submitted"),
    proofText: String(step?.proofText || ""),
    proofLink: String(step?.proofLink || ""),
    proofImageUrl: String(step?.proofImageUrl || ""),
    proofSubmittedAt: step?.proofSubmittedAt ? new Date(step.proofSubmittedAt) : null
  };
}

function syncRoadmapState(roadmap = {}) {
  const now = new Date();
  const lockMs = ROADMAP_STEP_LOCK_HOURS * 60 * 60 * 1000;
  const rawSteps = Array.isArray(roadmap?.steps) ? roadmap.steps : [];
  const steps = rawSteps.map((step, index) => normalizeRoadmapStep(step, index));
  let changed = false;
  let progressPercent = 0;
  let currentStepId = "";

  steps.forEach((step, index) => {
    const previous = index > 0 ? steps[index - 1] : null;
    const hasProof = Boolean(step.proofSubmittedAt || step.proofText || step.proofLink || step.proofImageUrl);

    if (step.completedAt && !hasProof) {
      step.completedAt = null;
      step.proofStatus = "not_submitted";
      changed = true;
    }

    if (step.completedAt) {
      step.status = "completed";
      if (step.proofStatus === "not_submitted") step.proofStatus = "approved";
      return;
    }

    const availableFrom =
      index === 0
        ? step.unlockedAt || now
        : previous?.completedAt
          ? new Date(previous.completedAt.getTime() + lockMs)
          : null;

    if (!step.unlockedAt || Number(step.unlockedAt) !== Number(availableFrom || null)) {
      step.unlockedAt = availableFrom;
      changed = true;
    }

    const isUnlocked = Boolean(availableFrom) && availableFrom.getTime() <= now.getTime();
    const shouldBeActive = !currentStepId && isUnlocked;
    const nextStatus = shouldBeActive ? "active" : "locked";

    if (step.status !== nextStatus) {
      step.status = nextStatus;
      changed = true;
    }

    if (shouldBeActive) currentStepId = step.id;
  });

  const completedCount = steps.filter((step) => step.status === "completed").length;
  progressPercent = steps.length ? Math.round((completedCount / steps.length) * 100) : 0;

  if (!currentStepId) {
    currentStepId = steps.find((step) => step.status === "active")?.id || "";
  }

  return {
    steps,
    changed,
    progressPercent,
    currentStepId
  };
}

async function persistSyncedRoadmapState(state) {
  const synced = syncRoadmapState(state?.roadmap || {});
  if (!state?.roadmap) {
    state.roadmap = {
      roadmapId: "",
      steps: [],
      progressPercent: 0,
      currentStepId: "",
      updatedAt: null
    };
  }

  state.roadmap.steps = synced.steps;
  state.roadmap.progressPercent = synced.progressPercent;
  state.roadmap.currentStepId = synced.currentStepId;
  if (synced.changed) {
    state.roadmap.updatedAt = new Date();
    await state.save();
  }
  return synced;
}

function buildSprintRevenueSnapshot(amount) {
  const normalizedAmount = Math.max(Number(amount || 0), 0);
  const platformFeeAmount = roundCurrency((normalizedAmount * SPRINT_PLATFORM_FEE_PERCENT) / 100);
  const mentorPayoutAmount = roundCurrency(normalizedAmount - platformFeeAmount);
  return {
    platformFeePercent: SPRINT_PLATFORM_FEE_PERCENT,
    mentorSharePercent: SPRINT_MENTOR_SHARE_PERCENT,
    platformFeeAmount,
    mentorPayoutAmount
  };
}

function createLivePaymentDueAt() {
  return new Date(Date.now() + manualPaymentWindowMinutes * 60 * 1000);
}

function createSprintPaymentDueAt() {
  return new Date(Date.now() + manualPaymentWindowMinutes * 60 * 1000);
}

function getResolvedSprintPayoutStatus(enrollment = {}, sprint = null) {
  if (enrollment?.payoutStatus && enrollment.payoutStatus !== "not_ready") return enrollment.payoutStatus;
  const isPaid = String(enrollment?.paymentStatus || "") === "paid";
  const hasEnded = sprint?.endDate ? new Date(sprint.endDate).getTime() <= Date.now() : false;
  return isPaid && hasEnded ? "pending" : "not_ready";
}

function getResolvedSprintMentorConfirmationStatus(enrollment = {}, sprint = null) {
  if (enrollment?.mentorPayoutConfirmationStatus && enrollment.mentorPayoutConfirmationStatus !== "not_ready") {
    return enrollment.mentorPayoutConfirmationStatus;
  }
  const payoutStatus = getResolvedSprintPayoutStatus(enrollment, sprint);
  if (payoutStatus === "paid") return "pending";
  if (payoutStatus === "issue_reported") return "issue_reported";
  return "not_ready";
}

function buildSprintEnrollmentFinancials(enrollment = {}, sprint = null) {
  const snapshot = buildSprintRevenueSnapshot(enrollment.amount || 0);
  return {
    amount: roundCurrency(enrollment.amount || 0),
    platformFeePercent: Number(enrollment.platformFeePercent || snapshot.platformFeePercent),
    mentorSharePercent: Number(enrollment.mentorSharePercent || snapshot.mentorSharePercent),
    platformFeeAmount: roundCurrency(enrollment.platformFeeAmount || snapshot.platformFeeAmount),
    mentorPayoutAmount: roundCurrency(enrollment.mentorPayoutAmount || snapshot.mentorPayoutAmount),
    payoutStatus: getResolvedSprintPayoutStatus(enrollment, sprint),
    mentorPayoutConfirmationStatus: getResolvedSprintMentorConfirmationStatus(enrollment, sprint)
  };
}

async function getSprintMentorPayoutProfiles(mentorIds = []) {
  if (!mentorIds.length) return new Map();
  const rows = await MentorProfile.find({ userId: { $in: mentorIds } })
    .select("userId payoutUpiId payoutQrCodeUrl payoutPhoneNumber phoneNumber title company")
    .lean();

  return new Map(
    rows.map((item) => [
      String(item.userId),
      {
        upiId: item.payoutUpiId || "",
        qrCodeUrl: item.payoutQrCodeUrl || "",
        phoneNumber: item.payoutPhoneNumber || item.phoneNumber || "",
        title: item.title || "",
        company: item.company || ""
      }
    ])
  );
}

function enrichSprintEnrollmentForPayout(enrollment = {}, sprint = null, mentorPaymentDetails = null) {
  const financials = buildSprintEnrollmentFinancials(enrollment, sprint);
  const isPaid = String(enrollment?.paymentStatus || "") === "paid";
  const hasEnded = sprint?.endDate ? new Date(sprint.endDate).getTime() <= Date.now() : false;
  const hasMentorPaymentDetails = Boolean(
    mentorPaymentDetails?.upiId || mentorPaymentDetails?.qrCodeUrl || mentorPaymentDetails?.phoneNumber
  );

  return {
    ...enrollment,
    ...financials,
    sprintId: sprint
      ? {
          _id: sprint._id,
          title: sprint.title,
          startDate: sprint.startDate,
          endDate: sprint.endDate,
          sessionMode: sprint.sessionMode,
          price: sprint.price,
          currency: sprint.currency,
          posterImageUrl: sprint.posterImageUrl || ""
        }
      : enrollment.sprintId,
    mentorPaymentDetails: mentorPaymentDetails || {
      upiId: "",
      qrCodeUrl: "",
      phoneNumber: "",
      title: "",
      company: ""
    },
    payoutEligible: isPaid && hasEnded,
    hasMentorPaymentDetails,
    canAdminMarkPayoutPaid:
      isPaid &&
      hasEnded &&
      hasMentorPaymentDetails &&
      ["pending", "issue_reported"].includes(financials.payoutStatus),
    canMentorConfirmPayout:
      financials.payoutStatus === "paid" &&
      ["pending", "issue_reported"].includes(financials.mentorPayoutConfirmationStatus)
  };
}

function normalizeLiveSessionPayload(item, reqUserId, bookingBySessionId = new Map()) {
  const booking = bookingBySessionId.get(String(item._id || item.id || ""));
  return {
    id: item._id || item.id,
    title: item.title,
    topic: item.topic,
    description: item.description,
    posterImageUrl: item.posterImageUrl || "",
    startsAt: item.startsAt,
    endsAt: item.endsAt,
    durationMinutes: Number(item.durationMinutes || 60),
    meetingProvider: item.meetingProvider || "manual",
    meetingLink: item.meetingLink || "",
    domainTags: item.domainTags || [],
    sessionMode: item.sessionMode || "free",
    price: Number(item.price || 0),
    currency: item.currency || "INR",
    maxParticipants: Number(item.maxParticipants || 50),
    approvalStatus: item.approvalStatus || "pending",
    adminReviewNote: item.adminReviewNote || "",
    interestedCount: Array.isArray(item.interestedUserIds) ? item.interestedUserIds.length : 0,
    isInterested: Array.isArray(item.interestedUserIds)
      ? item.interestedUserIds.some((userId) => String(userId) === String(reqUserId))
      : false,
    participantCount: Number(item.bookingCount || 0),
    seatsLeft: Math.max(Number(item.maxParticipants || 50) - Number(item.bookingCount || 0), 0),
    mentor: {
      id: item.mentorId?._id || item.mentor?.id || null,
      name: item.mentorId?.name || item.mentor?.name || "Mentor",
      email: item.mentorId?.email || item.mentor?.email || ""
    },
    myBooking: booking
      ? {
          id: booking._id,
          paymentMode: booking.paymentMode,
          paymentStatus: booking.paymentStatus,
          bookingStatus: booking.bookingStatus,
          paymentDueAt: booking.paymentDueAt || null
        }
      : null
  };
}

function normalizeSprintPayload(item, reqUserId, enrollmentBySprintId = new Map()) {
  const enrollment = enrollmentBySprintId.get(String(item._id || item.id || ""));
  const startDate = item.startDate ? new Date(item.startDate) : null;
  const endDate = item.endDate ? new Date(item.endDate) : null;
  const enrollmentFinancials = enrollment ? buildSprintEnrollmentFinancials(enrollment, item) : null;
  return {
    id: item._id || item.id,
    title: item.title,
    domain: item.domain || "",
    description: item.description || "",
    posterImageUrl: item.posterImageUrl || "",
    curriculumDocumentUrl: item.curriculumDocumentUrl || "",
    curriculumFileType: item.curriculumFileType || "",
    startDate: item.startDate,
    endDate: item.endDate,
    durationWeeks: Number(item.durationWeeks || 1),
    totalLiveSessions: Number(item.totalLiveSessions || 1),
    sessionSchedule: Array.isArray(item.sessionSchedule) ? item.sessionSchedule : [],
    weeklyPlan: Array.isArray(item.weeklyPlan) ? item.weeklyPlan : [],
    outcomes: Array.isArray(item.outcomes) ? item.outcomes : [],
    tools: Array.isArray(item.tools) ? item.tools : [],
    meetingProvider: item.meetingProvider || "manual",
    meetingLink: item.meetingLink || "",
    sessionMode: item.sessionMode || "free",
    price: Number(item.price || 0),
    currency: item.currency || "INR",
    minParticipants: Number(item.minParticipants || 1),
    maxParticipants: Number(item.maxParticipants || 20),
    approvalStatus: item.approvalStatus || "pending",
    adminReviewNote: item.adminReviewNote || "",
    participantCount: Number(item.enrollmentCount || 0),
    seatsLeft: Math.max(Number(item.maxParticipants || 20) - Number(item.enrollmentCount || 0), 0),
    isSoldOut: Number(item.enrollmentCount || 0) >= Number(item.maxParticipants || 20),
    mentor: {
      id: item.mentorId?._id || item.mentor?.id || null,
      name: item.mentorId?.name || item.mentor?.name || "Mentor",
      email: item.mentorId?.email || item.mentor?.email || ""
    },
    statusLabel:
      startDate && endDate
        ? `${startDate.toLocaleDateString("en-IN")} - ${endDate.toLocaleDateString("en-IN")}`
        : "Sprint",
    myEnrollment: enrollment
      ? {
          id: enrollment._id,
          paymentMode: enrollment.paymentMode,
          paymentStatus: enrollment.paymentStatus,
          enrollmentStatus: enrollment.enrollmentStatus,
          paymentDueAt: enrollment.paymentDueAt || null,
          amount: enrollmentFinancials?.amount || Number(enrollment.amount || 0),
          mentorPayoutAmount: enrollmentFinancials?.mentorPayoutAmount || Number(enrollment.mentorPayoutAmount || 0),
          platformFeeAmount: enrollmentFinancials?.platformFeeAmount || Number(enrollment.platformFeeAmount || 0),
          payoutStatus: enrollmentFinancials?.payoutStatus || "not_ready",
          mentorPayoutConfirmationStatus: enrollmentFinancials?.mentorPayoutConfirmationStatus || "not_ready"
        }
      : null
  };
}

async function expireOverdueLiveSessionBookings() {
  await MentorLiveSessionBooking.updateMany(
    {
      paymentStatus: "pending",
      bookingStatus: "pending_payment",
      paymentDueAt: { $lt: new Date() }
    },
    {
      $set: {
        bookingStatus: "cancelled",
        paymentStatus: "cancelled",
        cancelledAt: new Date()
      }
    }
  );
}

async function expireOverdueSprintEnrollments() {
  await MentorSprintEnrollment.updateMany(
    {
      paymentStatus: "pending",
      enrollmentStatus: "pending_payment",
      paymentDueAt: { $lt: new Date() }
    },
    {
      $set: {
        enrollmentStatus: "cancelled",
        paymentStatus: "cancelled",
        cancelledAt: new Date()
      }
    }
  );
}

function isValidDomainSelection(primaryCategory, subCategory, focus) {
  if (!primaryCategory) return false;
  const subMap = mentorCategoryTree[primaryCategory];
  if (!subMap) return false;
  if (!subCategory) return true;
  const focusList = subMap[subCategory];
  if (!focusList) return false;
  if (!focus) return true;
  return focusList.some((item) => normalizeText(item) === normalizeText(focus));
}

function resolveAiDomainContext({ user, primaryCategory, subCategory, focus }) {
  const primary = String(primaryCategory || user?.primaryCategory || "").trim();
  const sub = String(subCategory || user?.subCategory || "").trim();
  const nextFocus = String(focus || "").trim();

  const primaryOk = primary && mentorCategoryTree[primary];
  const effectivePrimary = primaryOk ? primary : (Object.keys(mentorCategoryTree)[0] || "");

  const subMap = mentorCategoryTree[effectivePrimary] || {};
  const effectiveSub = sub && subMap[sub] ? sub : (Object.keys(subMap)[0] || "");

  const focuses = effectiveSub ? (subMap[effectiveSub] || []) : [];
  const effectiveFocus =
    nextFocus && focuses.some((f) => normalizeText(f) === normalizeText(nextFocus))
      ? nextFocus
      : (focuses[0] || "");

  const goalLabel = [effectivePrimary, effectiveSub, effectiveFocus].filter(Boolean).join(" > ").trim();
  return {
    primaryCategory: effectivePrimary,
    subCategory: effectiveSub,
    focus: effectiveFocus,
    goalLabel: goalLabel || effectivePrimary || "Career Growth"
  };
}

const DOMAIN_AI_TEMPLATES = {
  "Technology & AI": {
    "Web Development": {
      Frontend: {
        requiredSkills: ["HTML", "CSS", "JavaScript", "React", "Git", "Responsive Design"],
        roadmap: ["HTML + CSS fundamentals", "JavaScript basics + DOM", "React fundamentals", "State management + routing", "API integration + projects"],
        projects: ["Portfolio Website", "React Notes App", "E-commerce UI", "Weather App with API", "Job Tracker Dashboard"]
      },
      Backend: {
        requiredSkills: ["Node.js", "Express", "REST APIs", "MongoDB", "Authentication (JWT)", "Deployment basics"],
        roadmap: ["Node.js fundamentals", "Express + REST design", "MongoDB + Mongoose", "Auth + security", "Deploy on Render + monitoring"],
        projects: ["Auth API Starter", "Mentor Booking API", "Chat API (basic)", "Blog API with roles", "Payments verification mock"]
      },
      "Full Stack": {
        requiredSkills: ["HTML", "CSS", "JavaScript", "React", "Node.js", "MongoDB", "Auth", "Deployment"],
        roadmap: ["Frontend foundations", "Backend foundations", "Auth + roles", "End-to-end full stack project", "Deploy + optimize"],
        projects: ["Full Stack Mentor Platform", "Realtime Chat App", "Task Manager SaaS", "College Community App", "Mini LinkedIn Feed"]
      }
    },
    "Data Science": {
      Python: {
        requiredSkills: ["Python", "Pandas", "NumPy", "Matplotlib", "Data Cleaning"],
        roadmap: ["Python basics", "Pandas + cleaning", "EDA + charts", "Mini dashboards", "Case studies portfolio"],
        projects: ["EDA Portfolio", "Student Performance Dashboard", "Sales Insights Report", "Data Cleaning Toolkit"]
      },
      Statistics: {
        requiredSkills: ["Probability", "Statistics", "Hypothesis Testing", "Regression basics"],
        roadmap: ["Probability basics", "Descriptive stats", "Inferential stats", "Regression", "Practice with datasets"],
        projects: ["Stats Notes + Examples", "A/B Test Simulator", "Regression Case Study"]
      },
      "Data Visualization": {
        requiredSkills: ["Power BI", "Tableau", "Charts", "Storytelling", "SQL basics"],
        roadmap: ["Charts basics", "SQL for analysis", "Dashboard building", "Storytelling", "Portfolio publishing"],
        projects: ["Power BI Dashboard Pack", "Tableau Portfolio", "SQL + Dashboard case study"]
      }
    },
    "AI/ML": {
      "Machine Learning": {
        requiredSkills: ["Python", "Data Structures", "Statistics", "Scikit-learn", "Model evaluation"],
        roadmap: ["Python + math basics", "Supervised ML", "Unsupervised ML", "Evaluation + tuning", "Mini projects"],
        projects: ["Spam Classifier", "House Price Predictor", "Student Marks Predictor", "Recommendation Basics"]
      },
      "Deep Learning": {
        requiredSkills: ["Neural Networks", "PyTorch/TensorFlow", "CNN/RNN basics", "GPU basics"],
        roadmap: ["NN foundations", "CNN projects", "Sequence models", "Transfer learning", "Deploy a model"],
        projects: ["Image Classifier", "Face Mask Detector", "Text Sentiment Model"]
      },
      MLOps: {
        requiredSkills: ["APIs", "Docker basics", "Model deployment", "Monitoring"],
        roadmap: ["Serving models with APIs", "Dockerize", "CI/CD basics", "Monitoring + logs", "Production checklist"],
        projects: ["Model API + Docker", "Batch prediction pipeline", "Monitoring dashboard (basic)"]
      }
    }
  },
  Academic: {
    School: {
      Math: {
        requiredSkills: ["Arithmetic", "Algebra basics", "Geometry", "Practice routines"],
        roadmap: ["Basics revision", "Topic-wise practice", "Weak areas drills", "Mock tests", "Final revision"],
        projects: ["Daily Practice Planner", "Formula Flashcards Pack"]
      },
      Science: {
        requiredSkills: ["Physics basics", "Chemistry basics", "Biology basics", "Diagrams + notes"],
        roadmap: ["Concept foundation", "NCERT-style reading", "Short notes", "Practice questions", "Revision"],
        projects: ["Science Notes Organizer", "Diagram Revision Pack"]
      },
      English: {
        requiredSkills: ["Grammar", "Reading comprehension", "Vocabulary", "Writing practice"],
        roadmap: ["Grammar basics", "Daily reading", "Writing practice", "Mock papers", "Revision"],
        projects: ["Vocabulary Tracker", "Writing Prompts Log"]
      },
      "Social Studies": {
        requiredSkills: ["History basics", "Geography basics", "Civics basics", "Map practice"],
        roadmap: ["NCERT-style foundation", "Notes + timelines", "Map practice", "Mock tests", "Revision"],
        projects: ["Timeline Notes Organizer", "Map Practice Planner"]
      }
    },
    Intermediate: {
      MPC: {
        requiredSkills: ["Maths", "Physics", "Chemistry", "Problem solving speed"],
        roadmap: ["Concept foundation", "Formula notes", "Daily practice sets", "Weekly mocks", "Revision cycles"],
        projects: ["MPC Revision Planner", "Formula Flashcards"]
      },
      BiPC: {
        requiredSkills: ["Biology", "Physics", "Chemistry", "Diagram practice"],
        roadmap: ["NCERT + basics", "Short notes", "Daily MCQs", "Weekly mocks", "Revision"],
        projects: ["BiPC Notes Organizer", "MCQ Practice Tracker"]
      },
      MEC: {
        requiredSkills: ["Maths", "Economics", "Commerce basics", "Problem solving"],
        roadmap: ["Math practice plan", "Eco concepts", "Commerce notes", "Mocks", "Revision"],
        projects: ["MEC Study Tracker", "Economics Notes Pack"]
      },
      CEC: {
        requiredSkills: ["Civics", "Economics", "Commerce", "Writing practice"],
        roadmap: ["Concept foundation", "Short notes", "Answer writing", "Mocks", "Revision"],
        projects: ["CEC Notes Organizer", "Answer Writing Tracker"]
      }
    },
    Engineering: {
      CSE: {
        requiredSkills: ["Programming basics", "Data Structures", "Projects", "Placements preparation"],
        roadmap: ["Pick a track (Web/AI)", "DSA practice", "Build 2 projects", "Resume + GitHub", "Mock interviews"],
        projects: ["Portfolio + GitHub setup", "Mini Project Series"]
      },
      ECE: {
        requiredSkills: ["Electronics basics", "Signals", "Projects", "Communication skills"],
        roadmap: ["Core subjects plan", "Lab/project work", "Internship prep", "Resume", "Mocks"],
        projects: ["Mini Hardware Project Log", "Electronics Notes Organizer"]
      },
      EEE: {
        requiredSkills: ["Circuits", "Machines", "Power systems basics"],
        roadmap: ["Core concepts", "Numericals practice", "Projects", "Internship prep", "Revision"],
        projects: ["EEE Revision Planner", "Numericals Tracker"]
      },
      Mechanical: {
        requiredSkills: ["Mechanics", "Thermodynamics", "Design basics"],
        roadmap: ["Concept revision", "Numericals", "Mini projects", "Internship prep", "Mocks"],
        projects: ["Mechanical Notes Organizer", "Project Portfolio"]
      }
    },
    MBA: {
      Marketing: {
        requiredSkills: ["Marketing basics", "Communication", "Case studies"],
        roadmap: ["Concept foundation", "Case practice", "Portfolio", "Interview prep", "Revision"],
        projects: ["Marketing Case Notes", "Pitch Deck Practice"]
      },
      Finance: {
        requiredSkills: ["Accounting basics", "Finance concepts", "Excel basics"],
        roadmap: ["Accounting foundation", "Finance concepts", "Excel models", "Case studies", "Revision"],
        projects: ["Finance Notes Pack", "Excel Model Tracker"]
      },
      Operations: {
        requiredSkills: ["Process thinking", "Basics of ops", "Case studies"],
        roadmap: ["Ops concepts", "Case practice", "Mini projects", "Interview prep", "Revision"],
        projects: ["Ops Case Notes", "Process Improvement Log"]
      },
      HR: {
        requiredSkills: ["HR basics", "Communication", "Policies"],
        roadmap: ["Core HR concepts", "Case studies", "Policy notes", "Interview prep", "Revision"],
        projects: ["HR Notes Organizer", "Interview Q&A Pack"]
      }
    },
    Law: {
      "Constitutional Law": {
        requiredSkills: ["Constitution basics", "Fundamental Rights", "Judicial Review", "Landmark cases"],
        roadmap: ["Basics + terminology", "Rights + duties", "Institutions", "Landmark case notes", "Mock answers + revision"],
        projects: ["Case Notes Organizer", "Constitution Flashcards"]
      },
      "Corporate Law": {
        requiredSkills: ["Companies Act basics", "Contracts basics", "Compliance"],
        roadmap: ["Company structures", "Contracts", "Compliance + filings", "Case studies", "Mock questions"],
        projects: ["Compliance Checklist Notes", "Corporate Law Q&A Bank"]
      },
      Litigation: {
        requiredSkills: ["Court process basics", "Drafting", "Evidence basics"],
        roadmap: ["Court procedures", "Drafting practice", "Evidence basics", "Moot prep", "Revision"],
        projects: ["Drafting Templates Pack", "Moot Notes Organizer"]
      }
    }
  },
  "Competitive Exams": {
    JEE: {
      "JEE Main": {
        requiredSkills: ["Maths", "Physics", "Chemistry", "Speed practice"],
        roadmap: ["Concepts foundation", "Daily problem sets", "Weekly mocks", "Analysis", "Revision"],
        projects: ["JEE Mock Planner", "Formula Notes Pack"]
      },
      "JEE Advanced": {
        requiredSkills: ["Advanced problem solving", "Strong concepts", "Time management"],
        roadmap: ["Advanced practice", "Mixed sets", "Mocks", "Weak area drills", "Revision"],
        projects: ["Advanced Problems Log", "Revision Tracker"]
      },
      "Revision Strategy": {
        requiredSkills: ["Short notes", "Mocks", "Analysis"],
        roadmap: ["Short notes", "Mock series", "Analysis", "Targeted revision", "Final revision"],
        projects: ["Revision Planner", "Mistakes Notebook"]
      }
    },
    NEET: {
      Biology: {
        requiredSkills: ["NCERT Biology", "Diagrams", "Daily MCQs"],
        roadmap: ["NCERT reading", "Short notes", "MCQs", "Mocks", "Revision"],
        projects: ["Biology MCQ Tracker", "Diagram Revision Pack"]
      },
      Physics: {
        requiredSkills: ["Formulas", "Numericals", "Concept clarity"],
        roadmap: ["Concept basics", "Numericals", "Mocks", "Analysis", "Revision"],
        projects: ["Physics Formula Notes", "Numericals Tracker"]
      },
      Chemistry: {
        requiredSkills: ["Inorganic", "Organic", "Physical chemistry basics"],
        roadmap: ["Concept foundation", "Practice", "Mocks", "Weak areas", "Revision"],
        projects: ["Chemistry Notes Pack", "Practice Tracker"]
      }
    },
    UPSC: {
      Prelims: {
        requiredSkills: ["Polity", "Economy", "History", "Geography", "Environment", "Current Affairs"],
        roadmap: ["NCERT foundation", "Subject-wise coverage", "Daily current affairs", "Mock tests + analysis", "Revision cycles"],
        projects: ["Daily Current Affairs Tracker", "UPSC Prelims Mock Planner"]
      },
      Mains: {
        requiredSkills: ["Answer writing", "Ethics", "GS papers", "Optional subject strategy"],
        roadmap: ["GS framework", "Answer writing practice", "Optional planning", "Test series", "Revision + feedback"],
        projects: ["Answer Writing Tracker", "Mains Notes Organizer"]
      },
      Interview: {
        requiredSkills: ["Communication", "DAF prep", "Current affairs discussion", "Mock interviews"],
        roadmap: ["DAF deep dive", "Mock interviews", "Current issues speaking", "Personality prep", "Final polishing"],
        projects: ["Interview Q&A Bank", "Mock Interview Planner"]
      }
    }
  }
};

function findTemplate(primaryCategory, subCategory, focus) {
  const p = DOMAIN_AI_TEMPLATES[primaryCategory];
  if (!p) return null;
  const s = subCategory ? p[subCategory] : null;
  if (!s) return null;
  if (!focus) return s.__default || null;
  return s[focus] || s.__default || null;
}

function uniqList(items = []) {
  const seen = new Set();
  const out = [];
  items.forEach((item) => {
    const v = String(item || "").trim();
    if (!v) return;
    const key = normalizeText(v);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(v);
  });
  return out;
}

function escapeRegExp(value = "") {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildDomainMatchRegexes(domain = "") {
  const raw = String(domain || "").trim();
  if (!raw) return [];

  const variants = uniqList([
    raw,
    raw.replace(/&/g, "and"),
    raw.replace(/\band\b/gi, "&"),
    raw.replace(/\s+/g, " ")
  ])
    .map((item) => String(item || "").trim())
    .filter(Boolean);

  return variants.map((item) => new RegExp(`^\\s*${escapeRegExp(item)}\\s*$`, "i"));
}

function buildGenericTemplate(primaryCategory, subCategory, focus) {
  const primary = String(primaryCategory || "").trim();
  const sub = String(subCategory || "").trim();
  const f = String(focus || "").trim();
  const primaryKey = normalizeText(primary);
  const subKey = normalizeText(sub);

  const goalLabel = [primary, sub, f].filter(Boolean).join(" > ").trim() || primary || "Career Growth";

  // Defaults per primary domain (so content feels relevant even without manual templates).
  let required = [];
  let roadmap = [];
  let projects = [];

  if (primaryKey.includes("competitive")) {
    if (subKey === "ssc") required = ["Quant", "Reasoning", "English", "General Awareness", "Mock tests"];
    else if (subKey.includes("banking")) required = ["Quant", "Reasoning", "English", "Banking Awareness", "Mock tests"];
    else if (subKey.includes("tgpsc") || subKey.includes("gpsc")) required = ["General Studies", "Polity", "Economy", "History", "Current Affairs"];
    else if (subKey === "jee") required = ["Maths", "Physics", "Chemistry", "Problem solving speed"];
    else if (subKey === "neet") required = ["Biology", "Physics", "Chemistry", "NCERT mastery"];
    else if (subKey.includes("upsc")) required = ["Polity", "Economy", "History", "Geography", "Ethics", "Current Affairs"];
    else required = ["Syllabus coverage", "Short notes", "Practice sets", "Mock tests", "Revision"];

    roadmap = [
      `Understand syllabus for ${f || sub || "this exam"}`,
      "Build short notes + formula sheets",
      "Daily practice sets (MCQs / problems)",
      "Weekly mock tests + analysis",
      "Revision cycles + weak-area drills"
    ];
    projects = [
      `${f || sub || "Exam"} Mock Planner`,
      "Revision Tracker",
      "Mistake Notebook",
      "Daily Current Affairs Log"
    ];
  } else if (primaryKey.includes("professional courses")) {
    if (subKey === "ca") required = ["Accounting", "Taxation", "Law", "Costing", "Mock papers"];
    else if (subKey === "cs") required = ["Company Law", "Compliance", "Drafting", "Mock papers"];
    else if (subKey === "cma") required = ["Costing", "Accounting", "Taxation", "Mock papers"];
    else required = ["Core syllabus", "Practice questions", "Mock papers", "Revision"];

    roadmap = [
      "Understand syllabus + study plan",
      "Concept foundation (modules/units)",
      "Problem practice + writing practice",
      "Mock tests + evaluation",
      "Final revision + exam strategy"
    ];
    projects = ["Study Plan Tracker", "Revision Notes Organizer", "Mock Test Analysis Sheet"];
  } else if (primaryKey.includes("career") && primaryKey.includes("placements")) {
    required = ["Resume", "Projects/portfolio", "Aptitude", "Communication", "Mock interviews"];
    roadmap = [
      "Fix goal + domain track",
      "Build 2 portfolio projects / achievements",
      "Resume + LinkedIn cleanup",
      "Aptitude + DSA practice schedule",
      "Mock interviews + feedback loop"
    ];
    projects = ["Resume Checklist", "Mock Interview Log", "Portfolio Tracker"];
  } else if (primaryKey.includes("startups") || primaryKey.includes("entrepreneur")) {
    required = ["Problem selection", "Idea validation", "MVP building", "Go-to-market", "Pitching"];
    roadmap = [
      "Pick problem + target users",
      "Validate with 20 user conversations",
      "Build MVP and iterate weekly",
      "Design go-to-market plan",
      "Pitch deck + fundraising basics"
    ];
    projects = ["MVP Tracker", "User Interview Notes", "Pitch Deck Draft"];
  } else if (primaryKey.includes("finance") || primaryKey.includes("invest")) {
    required = ["Personal finance basics", "Risk management", "Instruments knowledge", "Portfolio strategy", "Tracking"];
    roadmap = [
      "Understand basics (returns, risk, inflation)",
      "Learn instruments for your track (stocks/mutual funds)",
      "Create a plan + rules",
      "Track a sample portfolio",
      "Review monthly + improve"
    ];
    projects = ["Budget Planner", "Portfolio Tracker", "Risk Checklist"];
  } else if (primaryKey.includes("creative") || primaryKey.includes("design")) {
    required = ["Design fundamentals", "Tools (Figma/Canva)", "Typography", "Color", "Portfolio"];
    roadmap = [
      "Learn design basics (layout, type, color)",
      "Practice tool workflows",
      "Build 3 mini designs",
      "Create 1 full case study",
      "Publish portfolio + take feedback"
    ];
    projects = ["UI Portfolio", "Branding Pack", "Design Case Study"];
  } else if (primaryKey.includes("personal development")) {
    required = ["Communication", "Productivity", "Confidence", "Leadership", "Consistency"];
    roadmap = [
      "Baseline self-assessment",
      "Daily micro-habits",
      "Weekly reflection",
      "Practice with mentors/peers",
      "Track progress + improve"
    ];
    projects = ["Habit Tracker", "Communication Practice Log", "Weekly Reflection Notes"];
  } else if (primaryKey.includes("academic")) {
    required = ["Concept clarity", "Short notes", "Practice questions", "Mock tests", "Revision"];
    roadmap = [
      `Cover syllabus for ${f || sub || "your track"}`,
      "Build short notes",
      "Daily practice questions",
      "Weekly mock tests",
      "Revision cycle"
    ];
    projects = ["Study Planner", "Notes Organizer", "Mock Test Tracker"];
  } else {
    required = ["Foundation concepts", "Practice", "Consistency", "Mentorship", "Portfolio/proof"];
    roadmap = ["Foundation", "Core concepts", "Practice", "Feedback loop", "Publish outcomes"];
    projects = ["Weekly Plan", "Progress Tracker", "Notes Organizer"];
  }

  // If Domain Guide focus list exists, blend it into required topics as context, not as "skills".
  const focusList = mentorCategoryTree?.[primary]?.[sub] || [];
  const focusContext = focusList.slice(0, 5);

  return {
    requiredSkills: uniqList([...required, ...(sub ? [sub] : []), ...(f ? [f] : []), ...focusContext]),
    roadmap: uniqList([...roadmap]),
    projects: uniqList([...projects]),
    goalLabel,
    generated: true
  };
}

function getAiTemplate(primaryCategory, subCategory, focus) {
  return findTemplate(primaryCategory, subCategory, focus) || buildGenericTemplate(primaryCategory, subCategory, focus);
}

function buildRoadmapRequestId(goal = "", ctx = {}) {
  return [goal, ctx?.primaryCategory, ctx?.subCategory, ctx?.focus]
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .join("::");
}

function contextualizeRoadmapTopic(topic = "", ctx = {}) {
  const rawTopic = String(topic || "").trim();
  if (!rawTopic) return rawTopic;

  const focus = String(ctx?.focus || "").trim();
  const subCategory = String(ctx?.subCategory || "").trim();
  const primaryCategory = String(ctx?.primaryCategory || "").trim();
  const domainLabel = focus || subCategory || primaryCategory || "your domain";
  const normalizedTopic = normalizeText(rawTopic);
  const contextKeys = [focus, subCategory, primaryCategory].map((item) => normalizeText(item)).filter(Boolean);

  if (contextKeys.some((key) => normalizedTopic.includes(key))) {
    return rawTopic;
  }

  const exactReplacements = new Map([
    ["basics revision", `Foundations and concept revision for ${domainLabel}`],
    ["topic wise practice", `Topic-wise practice and worked examples for ${domainLabel}`],
    ["topic-wise practice", `Topic-wise practice and worked examples for ${domainLabel}`],
    ["weak areas drills", `Weak-area drills and correction for ${domainLabel}`],
    ["mock tests", `${domainLabel} mock tests and performance review`],
    ["mock papers", `${domainLabel} mock papers and answer review`],
    ["weekly mocks", `${domainLabel} weekly mocks and score analysis`],
    ["final revision", `Final revision strategy for ${domainLabel}`],
    ["concept foundation", `Concept foundation for ${domainLabel}`],
    ["short notes", `Short notes and memory aids for ${domainLabel}`],
    ["practice questions", `Practice questions and worked examples for ${domainLabel}`],
    ["revision", `Revision and reinforcement for ${domainLabel}`],
    ["analysis", `Performance analysis and targeted correction for ${domainLabel}`],
    ["numericals", `Numericals and applied practice for ${domainLabel}`],
    ["projects", `Hands-on projects in ${domainLabel}`],
    ["portfolio", `Portfolio proof and presentation for ${domainLabel}`],
    ["interview prep", `Interview preparation for ${domainLabel}`],
    ["mocks", `${domainLabel} mocks and review`]
  ]);

  if (exactReplacements.has(normalizedTopic)) {
    return exactReplacements.get(normalizedTopic);
  }

  if (/revision/.test(normalizedTopic) && !/final|strategy/.test(normalizedTopic)) {
    return `${rawTopic} for ${domainLabel}`;
  }
  if (/practice|mock|analysis|questions|notes|foundation|concept/.test(normalizedTopic)) {
    return `${rawTopic} in ${domainLabel}`;
  }

  return rawTopic;
}

function formatWeeklyRoadmap(topics = [], ctx = {}) {
  return topics.map((topic, index) => `Week ${index + 1}: ${contextualizeRoadmapTopic(topic, ctx)}`);
}

function getRoadmapForGoal(goal = "", ctx = {}) {
  const normalized = normalizeText(goal);
  const focus = String(ctx?.focus || "").trim();
  const subCategory = String(ctx?.subCategory || "").trim();
  const primaryCategory = String(ctx?.primaryCategory || "").trim();
  const domainLabel = focus || subCategory || primaryCategory || goal || "your domain";
  const focusKey = normalizeText(`${focus} ${subCategory} ${primaryCategory} ${goal}`);

  if (/(ai|ml|machine learning|data scientist|deep learning)/i.test(normalized) || /(ai|ml|machine learning|deep learning)/i.test(focusKey)) {
    if (/nlp|language model|llm|text/i.test(focusKey)) {
      return formatWeeklyRoadmap([
        "Python for text processing and dataset cleaning",
        "Tokenization, embeddings, and transformer basics for NLP",
        "Build a text classification or chatbot workflow",
        "Evaluate prompts, responses, and model quality",
        "Deploy an NLP mini product for your portfolio"
      ], ctx);
    }
    if (/computer vision|vision|image/i.test(focusKey)) {
      return formatWeeklyRoadmap([
        "Python, NumPy, and image processing foundations",
        "CNN and feature extraction basics for computer vision",
        "Train an image classification or detection model",
        "Model evaluation, augmentation, and error analysis",
        "Deploy a vision demo aligned to your portfolio goal"
      ], ctx);
    }
    return formatWeeklyRoadmap([
      `Python and data handling for ${domainLabel}`,
      `Math and ML foundations used in ${domainLabel}`,
      `Supervised learning workflows for ${domainLabel}`,
      `Model tuning, evaluation, and project execution in ${domainLabel}`,
      `Deployment and portfolio proof for ${domainLabel}`
    ], ctx);
  }
  if (/(web|frontend|backend|full stack|react|node)/i.test(normalized) || /(web|frontend|backend|react|node|full stack)/i.test(focusKey)) {
    if (/frontend|react|ui|ux/i.test(focusKey)) {
      return formatWeeklyRoadmap([
        "HTML, CSS, and responsive UI foundations",
        "Modern JavaScript and component-driven React basics",
        "State, routing, forms, and API integration",
        "Performance, accessibility, and polished UX patterns",
        "Deploy a frontend portfolio project with real proof"
      ], ctx);
    }
    if (/backend|node|api|server/i.test(focusKey)) {
      return formatWeeklyRoadmap([
        "JavaScript and Node.js server foundations",
        "REST API design, validation, and controllers",
        "Databases, auth, and secure backend workflows",
        "Payments, file uploads, and production concerns",
        "Deploy a backend-driven product with documentation"
      ], ctx);
    }
    return formatWeeklyRoadmap([
      "HTML, CSS, JavaScript, and product structure basics",
      "Frontend with React and reusable UI workflows",
      "Backend APIs with Node.js, auth, and databases",
      "Full-stack integration, testing, and deployment prep",
      "Launch a full-stack portfolio project in your chosen niche"
    ], ctx);
  }
  if (/(cyber|security|ethical hacking|soc)/i.test(normalized) || /(cyber|security|ethical hacking|soc)/i.test(focusKey)) {
    return formatWeeklyRoadmap([
      "Networking, Linux, and security mindset foundations",
      "Web, API, and authentication security essentials",
      "Vulnerability analysis and safe lab practice",
      "SOC workflows, logging, and incident response basics",
      "Document a security project or audit case study"
    ], ctx);
  }
  if (/(upsc|civil services)/i.test(normalized) || /(upsc|civil services|gs|mains)/i.test(focusKey)) {
    return formatWeeklyRoadmap([
      "NCERT and syllabus mapping for your attempt plan",
      "Polity, economy, and geography answer foundations",
      "Current affairs integration and revision system",
      "Mains answer writing and mock analysis practice",
      "Interview framing, reflection, and final revision strategy"
    ], ctx);
  }

  return formatWeeklyRoadmap([
    `Foundations and terminology for ${domainLabel}`,
    `Core concepts and guided practice in ${domainLabel}`,
    `Hands-on exercises and mini tasks for ${domainLabel}`,
    `Interview, review, and communication practice for ${domainLabel}`,
    `Portfolio proof and next-step strategy for ${domainLabel}`
  ], ctx);
}

function getRequiredSkillsForGoal(goal = "") {
  const normalized = normalizeText(goal);

  if (/(ai|ml|machine learning|data scientist|deep learning)/i.test(normalized)) {
    return ["Python", "Machine Learning", "Deep Learning", "MLOps", "Statistics", "Data Structures"];
  }
  if (/(web|frontend|backend|full stack|react|node)/i.test(normalized)) {
    return ["HTML", "CSS", "JavaScript", "React", "Node.js", "Databases", "APIs"];
  }
  if (/(cyber|security|ethical hacking|soc)/i.test(normalized)) {
    return ["Networking", "Linux", "Web Security", "Cryptography", "Incident Response"];
  }
  if (/(upsc|civil services)/i.test(normalized)) {
    return ["Polity", "Economy", "Geography", "History", "Ethics", "Current Affairs"];
  }

  return ["Communication", "Problem Solving", "Domain Fundamentals", "Projects", "Interview Preparation"];
}

function deriveSkillGapProfile({ goal = "", template = null, overrideSkills = [], journeyState = null, profileSkills = [] }) {
  const requiredSkills = template?.requiredSkills?.length ? template.requiredSkills : getRequiredSkillsForGoal(goal);
  const normalizedOverrideSkills = normalizeList(Array.isArray(overrideSkills) ? overrideSkills : [overrideSkills]);
  const normalizedStateKnownSkills = normalizeList(
    Array.isArray(journeyState?.skillProfile?.knownSkills) ? journeyState.skillProfile.knownSkills : [journeyState?.skillProfile?.knownSkills]
  );
  const normalizedProfileSkills = normalizeList(Array.isArray(profileSkills) ? profileSkills : [profileSkills]);
  const currentSkills = normalizedOverrideSkills.length
    ? normalizedOverrideSkills
    : normalizedStateKnownSkills.length
      ? normalizedStateKnownSkills
      : normalizedProfileSkills;
  const currentTokens = new Set(currentSkills.map((item) => normalizeText(item)));
  const missingSkills = requiredSkills.filter((skill) => !currentTokens.has(normalizeText(skill)));
  const readinessScore = requiredSkills.length
    ? Math.max(0, Math.min(100, Math.round((currentSkills.length / requiredSkills.length) * 100)))
    : 0;

  return {
    requiredSkills,
    currentSkills,
    missingSkills,
    readinessScore,
    level: inferSkillLevel({ knownSkills: currentSkills, missingSkills, readinessScore })
  };
}

function buildSkillAwareRoadmapId(goal = "", ctx = {}, knownSkills = []) {
  const base = buildRoadmapRequestId(goal, ctx);
  const skillSignature = normalizeList(knownSkills)
    .map((item) => normalizeText(item))
    .filter(Boolean)
    .sort()
    .join(",");
  return skillSignature ? `${base}::${skillSignature}` : base;
}

function buildProgressiveSkillStep(skill = "", ctx = {}, goal = "", knownSkills = []) {
  const skillLabel = String(skill || "").trim();
  if (!skillLabel) return "";

  const domainLabel =
    String(ctx?.focus || "").trim() ||
    String(ctx?.subCategory || "").trim() ||
    String(ctx?.primaryCategory || "").trim() ||
    String(goal || "").trim() ||
    "your target domain";
  const knownBase = normalizeList(knownSkills)[0] || "your current basics";
  const normalized = normalizeText(skillLabel);

  if (/html|css|javascript/.test(normalized)) return `${skillLabel} foundations and hands-on practice for ${domainLabel}`;
  if (/react/.test(normalized)) return `React components, state, and UI workflows for ${domainLabel}`;
  if (/node|express/.test(normalized)) return `Node.js, Express, and backend API workflows for ${domainLabel}`;
  if (/mongo|database|sql/.test(normalized)) return `${skillLabel} and data modeling workflows for ${domainLabel}`;
  if (/api|rest/.test(normalized)) return `${skillLabel} design, integration, and testing for ${domainLabel}`;
  if (/auth|jwt|security/.test(normalized)) return `${skillLabel} and secure user flows for ${domainLabel}`;
  if (/python/.test(normalized)) return `Python problem solving and workflows for ${domainLabel}`;
  if (/statistics|probability|linear algebra|math/.test(normalized)) return `${skillLabel} foundations needed after ${knownBase} for ${domainLabel}`;
  if (/data structures|algorithms/.test(normalized)) return `${skillLabel} for writing stronger logic and ML-ready code in ${domainLabel}`;
  if (/machine learning|scikit/.test(normalized)) return `${skillLabel} foundations and supervised learning practice for ${domainLabel}`;
  if (/deep learning|neural/.test(normalized)) return `${skillLabel} and neural network basics for ${domainLabel}`;
  if (/nlp|language model|llm|transformer/.test(normalized)) return `${skillLabel} after your core ML foundations in ${domainLabel}`;
  if (/computer vision|cnn|image/.test(normalized)) return `${skillLabel} and model building for ${domainLabel}`;
  if (/mlops|deployment|docker|monitoring/.test(normalized)) return `${skillLabel} and production workflows for ${domainLabel}`;
  if (/mock|revision|practice|interview/.test(normalized)) return `${skillLabel} for ${domainLabel}`;
  return `${skillLabel} as your next growth step for ${domainLabel}`;
}

function buildSkillProgressiveRoadmap({ goal = "", ctx = {}, template = null, knownSkills = [], missingSkills = [] }) {
  const known = normalizeList(knownSkills);
  const missing = normalizeList(missingSkills);
  const domainLabel =
    String(ctx?.focus || "").trim() ||
    String(ctx?.subCategory || "").trim() ||
    String(ctx?.primaryCategory || "").trim() ||
    String(goal || "").trim() ||
    "your target domain";

  const progressionSteps = missing.slice(0, 4).map((skill) => buildProgressiveSkillStep(skill, ctx, goal, known));
  const projectSkills = normalizeList([known[0], ...missing.slice(0, 2)]).filter(Boolean);
  const projectStep = projectSkills.length
    ? `Build a realistic ${domainLabel} mini project using ${projectSkills.join(", ")}`
    : `Build a realistic ${domainLabel} mini project and collect proof`;
  const proofStep = `Review progress, collect proof, and prepare your next ${domainLabel} milestone`;

  const fallbackRoadmap = template?.roadmap?.length ? formatWeeklyRoadmap(template.roadmap, ctx) : getRoadmapForGoal(goal, ctx);
  const progressive = normalizeList([...progressionSteps, projectStep, proofStep]).slice(0, 5);

  return progressive.length >= 3 ? formatWeeklyRoadmap(progressive, ctx) : fallbackRoadmap;
}

function getProjectIdeasForGoal(goal = "") {
  const normalized = normalizeText(goal);
  if (/(ai|ml|machine learning|data scientist|deep learning)/i.test(normalized)) {
    return [
      "Gesture Controlled Game",
      "AI Resume Analyzer",
      "Face Recognition Attendance",
      "Student Performance Predictor",
      "Document Q&A Assistant"
    ];
  }
  if (/(web|frontend|backend|full stack|react|node)/i.test(normalized)) {
    return [
      "Mentor Booking Platform",
      "Realtime Group Chat App",
      "Portfolio Builder",
      "Task Management SaaS",
      "Campus Events Web App"
    ];
  }
  if (/(cyber|security|ethical hacking|soc)/i.test(normalized)) {
    return [
      "Password Strength Analyzer",
      "Phishing URL Detector",
      "Basic Vulnerability Scanner (Lab Only)",
      "Secure Notes App with Encryption",
      "SOC Alert Dashboard (Mock Data)"
    ];
  }
  if (/(data science|data analytics|analytics|power bi|tableau)/i.test(normalized)) {
    return [
      "Student Performance Dashboard",
      "Sales Forecasting Mini Project",
      "Exploratory Data Analysis (EDA) Portfolio",
      "Job Market Insights Scraper (Public Data)",
      "Recommendation System (Basics)"
    ];
  }
  if (/(upsc|civil services)/i.test(normalized)) {
    return [
      "Daily Current Affairs Tracker",
      "UPSC Notes Organizer",
      "Mains Answer Writing Timer",
      "Mock Test Revision Planner"
    ];
  }
  if (/(academics|school|intermediate|ssc|cbse|icse)/i.test(normalized)) {
    return [
      "Study Planner and Timetable Builder",
      "Subject-wise Revision Tracker",
      "Flashcards App for Key Concepts",
      "Exam Countdown and Practice Log"
    ];
  }
  return [
    "Career Roadmap Tracker",
    "Skill Gap Analyzer Tool",
    "Peer Learning Community App",
    "Interview Prep Quiz App"
  ];
}

function getJourneyCurrentRoadmapStep(journeyState) {
  const steps = Array.isArray(journeyState?.roadmap?.steps) ? journeyState.roadmap.steps : [];
  if (!steps.length) return null;
  return (
    steps.find((item) => String(item?.id || "") === String(journeyState?.roadmap?.currentStepId || "")) ||
    steps.find((item) => item?.status === "active") ||
    steps.find((item) => item?.status !== "completed") ||
    steps[0]
  );
}

function scoreTokenOverlap(value = "", tokens = []) {
  const sourceTokens = new Set(tokenize(value));
  return (tokens || []).reduce((score, token) => (sourceTokens.has(token) ? score + 1 : score), 0);
}

function getJourneyProjectIdeas({ goal = "", ctx = {}, journeyState, fallbackIdeas = [] }) {
  const currentStep = getJourneyCurrentRoadmapStep(journeyState);
  const missingSkills = normalizeList(journeyState?.skillProfile?.missingSkills || []);
  const knownSkills = normalizeList(journeyState?.skillProfile?.knownSkills || []);
  const focusTokens = [
    goal,
    ctx?.primaryCategory,
    ctx?.subCategory,
    ctx?.focus,
    currentStep?.title,
    ...missingSkills.slice(0, 4),
    ...(journeyState?.recommendations?.feedTags || [])
  ]
    .flatMap((item) => tokenize(item))
    .filter(Boolean);

  const boostedIdeas = [...(fallbackIdeas || [])]
    .map((title) => ({
      title,
      score: scoreTokenOverlap(title, focusTokens)
    }))
    .sort((a, b) => b.score - a.score)
    .map((item) => item.title);

  const stageSpecific = [];
  const stepLabel = String(currentStep?.title || "").trim();
  const primarySkill = missingSkills[0] || knownSkills[0] || ctx?.focus || ctx?.subCategory || ctx?.primaryCategory || goal;
  if (stepLabel) {
    stageSpecific.push(`${primarySkill} Practice Lab`);
    stageSpecific.push(`${stepLabel} Mini Project`);
  }
  if (ctx?.focus) {
    stageSpecific.push(`${ctx.focus} Portfolio Builder`);
  }
  if (ctx?.subCategory && !normalizeText(ctx?.subCategory).includes("project")) {
    stageSpecific.push(`${ctx.subCategory} Showcase App`);
  }

  return normalizeList([...stageSpecific, ...boostedIdeas]).slice(0, 8);
}

function buildProjectIdeaTasks(title = "", ctx = {}, journeyState = null) {
  const focusLabel =
    String(ctx?.focus || "").trim() ||
    String(ctx?.subCategory || "").trim() ||
    String(ctx?.primaryCategory || "").trim() ||
    String(journeyState?.goal?.focus || "").trim() ||
    "your domain";
  const currentStep = getJourneyCurrentRoadmapStep(journeyState);
  const stepLabel = String(currentStep?.title || `Current ${focusLabel} roadmap step`).trim();
  const taskBase = String(title || "project").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

  return [
    { id: `${taskBase}-problem`, title: `Define the problem and target user for ${title || "this project"}`, done: false },
    { id: `${taskBase}-plan`, title: `Plan features around ${focusLabel} and ${stepLabel}`, done: false },
    { id: `${taskBase}-setup`, title: `Set up tools, repo, and project structure`, done: false },
    { id: `${taskBase}-core`, title: `Build the core ${focusLabel} workflow`, done: false },
    { id: `${taskBase}-proof`, title: "Capture demo proof, screenshots, or deployment evidence", done: false }
  ];
}

function normalizeProjectIdeaState(item = {}, fallbackTitle = "", fallbackTasks = []) {
  const tasks = (Array.isArray(item?.tasks) && item.tasks.length ? item.tasks : fallbackTasks).map((task, index) => ({
    id: String(task?.id || `${String(fallbackTitle || "project").toLowerCase()}-task-${index + 1}`),
    title: String(task?.title || "").trim(),
    done: Boolean(task?.done)
  }));
  const allTasksDone = tasks.length > 0 && tasks.every((task) => task.done);
  const completedAt = item?.completedAt ? new Date(item.completedAt) : null;
  return {
    key: String(item?.key || fallbackTitle || "").trim(),
    title: String(item?.title || fallbackTitle || "").trim(),
    status: completedAt ? "completed" : item?.status || (allTasksDone ? "active" : "not_started"),
    tasks,
    proofStatus: String(item?.proofStatus || "not_submitted"),
    proofNote: String(item?.proofNote || ""),
    proofLink: String(item?.proofLink || ""),
    proofImageUrl: String(item?.proofImageUrl || ""),
    proofSubmittedAt: item?.proofSubmittedAt ? new Date(item.proofSubmittedAt) : null,
    completedAt,
    updatedAt: item?.updatedAt ? new Date(item.updatedAt) : null
  };
}

function buildProjectIdeaCard({
  title = "",
  index = 0,
  difficulty = "Medium",
  ctx = {},
  journeyState,
  projectMap,
  focusTokens = [],
  stageLabel = "Foundation",
  whyMatched = "",
  whyFallback = ""
}) {
  const projectKey = buildProjectKey(title);
  const savedItem = normalizeProjectIdeaState(projectMap.get(projectKey), title, buildProjectIdeaTasks(title, ctx, journeyState));
  const completedTasks = savedItem.tasks.filter((task) => task.done).length;
  const totalTasks = savedItem.tasks.length;

  return {
    title,
    projectKey,
    level: difficulty,
    tags: normalizeList([ctx.focus, ctx.subCategory, ctx.primaryCategory, ...tokenize(title).slice(0, 2)]).slice(0, 3),
    recommended: index < 2,
    why: scoreTokenOverlap(title, [...focusTokens]) > 0 ? whyMatched : whyFallback,
    stage: stageLabel,
    tasks: savedItem.tasks,
    status: savedItem.status,
    proofRequired: true,
    proofSubmitted: Boolean(savedItem.proofSubmittedAt || savedItem.proofNote || savedItem.proofLink || savedItem.proofImageUrl),
    proofNote: savedItem.proofNote || "",
    proofLink: savedItem.proofLink || "",
    proofImageUrl: savedItem.proofImageUrl || "",
    progressPercent: totalTasks ? Math.round((completedTasks / totalTasks) * 100) : 0,
    completedTasks,
    totalTasks
  };
}

function buildProjectKey(title = "") {
  return String(title || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function buildJourneySeedResources({ queryDomain = "", goal = "", ctx = {}, journeyState }) {
  const currentStep = getJourneyCurrentRoadmapStep(journeyState);
  const missingSkills = normalizeList(journeyState?.skillProfile?.missingSkills || []);
  const primarySkill = missingSkills[0] || ctx?.focus || ctx?.subCategory || ctx?.primaryCategory || goal || "Career";
  const domain = queryDomain || ctx?.primaryCategory || journeyState?.goal?.domain || "Career Growth";

  return [
    {
      _id: "seed-lib-step",
      domain,
      type: "roadmap",
      title: currentStep?.title ? `${currentStep.title} Learning Pack` : `${primarySkill} Starter Pack`,
      description: currentStep?.title
        ? `Guided notes, examples, and exercises for your active roadmap step: ${currentStep.title}.`
        : `A focused starter pack to help you begin ${primarySkill} with the right order and resources.`,
      url: "",
      isFeatured: true
    },
    {
      _id: "seed-lib-skill",
      domain,
      type: "coding_resource",
      title: `${primarySkill} Practice Resource`,
      description: `Hands-on material tailored to the skill gap currently blocking your ${goal || domain} journey.`,
      url: ""
    },
    {
      _id: "seed-lib-career",
      domain,
      type: "career_guide",
      title: `${goal || domain} Career Guide`,
      description: `Use this guide to connect your roadmap, projects, and opportunities into one learning path.`,
      url: ""
    }
  ];
}

function buildDomainSeedResources({ queryDomain = "", goal = "", ctx = {} }) {
  const domain = queryDomain || ctx?.primaryCategory || goal || "Career Growth";
  const focusLabel = ctx?.focus || ctx?.subCategory || ctx?.primaryCategory || goal || "your selected domain";

  return [
    {
      _id: "seed-domain-guide",
      domain,
      type: "career_guide",
      title: `${focusLabel} Domain Guide`,
      description: `A broader guide to help you explore the main concepts, tools, and opportunities in ${focusLabel}.`,
      url: "",
      isFeatured: true
    },
    {
      _id: "seed-domain-practice",
      domain,
      type: "coding_resource",
      title: `${focusLabel} Practice Set`,
      description: `Practice material and examples for building confidence across ${focusLabel}.`,
      url: ""
    },
    {
      _id: "seed-domain-portfolio",
      domain,
      type: "roadmap",
      title: `${focusLabel} Portfolio Resource`,
      description: `Use this pack to explore stronger projects and proof ideas for ${focusLabel}.`,
      url: ""
    }
  ];
}

function mapKnowledgeResources(resources = [], { journeyState, currentStep, recommendationTokens = [], mode = "roadmap", reasonFallback = "", submissionMap = new Map() }) {
  const missingSkills = normalizeList(journeyState?.skillProfile?.missingSkills || []);
  return resources
    .map((item) => {
      const overlap = scoreTokenOverlap(`${item.title} ${item.description || ""} ${item.domain || ""} ${item.type || ""}`, recommendationTokens);
      const isCurrentStepMatch =
        currentStep?.title && scoreTokenOverlap(`${item.title} ${item.description || ""}`, tokenize(currentStep.title)) > 0;
      const isMissingSkillMatch =
        missingSkills.some(
          (skill) => scoreTokenOverlap(`${item.title} ${item.description || ""}`, tokenize(skill)) > 0
        );
      const priorityScore =
        overlap +
        (item.isFeatured ? 3 : 0) +
        (mode === "roadmap" && isCurrentStepMatch ? 4 : 0) +
        (isMissingSkillMatch ? 2 : 0);
      const recommendationReason =
        mode === "roadmap" && isCurrentStepMatch
          ? `Matches your current step: ${currentStep.title}`
          : isMissingSkillMatch
            ? `Supports a current gap: ${missingSkills.find(
                (skill) => scoreTokenOverlap(`${item.title} ${item.description || ""}`, tokenize(skill)) > 0
              )}`
            : reasonFallback;

      return {
        raw: item,
        priorityScore,
        recommendationReason
      };
    })
    .sort((a, b) => b.priorityScore - a.priorityScore || String(b.raw.updatedAt || 0).localeCompare(String(a.raw.updatedAt || 0)))
    .map(({ raw: item, recommendationReason }, index) => ({
      id: item._id,
      domain: item.domain || "",
      type: item.type,
      title: item.title,
      description: item.description || "",
      url: item.url || "",
      bannerImageUrl: item.bannerImageUrl || item.thumbnailUrl || "",
      documentUrl: item.documentUrl || "",
      format: item.format || "",
      difficulty: item.difficulty || "",
      estimatedMinutes: Number(item.estimatedMinutes || 0),
      thumbnailUrl: item.thumbnailUrl || "",
      learningOutcome: item.learningOutcome || "",
      contributorRole: item.contributorRole || "admin",
      mentor: item.submittedBy
        ? {
            id: item.submittedBy?._id || null,
            name: item.submittedBy?.name || "Mentor"
          }
        : null,
      submission: submissionMap.get(String(item._id || "")) || null,
      saves: Number(item.saves || 0),
      featured: Boolean(item.isFeatured),
      recommended: index < 4,
      recommendationReason,
      tags: normalizeList([...(item.tags || []), item.domain, item.type, journeyState?.goal?.focus, currentStep?.title]).slice(0, 5)
    }));
}

function buildInternshipReadinessState({ journeyState, profile, goal = "" }) {
  const readinessScore = Number(journeyState?.skillProfile?.readinessScore || 0);
  const roadmapProgress = Number(journeyState?.roadmap?.progressPercent || 0);
  const completedProjectCount = Number(journeyState?.projects?.completedProjectIds?.length || 0) + Number(profile?.projects?.length || 0);
  const activeProjectCount = Number(journeyState?.projects?.activeProjectIds?.length || 0);
  const unlocked = readinessScore >= 55 && (completedProjectCount >= 1 || roadmapProgress >= 60);
  const reasons = [];

  if (readinessScore < 55) reasons.push(`Increase readiness to at least 55% for ${goal || "your path"}`);
  if (completedProjectCount < 1 && roadmapProgress < 60) reasons.push("Complete one project or reach 60% roadmap progress");
  if (!reasons.length) reasons.push("You are ready to start applying");

  return {
    readinessScore,
    roadmapProgress,
    completedProjectCount,
    activeProjectCount,
    unlocked,
    reasons
  };
}

function buildChallengeJourneyState({ journeyState, profile, goal = "" }) {
  const currentStep = getJourneyCurrentRoadmapStep(journeyState);
  const missingSkills = normalizeList(journeyState?.skillProfile?.missingSkills || []);
  const completedProjectCount = Number(journeyState?.projects?.completedProjectIds?.length || 0) + Number(profile?.projects?.length || 0);
  const readinessScore = Number(journeyState?.skillProfile?.readinessScore || 0);

  return {
    currentStep,
    missingSkills,
    completedProjectCount,
    readinessScore,
    recommendationTokens: [
      goal,
      journeyState?.goal?.domain,
      journeyState?.goal?.subDomain,
      journeyState?.goal?.focus,
      currentStep?.title,
      ...missingSkills,
      ...(journeyState?.recommendations?.feedTags || [])
    ]
      .flatMap((item) => tokenize(item))
      .filter(Boolean)
  };
}

function normalizedLevelFromScore(skillScore) {
  if (skillScore < 30) return "Easy";
  if (skillScore < 70) return "Medium";
  return "Hard";
}

function domainFromProfile({ user, profile }) {
  const preferred =
    user?.primaryCategory ||
    (Array.isArray(user?.interestedCategories) ? user.interestedCategories[0] : "") ||
    profile?.careerGoals ||
    "";
  const domainOptions = Object.keys(mentorCategoryTree || {});
  const direct = preferred ? domainOptions.find((item) => normalizeText(item) === normalizeText(preferred)) : null;
  if (direct) return direct;
  const fuzzy = preferred ? domainOptions.find((item) => normalizeText(preferred).includes(normalizeText(item))) : null;
  if (fuzzy) return fuzzy;

  // If the user didn't explicitly save the primary domain yet, infer it from sub-category or specializations.
  const hintTokens = uniqueTokens([
    user?.subCategory,
    ...(Array.isArray(user?.specializations) ? user.specializations : [])
  ]);
  if (hintTokens.size) {
    const inferred = domainOptions.find((primary) => {
      const subMap = mentorCategoryTree[primary] || {};
      const all = [];
      Object.keys(subMap).forEach((sub) => {
        all.push(sub);
        (subMap[sub] || []).forEach((spec) => all.push(spec));
      });
      const pool = uniqueTokens(all);
      for (const token of hintTokens) {
        if (pool.has(token)) return true;
      }
      return false;
    });
    if (inferred) return inferred;
  }

  return "Technology & AI";
}

function buildQuizContext({ user, profile, domain }) {
  const domainMap = mentorCategoryTree[domain] || {};
  const availableSubCategories = Object.keys(domainMap);
  const userSub = normalizeText(user?.subCategory || "");
  const goalHint = normalizeText(profile?.careerGoals || "");

  let selectedSubCategory =
    availableSubCategories.find((item) => normalizeText(item) === userSub) ||
    availableSubCategories.find((item) => goalHint && goalHint.includes(normalizeText(item))) ||
    "";

  // If the saved "subCategory" is actually a specialization/leaf (e.g., "MPC", "Frontend"),
  // infer its parent sub-category so the quiz stays aligned with the user's selected track.
  if (!selectedSubCategory && userSub) {
    const inferred = availableSubCategories.find((sub) =>
      (domainMap[sub] || []).some((spec) => normalizeText(spec) === userSub)
    );
    if (inferred) selectedSubCategory = inferred;
  }
  if (!selectedSubCategory && goalHint) {
    const inferred = availableSubCategories.find((sub) =>
      (domainMap[sub] || []).some((spec) => goalHint.includes(normalizeText(spec)))
    );
    if (inferred) selectedSubCategory = inferred;
  }

  if (!selectedSubCategory) selectedSubCategory = availableSubCategories[0] || "";

  const availableSpecializations = selectedSubCategory ? domainMap[selectedSubCategory] || [] : [];
  const selectedSpecializations = (user?.specializations || []).filter((item) =>
    availableSpecializations.some((spec) => normalizeText(spec) === normalizeText(item))
  );

  return {
    domain,
    subCategory: selectedSubCategory,
    specializations: selectedSpecializations.length ? selectedSpecializations : availableSpecializations.slice(0, 4),
    availableSubCategories,
    profileSkills: (profile?.skills || []).map((item) => String(item || "").trim()).filter(Boolean),
    careerGoal: profile?.careerGoals || user?.goals || ""
  };
}

function qualifyLeafSkill(domain, subCategory, spec) {
  const raw = String(spec || "").trim();
  if (!raw) return "";

  // Some specializations are ambiguous on their own (e.g., "Foundation", "Prelims").
  const normalized = normalizeText(raw);
  const stageTokens = new Set(["foundation", "inter", "final", "executive", "professional", "prelims", "mains", "interview"]);
  if (stageTokens.has(normalized)) {
    const parent = String(subCategory || "").trim();
    return parent ? `${parent} ${raw}` : raw;
  }

  // Keep as-is for most leaf nodes.
  return raw;
}

function domainSkills(domain, quizContext = null) {
  const subMap = mentorCategoryTree[domain] || {};
  const seen = new Set();
  const skills = [];

  const selectedSub = String(quizContext?.subCategory || "").trim();
  const selectedSpecs = Array.isArray(quizContext?.specializations) ? quizContext.specializations : [];
  const selectedLeaf = selectedSub ? (subMap[selectedSub] || []) : [];

  // Prefer leaf topics over container sub-categories (e.g., prefer "Math" over "School").
  selectedSpecs.forEach((spec) => {
    const qualified = qualifyLeafSkill(domain, selectedSub, spec);
    if (qualified && !seen.has(qualified)) {
      seen.add(qualified);
      skills.push(qualified);
    }
  });

  // If mentor didn't pick specializations (or they are too broad), seed with leaf topics of the selected sub-category.
  selectedLeaf.forEach((spec) => {
    const qualified = qualifyLeafSkill(domain, selectedSub, spec);
    if (qualified && !seen.has(qualified)) {
      seen.add(qualified);
      skills.push(qualified);
    }
  });

  // Blend profile skills (these can be concrete like "Python", "React", etc).
  (quizContext?.profileSkills || []).forEach((skill) => {
    const clean = String(skill || "").trim();
    if (clean && !seen.has(clean)) {
      seen.add(clean);
      skills.push(clean);
    }
  });

  // Add remaining leaf topics in the domain for variety (avoid adding container sub-categories).
  Object.entries(subMap).forEach(([sub, specs]) => {
    (specs || []).forEach((spec) => {
      const qualified = qualifyLeafSkill(domain, sub, spec);
      if (qualified && !seen.has(qualified)) {
        seen.add(qualified);
        skills.push(qualified);
      }
    });
  });

  return skills.slice(0, 12);
}

const FACTUAL_QUIZ_BANK = {
  python: {
    easy: [
      {
        question: "Which Python library is commonly used for graphs and plotting?",
        options: ["Matplotlib", "Express", "Selenium", "Bootstrap"],
        correctOption: "Matplotlib",
        explanation: "Matplotlib is a standard Python library for charts and plotting."
      },
      {
        question: "Which symbol is used to start a comment in Python?",
        options: ["#", "//", "<!--", "/*"],
        correctOption: "#",
        explanation: "Python single-line comments begin with the # symbol."
      }
    ],
    medium: [
      {
        question: "Which Python data type stores key-value pairs?",
        options: ["Dictionary", "Tuple", "Set", "String"],
        correctOption: "Dictionary",
        explanation: "A dictionary stores values as key-value pairs."
      }
    ],
    hard: [
      {
        question: "Which keyword is used to define a function in Python?",
        options: ["def", "func", "function", "lambda"],
        correctOption: "def",
        explanation: "Functions in Python are defined with the def keyword."
      }
    ]
  },
  html: {
    easy: [
      {
        question: "Which HTML attribute is used to specify the image source?",
        options: ["src", "href", "alt", "link"],
        correctOption: "src",
        explanation: "The src attribute tells the browser where the image file is located."
      }
    ],
    medium: [
      {
        question: "Which tag is used to create a hyperlink in HTML?",
        options: ["<a>", "<img>", "<p>", "<link>"],
        correctOption: "<a>",
        explanation: "The anchor tag <a> is used for hyperlinks."
      }
    ],
    hard: [
      {
        question: "Which attribute provides alternative text for an image in HTML?",
        options: ["alt", "title", "name", "srcset"],
        correctOption: "alt",
        explanation: "The alt attribute provides alternative text for accessibility and fallback."
      }
    ]
  },
  react: {
    easy: [
      {
        question: "Which hook is commonly used to manage state in a React function component?",
        options: ["useState", "useEffect", "useRef", "useMemo"],
        correctOption: "useState",
        explanation: "useState is the standard React hook for local component state."
      }
    ],
    medium: [
      {
        question: "Which prop is commonly used to render lists efficiently in React?",
        options: ["key", "id", "index", "ref"],
        correctOption: "key",
        explanation: "The key prop helps React track list items efficiently."
      }
    ],
    hard: [
      {
        question: "Which hook is used to run side effects in React?",
        options: ["useEffect", "useState", "useLayout", "useReducer"],
        correctOption: "useEffect",
        explanation: "useEffect is used for side effects such as fetching data or subscriptions."
      }
    ]
  },
  "node.js": {
    easy: [
      {
        question: "Node.js is primarily used to run JavaScript on which side?",
        options: ["Server side", "Browser UI only", "Database only", "Operating system kernel"],
        correctOption: "Server side",
        explanation: "Node.js allows JavaScript to run on the server side."
      }
    ]
  },
  algebra: {
    easy: [
      {
        question: "What is the value of x in the equation x + 5 = 9?",
        options: ["4", "5", "9", "14"],
        correctOption: "4",
        explanation: "Subtracting 5 from both sides gives x = 4."
      }
    ]
  },
  physics: {
    easy: [
      {
        question: "What is the SI unit of force?",
        options: ["Newton", "Joule", "Watt", "Pascal"],
        correctOption: "Newton",
        explanation: "Force is measured in newtons."
      }
    ]
  },
  chemistry: {
    easy: [
      {
        question: "What is the chemical symbol for water?",
        options: ["H2O", "O2", "CO2", "NaCl"],
        correctOption: "H2O",
        explanation: "Water is made of two hydrogen atoms and one oxygen atom."
      }
    ]
  },
  biology: {
    easy: [
      {
        question: "Which organ pumps blood through the human body?",
        options: ["Heart", "Lungs", "Liver", "Kidney"],
        correctOption: "Heart",
        explanation: "The heart pumps blood throughout the body."
      }
    ]
  },
  geography: {
    easy: [
      {
        question: "What is the capital of the United States of America?",
        options: ["Washington, D.C.", "New York", "Los Angeles", "Chicago"],
        correctOption: "Washington, D.C.",
        explanation: "Washington, D.C. is the capital city of the USA."
      }
    ]
  },
  history: {
    easy: [
      {
        question: "Who is widely credited with inventing the practical electric bulb?",
        options: ["Thomas Edison", "Isaac Newton", "Alexander Fleming", "Galileo"],
        correctOption: "Thomas Edison",
        explanation: "Thomas Edison is widely credited with the practical incandescent bulb."
      }
    ]
  },
  polity: {
    easy: [
      {
        question: "Who is known as the Father of the Indian Constitution?",
        options: ["B. R. Ambedkar", "Mahatma Gandhi", "Jawaharlal Nehru", "Sardar Patel"],
        correctOption: "B. R. Ambedkar",
        explanation: "Dr. B. R. Ambedkar is widely regarded as the principal architect of the Indian Constitution."
      }
    ]
  },
  economics: {
    easy: [
      {
        question: "Which term refers to a general rise in prices over time?",
        options: ["Inflation", "Deflation", "Subsidy", "Tariff"],
        correctOption: "Inflation",
        explanation: "Inflation means prices are rising over time."
      }
    ]
  },
  "machine learning": {
    easy: [
      {
        question: "Which of these is a supervised learning algorithm?",
        options: ["Linear Regression", "K-Means", "Apriori", "PCA"],
        correctOption: "Linear Regression",
        explanation: "Linear Regression is a supervised learning algorithm."
      }
    ],
    medium: [
      {
        question: "Which dataset split is used to evaluate model performance after training?",
        options: ["Test set", "Training set", "Feature set", "Label set"],
        correctOption: "Test set",
        explanation: "The test set is used to evaluate final model performance."
      }
    ]
  },
  "deep learning": {
    easy: [
      {
        question: "Which neural network is commonly used for image tasks?",
        options: ["CNN", "RNN", "KNN", "SVM"],
        correctOption: "CNN",
        explanation: "Convolutional Neural Networks are widely used for image processing."
      }
    ]
  },
  mlops: {
    easy: [
      {
        question: "Which MLOps task focuses on watching models after deployment?",
        options: ["Monitoring", "Tokenization", "Normalization", "Augmentation"],
        correctOption: "Monitoring",
        explanation: "Monitoring tracks model health and performance after deployment."
      }
    ]
  },
  math: {
    easy: [
      {
        question: "What is the value of 12 / 3?",
        options: ["4", "3", "6", "9"],
        correctOption: "4",
        explanation: "12 divided by 3 equals 4."
      },
      {
        question: "Which of the following is a prime number?",
        options: ["11", "12", "15", "21"],
        correctOption: "11",
        explanation: "11 has exactly two factors: 1 and 11."
      }
    ],
    medium: [
      {
        question: "What is the square root of 144?",
        options: ["12", "14", "16", "10"],
        correctOption: "12",
        explanation: "12 x 12 = 144."
      }
    ],
    hard: [
      {
        question: "What is the value of (a + b)^2?",
        options: ["a^2 + 2ab + b^2", "a^2 - 2ab + b^2", "a^2 + b^2", "2a + 2b"],
        correctOption: "a^2 + 2ab + b^2",
        explanation: "(a + b)^2 expands to a^2 + 2ab + b^2."
      }
    ]
  },
  science: {
    easy: [
      {
        question: "Which gas do plants mainly absorb during photosynthesis?",
        options: ["Carbon dioxide", "Oxygen", "Nitrogen", "Helium"],
        correctOption: "Carbon dioxide",
        explanation: "Plants take in carbon dioxide and release oxygen during photosynthesis."
      }
    ],
    medium: [
      {
        question: "Which part of the cell contains genetic material?",
        options: ["Nucleus", "Ribosome", "Cell wall", "Cytoplasm"],
        correctOption: "Nucleus",
        explanation: "The nucleus contains DNA in most cells."
      }
    ]
  },
  english: {
    easy: [
      {
        question: "Which of the following is a synonym of 'happy'?",
        options: ["Joyful", "Angry", "Tired", "Confused"],
        correctOption: "Joyful",
        explanation: "Joyful means happy."
      }
    ],
    medium: [
      {
        question: "Choose the correct sentence:",
        options: ["She goes to school every day.", "She go to school every day.", "She going to school every day.", "She gone to school every day."],
        correctOption: "She goes to school every day.",
        explanation: "Subject-verb agreement requires 'goes' with 'she'."
      }
    ]
  },
  "social studies": {
    easy: [
      {
        question: "Which is the largest democracy in the world?",
        options: ["India", "China", "Russia", "Canada"],
        correctOption: "India",
        explanation: "India is the world's largest democracy by population."
      }
    ]
  },
  mpc: {
    easy: [
      {
        question: "MPC typically stands for which subjects?",
        options: ["Math, Physics, Chemistry", "Math, Politics, Civics", "Micro, Pharma, Chemistry", "Music, Painting, Craft"],
        correctOption: "Math, Physics, Chemistry",
        explanation: "MPC is a common intermediate track: Math, Physics, Chemistry."
      }
    ],
    medium: [
      {
        question: "Which subject is NOT part of MPC?",
        options: ["Biology", "Math", "Physics", "Chemistry"],
        correctOption: "Biology",
        explanation: "Biology is part of BiPC, not MPC."
      }
    ]
  },
  bipc: {
    easy: [
      {
        question: "BiPC typically stands for which subjects?",
        options: ["Biology, Physics, Chemistry", "Biology, Politics, Civics", "Business, Physics, Chemistry", "Biology, Programming, Chemistry"],
        correctOption: "Biology, Physics, Chemistry",
        explanation: "BiPC is a common intermediate track: Biology, Physics, Chemistry."
      }
    ]
  },
  mec: {
    easy: [
      {
        question: "MEC typically includes which subjects?",
        options: ["Math, Economics, Commerce", "Math, English, Chemistry", "Micro, Electronics, Civics", "Music, Engineering, Coding"],
        correctOption: "Math, Economics, Commerce",
        explanation: "MEC commonly means Math, Economics, Commerce."
      }
    ]
  },
  cec: {
    easy: [
      {
        question: "CEC typically includes which subjects?",
        options: ["Civics, Economics, Commerce", "Chemistry, English, Civics", "Coding, Electronics, Commerce", "Civics, Engineering, Coding"],
        correctOption: "Civics, Economics, Commerce",
        explanation: "CEC commonly means Civics, Economics, Commerce."
      }
    ]
  },
  cse: {
    easy: [
      {
        question: "What does CSE commonly stand for in engineering?",
        options: ["Computer Science and Engineering", "Civil Structural Engineering", "Computer Systems Electronics", "Common Software Education"],
        correctOption: "Computer Science and Engineering",
        explanation: "CSE is short for Computer Science and Engineering."
      }
    ],
    medium: [
      {
        question: "Which data structure follows FIFO (First In, First Out)?",
        options: ["Queue", "Stack", "Tree", "Graph"],
        correctOption: "Queue",
        explanation: "Queue is FIFO; Stack is LIFO."
      }
    ]
  },
  ece: {
    easy: [
      {
        question: "ECE commonly stands for:",
        options: ["Electronics and Communication Engineering", "Electrical and Civil Engineering", "Embedded Coding Essentials", "Economics and Commerce Education"],
        correctOption: "Electronics and Communication Engineering",
        explanation: "ECE is Electronics and Communication Engineering."
      }
    ]
  },
  eee: {
    easy: [
      {
        question: "EEE commonly stands for:",
        options: ["Electrical and Electronics Engineering", "Energy and Environmental Engineering", "English and Education Engineering", "Embedded and Electronic Education"],
        correctOption: "Electrical and Electronics Engineering",
        explanation: "EEE is Electrical and Electronics Engineering."
      }
    ]
  },
  mechanical: {
    easy: [
      {
        question: "Which of these is a common mechanical component used to reduce friction?",
        options: ["Ball bearing", "Resistor", "Capacitor", "Transistor"],
        correctOption: "Ball bearing",
        explanation: "Bearings reduce friction between moving parts."
      }
    ]
  },
  aptitude: {
    easy: [
      {
        question: "If 5 workers take 10 days to finish a job, how many days will 10 workers take (same work rate)?",
        options: ["5 days", "10 days", "20 days", "2 days"],
        correctOption: "5 days",
        explanation: "Doubling workers halves the time: 10 days / 2 = 5 days."
      }
    ]
  },
  "resume review": {
    easy: [
      {
        question: "Which section is MOST important to include on a fresher resume?",
        options: ["Projects", "Passport number", "Daily routine", "Unrelated hobbies only"],
        correctOption: "Projects",
        explanation: "Projects demonstrate practical skills for freshers."
      }
    ]
  },
  "mock interviews": {
    easy: [
      {
        question: "STAR method is commonly used to answer which type of interview questions?",
        options: ["Behavioral questions", "Math-only questions", "Grammar questions", "Typing speed tests"],
        correctOption: "Behavioral questions",
        explanation: "STAR helps structure answers for behavioral questions."
      }
    ]
  },
  marketing: {
    easy: [
      {
        question: "What does '4Ps' in marketing commonly refer to?",
        options: ["Product, Price, Place, Promotion", "People, Politics, Power, Profit", "Plan, Process, Program, Profit", "Product, People, Profit, Payment"],
        correctOption: "Product, Price, Place, Promotion",
        explanation: "4Ps are Product, Price, Place, Promotion."
      }
    ]
  },
  operations: {
    easy: [
      {
        question: "In operations, 'SOP' commonly stands for:",
        options: ["Standard Operating Procedure", "Sales Order Pipeline", "Service Output Plan", "System Online Process"],
        correctOption: "Standard Operating Procedure",
        explanation: "SOP means Standard Operating Procedure."
      }
    ]
  },
  hr: {
    easy: [
      {
        question: "In HR, onboarding is the process of:",
        options: ["Integrating a new employee into the company", "Firing an employee", "Auditing company accounts", "Launching a marketing campaign"],
        correctOption: "Integrating a new employee into the company",
        explanation: "Onboarding helps new employees join and adapt to the company."
      }
    ]
  },
  "constitutional law": {
    easy: [
      {
        question: "In India, the Constitution is the:",
        options: ["Supreme law of the country", "Only a guideline document", "Optional rulebook", "Court order"],
        correctOption: "Supreme law of the country",
        explanation: "The Constitution is the supreme law."
      }
    ]
  },
  "corporate law": {
    easy: [
      {
        question: "Corporate law primarily deals with:",
        options: ["Companies and business regulations", "Medical prescriptions", "Agriculture seasons", "Space missions"],
        correctOption: "Companies and business regulations",
        explanation: "Corporate law focuses on companies and business compliance."
      }
    ]
  },
  litigation: {
    easy: [
      {
        question: "Litigation generally refers to:",
        options: ["Resolving disputes in court", "Writing computer programs", "Filing tax returns", "Running marketing ads"],
        correctOption: "Resolving disputes in court",
        explanation: "Litigation is the process of taking legal action in court."
      }
    ]
  },
  "jee main": {
    easy: [
      {
        question: "JEE Main is an entrance exam mainly for admissions into:",
        options: ["Engineering programs", "Medical programs", "Law programs", "MBA programs"],
        correctOption: "Engineering programs",
        explanation: "JEE Main is primarily for engineering admissions."
      }
    ]
  },
  "jee advanced": {
    easy: [
      {
        question: "JEE Advanced is primarily associated with admissions into:",
        options: ["IITs", "AIIMS", "NLUs", "IIMs"],
        correctOption: "IITs",
        explanation: "JEE Advanced is used for IIT admissions."
      }
    ]
  },
  "neet biology": {
    easy: [
      {
        question: "NEET Biology mainly tests topics from:",
        options: ["Botany and Zoology", "Economics and Civics", "Computer Networks", "Accounting"],
        correctOption: "Botany and Zoology",
        explanation: "NEET Biology covers Botany and Zoology."
      }
    ]
  },
  "upsc prelims": {
    easy: [
      {
        question: "UPSC Prelims generally includes which two papers?",
        options: ["GS and CSAT", "Math and Biology", "Accounts and Law", "Physics and Chemistry"],
        correctOption: "GS and CSAT",
        explanation: "UPSC Prelims includes General Studies and CSAT."
      }
    ]
  },
  "upsc mains": {
    easy: [
      {
        question: "UPSC Mains includes descriptive answer writing in:",
        options: ["Essay and General Studies papers", "Only objective MCQs", "Only coding tests", "Only interviews"],
        correctOption: "Essay and General Studies papers",
        explanation: "Mains focuses on descriptive writing across papers."
      }
    ]
  },
  ibps: {
    easy: [
      {
        question: "IBPS is mainly related to which sector exams?",
        options: ["Banking", "Medicine", "Law", "Engineering"],
        correctOption: "Banking",
        explanation: "IBPS conducts banking-related exams."
      }
    ]
  },
  "sbi po": {
    easy: [
      {
        question: "SBI PO is a recruitment exam for:",
        options: ["Probationary Officer in SBI", "Police Officer", "Project Officer", "Patent Officer"],
        correctOption: "Probationary Officer in SBI",
        explanation: "SBI PO recruits Probationary Officers."
      }
    ]
  },
  "ca foundation": {
    easy: [
      {
        question: "CA Foundation is part of which professional qualification?",
        options: ["Chartered Accountancy", "Company Secretary", "CMA only", "Engineering"],
        correctOption: "Chartered Accountancy",
        explanation: "CA Foundation is the entry level for Chartered Accountancy."
      }
    ]
  },
  "cs executive": {
    easy: [
      {
        question: "CS Executive is a stage in which course?",
        options: ["Company Secretary", "Civil Services", "Computer Science", "Clinical Studies"],
        correctOption: "Company Secretary",
        explanation: "CS stands for Company Secretary."
      }
    ]
  },
  "cs professional": {
    easy: [
      {
        question: "CS Professional is a stage in which course?",
        options: ["Company Secretary", "Civil Services", "Computer Science", "Clinical Studies"],
        correctOption: "Company Secretary",
        explanation: "CS Professional is an advanced stage of the Company Secretary course."
      }
    ]
  },
  "cma foundation": {
    easy: [
      {
        question: "CMA Foundation is related to which professional course?",
        options: ["Cost and Management Accountancy", "Computer Management Applications", "Civil Management Academy", "Creative Media Arts"],
        correctOption: "Cost and Management Accountancy",
        explanation: "CMA stands for Cost and Management Accountancy."
      }
    ]
  },
  "upsc interview": {
    easy: [
      {
        question: "UPSC Interview stage is also known as:",
        options: ["Personality Test", "Coding Round", "Practical Lab", "Viva for optional only"],
        correctOption: "Personality Test",
        explanation: "UPSC interview is commonly referred to as the Personality Test."
      }
    ]
  },
  reasoning: {
    easy: [
      {
        question: "If all roses are flowers, and some flowers fade quickly, which statement is always true?",
        options: ["All roses are flowers", "All flowers are roses", "All roses fade quickly", "No flowers fade quickly"],
        correctOption: "All roses are flowers",
        explanation: "The first statement is given and always true."
      }
    ]
  },
  clerical: {
    easy: [
      {
        question: "Banking clerical roles are generally focused on:",
        options: ["Customer service and day-to-day branch operations", "Aircraft maintenance", "Legal court hearings", "Medical surgery"],
        correctOption: "Customer service and day-to-day branch operations",
        explanation: "Clerical roles handle routine banking operations and customer support."
      }
    ]
  },
  "idea validation": {
    easy: [
      {
        question: "Idea validation usually means:",
        options: ["Checking real user demand before building", "Writing code without users", "Raising money first", "Hiring a large team immediately"],
        correctOption: "Checking real user demand before building",
        explanation: "Validation confirms market demand."
      }
    ]
  },
  "mvp building": {
    easy: [
      {
        question: "MVP stands for:",
        options: ["Minimum Viable Product", "Maximum Value Plan", "Most Valuable Process", "Minimum Visual Prototype"],
        correctOption: "Minimum Viable Product",
        explanation: "MVP means Minimum Viable Product."
      }
    ]
  },
  fundraising: {
    easy: [
      {
        question: "A pitch deck is most commonly used for:",
        options: ["Fundraising", "Cooking", "Exam writing", "Sports training"],
        correctOption: "Fundraising",
        explanation: "Pitch decks help raise investment."
      }
    ]
  },
  stocks: {
    easy: [
      {
        question: "A stock represents:",
        options: ["Ownership in a company", "A loan you took", "A fixed deposit only", "A government ID"],
        correctOption: "Ownership in a company",
        explanation: "Stocks represent ownership shares."
      }
    ]
  },
  "mutual funds": {
    easy: [
      {
        question: "A mutual fund is best described as:",
        options: ["Pooled money invested by a fund manager", "A personal bank account", "A type of tax form", "A fixed salary plan"],
        correctOption: "Pooled money invested by a fund manager",
        explanation: "Mutual funds pool investor money for investments."
      }
    ]
  },
  "ui design": {
    easy: [
      {
        question: "UI stands for:",
        options: ["User Interface", "Unique Internet", "Unified Input", "User Information"],
        correctOption: "User Interface",
        explanation: "UI means User Interface."
      }
    ]
  },
  "ux research": {
    easy: [
      {
        question: "UX research is mainly used to:",
        options: ["Understand user needs and behavior", "Write backend APIs", "Compile mobile APKs", "Create server logs"],
        correctOption: "Understand user needs and behavior",
        explanation: "UX research studies users to improve product experience."
      }
    ]
  },
  communication: {
    easy: [
      {
        question: "Active listening means:",
        options: ["Listening with attention and responding appropriately", "Only speaking", "Ignoring the speaker", "Reading silently only"],
        correctOption: "Listening with attention and responding appropriately",
        explanation: "Active listening involves attention and meaningful response."
      }
    ]
  },
  productivity: {
    easy: [
      {
        question: "Which technique uses 25 minutes of focused work followed by a short break?",
        options: ["Pomodoro Technique", "SWOT Analysis", "Kanban Only", "Waterfall Model"],
        correctOption: "Pomodoro Technique",
        explanation: "Pomodoro uses timed focus sessions and breaks."
      }
    ]
  },
  leadership: {
    easy: [
      {
        question: "Leadership is best described as:",
        options: ["Influencing and guiding people toward a goal", "Only giving orders", "Avoiding decisions", "Working alone always"],
        correctOption: "Influencing and guiding people toward a goal",
        explanation: "Leadership is about guiding others toward shared goals."
      }
    ]
  },
  mindset: {
    easy: [
      {
        question: "A growth mindset means:",
        options: ["Believing skills can improve with effort", "Believing talent never changes", "Avoiding challenges", "Never taking feedback"],
        correctOption: "Believing skills can improve with effort",
        explanation: "Growth mindset focuses on learning and improvement."
      }
    ]
  },
  "work-life balance": {
    easy: [
      {
        question: "Work-life balance is mainly about:",
        options: ["Managing work and personal life sustainably", "Working 24/7", "Avoiding all work", "Only taking vacations"],
        correctOption: "Managing work and personal life sustainably",
        explanation: "Balance means sustainable time/energy management."
      }
    ]
  },
  "confidence building": {
    easy: [
      {
        question: "Which habit can help build confidence over time?",
        options: ["Practicing skills consistently", "Avoiding all challenges", "Never asking questions", "Comparing constantly"],
        correctOption: "Practicing skills consistently",
        explanation: "Confidence grows through practice and small wins."
      }
    ]
  },
  finance: {
    easy: [
      {
        question: "A budget is best described as:",
        options: ["A plan for income and expenses", "A type of stock", "A bank loan", "A tax penalty"],
        correctOption: "A plan for income and expenses",
        explanation: "Budgeting plans your income and spending."
      }
    ]
  },
  budgeting: {
    easy: [
      {
        question: "50/30/20 rule is commonly used for:",
        options: ["Budgeting", "Coding interviews", "Physics formulas", "Health diagnosis"],
        correctOption: "Budgeting",
        explanation: "50/30/20 is a budgeting guideline."
      }
    ]
  },
  "personal finance": {
    easy: [
      {
        question: "Emergency fund is mainly for:",
        options: ["Unexpected expenses", "Buying luxury items", "Paying only taxes", "Investing all money in one stock"],
        correctOption: "Unexpected expenses",
        explanation: "Emergency funds help cover unexpected costs."
      }
    ]
  },
  "risk management": {
    easy: [
      {
        question: "Diversification helps in investing by:",
        options: ["Reducing risk across assets", "Guaranteeing profits always", "Increasing taxes", "Stopping market changes"],
        correctOption: "Reducing risk across assets",
        explanation: "Diversification reduces risk by spreading investments."
      }
    ]
  },
  "portfolio strategy": {
    easy: [
      {
        question: "Asset allocation means:",
        options: ["Splitting investments across asset types", "Buying only one stock", "Avoiding savings", "Only holding cash always"],
        correctOption: "Splitting investments across asset types",
        explanation: "Asset allocation distributes funds across assets."
      }
    ]
  },
  frontend: {
    easy: [
      {
        question: "Frontend development mainly focuses on:",
        options: ["User interface in the browser/app", "Database backups", "Server routing only", "Operating system kernel"],
        correctOption: "User interface in the browser/app",
        explanation: "Frontend is the UI users interact with."
      }
    ]
  },
  backend: {
    easy: [
      {
        question: "Backend development mainly focuses on:",
        options: ["Server logic and APIs", "Only UI colors", "Only app icons", "Only camera filters"],
        correctOption: "Server logic and APIs",
        explanation: "Backend powers data, APIs, and server logic."
      }
    ]
  },
  "full stack": {
    easy: [
      {
        question: "A full stack developer typically works on:",
        options: ["Frontend and backend", "Only design", "Only testing", "Only marketing"],
        correctOption: "Frontend and backend",
        explanation: "Full stack covers both frontend and backend."
      }
    ]
  },
  statistics: {
    easy: [
      {
        question: "Mean of 2, 4, 6 is:",
        options: ["4", "6", "2", "3"],
        correctOption: "4",
        explanation: "Mean = (2+4+6)/3 = 4."
      }
    ]
  },
  "data visualization": {
    easy: [
      {
        question: "Which chart is best to show trends over time?",
        options: ["Line chart", "Pie chart", "Scatter only", "Table only"],
        correctOption: "Line chart",
        explanation: "Line charts show trends over time."
      }
    ]
  },
  "roadmap planning": {
    easy: [
      {
        question: "A roadmap is mainly used to:",
        options: ["Plan step-by-step progress toward a goal", "Replace exams", "Increase phone storage", "Avoid learning"],
        correctOption: "Plan step-by-step progress toward a goal",
        explanation: "Roadmaps structure learning/career progress."
      }
    ]
  },
  "role selection": {
    easy: [
      {
        question: "Role selection in career planning means:",
        options: ["Choosing a target job role based on interests and skills", "Deleting your resume", "Avoiding internships", "Never exploring domains"],
        correctOption: "Choosing a target job role based on interests and skills",
        explanation: "Role selection aligns goals with strengths and interests."
      }
    ]
  },
  "higher studies": {
    easy: [
      {
        question: "GATE is commonly used for admissions into:",
        options: ["Postgraduate engineering programs", "Medical MBBS", "Law LLB", "School admissions"],
        correctOption: "Postgraduate engineering programs",
        explanation: "GATE is used for PG engineering and PSU recruitment."
      }
    ]
  },
  "revision strategy": {
    easy: [
      {
        question: "Which is a good revision strategy before exams?",
        options: ["Regular short revisions + mock tests", "Study only on exam day", "Never revise", "Skip weak topics always"],
        correctOption: "Regular short revisions + mock tests",
        explanation: "Revision and mock tests improve recall and speed."
      }
    ]
  },
  cgl: {
    easy: [
      {
        question: "SSC CGL stands for:",
        options: ["Staff Selection Commission Combined Graduate Level", "State Service Computer Graduate List", "School Certificate General Level", "Social Career Guidance Level"],
        correctOption: "Staff Selection Commission Combined Graduate Level",
        explanation: "CGL is Combined Graduate Level."
      }
    ]
  },
  chsl: {
    easy: [
      {
        question: "SSC CHSL stands for:",
        options: ["Combined Higher Secondary Level", "Computer Hardware Skills Level", "Certified High Study License", "Central Health Services List"],
        correctOption: "Combined Higher Secondary Level",
        explanation: "CHSL is Combined Higher Secondary Level."
      }
    ]
  },
  "group 1": {
    easy: [
      {
        question: "Group 1 exams generally refer to:",
        options: ["State civil services higher-level posts", "School group projects", "Sports grouping", "Medical licensing"],
        correctOption: "State civil services higher-level posts",
        explanation: "Group 1 typically means higher-level state service exams."
      }
    ]
  },
  "group 2": {
    easy: [
      {
        question: "Group 2 exams generally refer to:",
        options: ["State service posts (mid-level)", "Only engineering admissions", "Only bank clerk posts", "Only medical entrance"],
        correctOption: "State service posts (mid-level)",
        explanation: "Group 2 are state service recruitment exams."
      }
    ]
  },
  "general studies": {
    easy: [
      {
        question: "General Studies usually includes:",
        options: ["History, Polity, Geography, Economy", "Only coding", "Only biology", "Only design"],
        correctOption: "History, Polity, Geography, Economy",
        explanation: "GS covers multiple subjects for competitive exams."
      }
    ]
  },
  "ca inter": {
    easy: [
      {
        question: "CA Inter is a stage in:",
        options: ["Chartered Accountancy", "Computer Science", "Civil Services", "Creative Arts"],
        correctOption: "Chartered Accountancy",
        explanation: "CA Inter is an intermediate stage of the CA course."
      }
    ]
  },
  "ca final": {
    easy: [
      {
        question: "CA Final is:",
        options: ["The final stage of Chartered Accountancy", "An engineering entrance exam", "A school-level test", "A design portfolio"],
        correctOption: "The final stage of Chartered Accountancy",
        explanation: "CA Final is the last level in the CA course."
      }
    ]
  },
  "cma inter": {
    easy: [
      {
        question: "CMA Inter is a stage in:",
        options: ["Cost and Management Accountancy", "Computer Management Applications", "Civil Management Academy", "Creative Media Arts"],
        correctOption: "Cost and Management Accountancy",
        explanation: "CMA Inter is an intermediate stage in CMA."
      }
    ]
  },
  "cma final": {
    easy: [
      {
        question: "CMA Final is:",
        options: ["The final stage of CMA course", "A banking exam", "A law entrance test", "A school exam"],
        correctOption: "The final stage of CMA course",
        explanation: "CMA Final is the last level in CMA."
      }
    ]
  },
  sales: {
    easy: [
      {
        question: "Sales is mainly about:",
        options: ["Helping customers and closing deals", "Writing only code", "Only making posters", "Avoiding communication"],
        correctOption: "Helping customers and closing deals",
        explanation: "Sales focuses on customer needs and closing deals."
      }
    ]
  },
  "team building": {
    easy: [
      {
        question: "Team building is mainly about:",
        options: ["Creating an effective working team", "Buying gadgets", "Only writing emails", "Avoiding collaboration"],
        correctOption: "Creating an effective working team",
        explanation: "Team building improves collaboration and performance."
      }
    ]
  },
  "go-to-market": {
    easy: [
      {
        question: "Go-to-market strategy is mainly about:",
        options: ["How a product reaches customers", "How to write exams", "How to bake a cake", "How to change phone wallpaper"],
        correctOption: "How a product reaches customers",
        explanation: "GTM defines distribution, positioning, and launch."
      }
    ]
  },
  "product design": {
    easy: [
      {
        question: "Product design mainly focuses on:",
        options: ["Designing usable and valuable products for users", "Only server deployment", "Only stock trading", "Only legal drafting"],
        correctOption: "Designing usable and valuable products for users",
        explanation: "Product design covers usability, flows, and product experience."
      }
    ]
  },
  branding: {
    easy: [
      {
        question: "Branding mainly refers to:",
        options: ["How a product/company is perceived", "Only writing code", "Only studying physics", "Only banking transactions"],
        correctOption: "How a product/company is perceived",
        explanation: "Branding shapes perception through identity and messaging."
      }
    ]
  },
  content: {
    easy: [
      {
        question: "Content strategy is mainly about:",
        options: ["Planning what to communicate to the audience", "Writing only formulas", "Avoiding marketing", "Only designing circuits"],
        correctOption: "Planning what to communicate to the audience",
        explanation: "Content strategy plans topics, formats, and distribution."
      }
    ]
  },
  "visual storytelling": {
    easy: [
      {
        question: "Visual storytelling uses visuals to:",
        options: ["Communicate a message or story", "Debug code", "Do bank transfers", "Write legal petitions"],
        correctOption: "Communicate a message or story",
        explanation: "Visual storytelling communicates ideas through visuals."
      }
    ]
  }
};

function getFactualBank(skill) {
  const normalized = normalizeText(skill);
  return (
    FACTUAL_QUIZ_BANK[normalized] ||
    FACTUAL_QUIZ_BANK[normalized.replace(/\s+/g, " ")] ||
    FACTUAL_QUIZ_BANK[normalized.replace(/ basics| fundamentals| core/g, "")]
  );
}

function buildQuestionTemplates({ domain, subCategory, skill, careerGoal, alternatives = [] }) {
  const safeSkill = skill || "Core Concepts";
  const safeDomain = domain || "General";
  const safeSubCategory = subCategory || safeDomain;
  const distractors = alternatives.filter((item) => normalizeText(item) !== normalizeText(safeSkill)).slice(0, 3);
  while (distractors.length < 3) {
    distractors.push(`General ${safeSubCategory} theory ${distractors.length + 1}`);
  }

  const factualBank = getFactualBank(safeSkill);
  if (factualBank) {
    return {
      easy: factualBank.easy || [],
      medium: factualBank.medium || factualBank.easy || [],
      hard: factualBank.hard || factualBank.medium || factualBank.easy || []
    };
  }

  return {
    easy: [
      {
        question: `Which of the following belongs to ${safeSubCategory} under ${safeDomain}?`,
        options: [safeSkill, ...distractors],
        correctOption: safeSkill,
        explanation: `${safeSkill} is part of ${safeSubCategory} inside the ${safeDomain} path.`
      },
      {
        question: `Which topic is directly associated with ${safeSkill}?`,
        options: [
          safeSkill,
          distractors[0],
          distractors[1],
          distractors[2]
        ],
        correctOption: safeSkill,
        explanation: `${safeSkill} is one of the tracked concepts in this domain path.`
      }
    ],
    medium: [
      {
        question: `${safeSkill} is most closely linked to which path?`,
        options: [
          `${safeDomain} -> ${safeSubCategory}`,
          `${careerGoal || "General Career"} -> Foundational Topics`,
          `${safeDomain} -> Other Track`,
          "Not part of the selected guide"
        ],
        correctOption: `${safeDomain} -> ${safeSubCategory}`,
        explanation: `${safeSkill} belongs inside the ${safeSubCategory} track of ${safeDomain}.`
      },
      {
        question: `Which option is most likely a real topic inside ${safeSubCategory}?`,
        options: [
          safeSkill,
          distractors[0],
          distractors[1],
          distractors[2]
        ],
        correctOption: safeSkill,
        explanation: `${safeSkill} is a valid topic inside the selected student path.`
      }
    ],
    hard: [
      {
        question: `In the ORIN domain map, ${safeSkill} should be grouped under which sub-category?`,
        options: [
          safeSubCategory,
          distractors[0],
          distractors[1],
          distractors[2]
        ],
        correctOption: safeSubCategory,
        explanation: `${safeSkill} is currently grouped under ${safeSubCategory} in the selected path.`
      },
      {
        question: `Which domain contains ${safeSkill} in the student's current guide path?`,
        options: [
          safeDomain,
          distractors[0],
          distractors[1],
          distractors[2]
        ],
        correctOption: safeDomain,
        explanation: `${safeSkill} belongs to ${safeDomain} in this quiz context.`
      }
    ]
  };
}

function generateQuestionPool({ domain, skills, quizContext }) {
  const chosenSkills = (skills || []).slice(0, 6);
  const pool = [];
  chosenSkills.forEach((skill) => {
    const templates = buildQuestionTemplates({
      domain,
      subCategory: quizContext?.subCategory,
      skill,
      careerGoal: quizContext?.careerGoal,
      alternatives: chosenSkills
    });
    ["easy", "medium", "hard"].forEach((difficulty) => {
      const list = templates[difficulty] || [];
      list.forEach((item, idx) => {
        pool.push({
          id: `${normalizeText(domain)}-${normalizeText(skill)}-${difficulty}-${idx + 1}`,
          question: item.question,
          options: item.options,
          correct: item.correctOption,
          difficulty,
          explanation: item.explanation,
          skill
        });
      });
    });
  });
  return pool;
}

function extractJsonFromAiText(answer = "") {
  const text = String(answer || "").trim();
  if (!text) throw new Error("AI returned an empty quiz response.");

  try {
    return JSON.parse(text);
  } catch (_error) {
    const fencedMatch = text.match(/```json\s*([\s\S]*?)```/i) || text.match(/```\s*([\s\S]*?)```/i);
    if (fencedMatch?.[1]) {
      return JSON.parse(fencedMatch[1].trim());
    }

    const objectStart = text.indexOf("{");
    const arrayStart = text.indexOf("[");
    const start = objectStart === -1 ? arrayStart : arrayStart === -1 ? objectStart : Math.min(objectStart, arrayStart);
    const end = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"));
    if (start >= 0 && end > start) {
      return JSON.parse(text.slice(start, end + 1));
    }
    throw _error;
  }
}

function normalizeQuizDifficulty(value, fallback = "medium") {
  const next = String(value || "").trim().toLowerCase();
  return ["easy", "medium", "hard"].includes(next) ? next : fallback;
}

function normalizeQuizQuestionOption(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeGeneratedQuizQuestion(item = {}, index = 0, domain = "General", fallbackDifficulty = "medium") {
  const options = Array.isArray(item.options)
    ? item.options.map((option) => normalizeQuizQuestionOption(option)).filter(Boolean)
    : [];
  const correctOption = normalizeQuizQuestionOption(item.correctOption || item.correct);
  const question = String(item.question || "").replace(/\s+/g, " ").trim();
  const skill = String(item.skill || "General").replace(/\s+/g, " ").trim() || "General";
  const explanation = String(item.explanation || "").replace(/\s+/g, " ").trim();
  const uniqueOptions = [...new Set(options)];

  return {
    id: `${normalizeText(domain)}-ai-${normalizeText(skill || "general")}-${normalizeQuizDifficulty(item.difficulty, fallbackDifficulty)}-${index + 1}`,
    question,
    options: uniqueOptions,
    correct: correctOption,
    difficulty: normalizeQuizDifficulty(item.difficulty, fallbackDifficulty),
    explanation,
    skill
  };
}

function isValidGeneratedQuizQuestion(question = {}) {
  if (!question.question || question.question.length < 12) return false;
  if (!Array.isArray(question.options) || question.options.length !== 4) return false;
  if (!question.correct || !question.options.includes(question.correct)) return false;
  return new Set(question.options).size === 4;
}

function buildQuizDifficultyPlan(startDifficulty = "medium", total = QUIZ_AI_POOL_SIZE) {
  const normalized = normalizeQuizDifficulty(startDifficulty, "medium");
  const plans = {
    easy: ["easy", "easy", "medium", "easy", "medium", "hard", "medium", "easy", "hard"],
    medium: ["easy", "medium", "medium", "hard", "medium", "easy", "hard", "medium", "hard"],
    hard: ["medium", "hard", "hard", "medium", "hard", "easy", "hard", "medium", "medium"]
  };
  return (plans[normalized] || plans.medium).slice(0, total);
}

async function buildQuizHistoryContext(userId, domain) {
  const recentAttempts = await QuizAttempt.find({ userId })
    .select("domain score answers createdAt")
    .sort({ createdAt: -1 })
    .limit(QUIZ_AI_RECENT_ATTEMPTS_LIMIT)
    .lean();

  const recentDomains = [];
  const weakSkills = [];
  const strongSkills = [];
  const seenWeak = new Set();
  const seenStrong = new Set();

  recentAttempts.forEach((attempt) => {
    if (attempt?.domain) recentDomains.push(String(attempt.domain));
    (attempt?.answers || []).forEach((answer) => {
      const skillName = String(answer?.skillName || "").trim();
      if (!skillName) return;
      if (answer?.isCorrect) {
        if (!seenStrong.has(normalizeText(skillName))) {
          seenStrong.add(normalizeText(skillName));
          strongSkills.push(skillName);
        }
      } else if (!seenWeak.has(normalizeText(skillName))) {
        seenWeak.add(normalizeText(skillName));
        weakSkills.push(skillName);
      }
    });
  });

  const sameDomainAttempts = recentAttempts.filter((attempt) => normalizeText(attempt?.domain) === normalizeText(domain));

  return {
    recentDomains: recentDomains.slice(0, 5),
    weakSkills: weakSkills.slice(0, 6),
    strongSkills: strongSkills.slice(0, 6),
    recentAttemptSummaries: sameDomainAttempts.slice(0, 4).map((attempt) => ({
      score: Number(attempt?.score || 0),
      askedSkills: (attempt?.answers || []).map((answer) => String(answer?.skillName || "").trim()).filter(Boolean)
    }))
  };
}

async function generateAiQuestionPool({ userId, domain, quizContext, startDifficulty, desiredCount = QUIZ_AI_POOL_SIZE, fallbackSkills = [] }) {
  const history = await buildQuizHistoryContext(userId, domain);
  const difficultyPlan = buildQuizDifficultyPlan(startDifficulty, desiredCount);
  const focusSkills = normalizeList([
    ...(history.weakSkills || []),
    ...(quizContext?.profileSkills || []),
    ...(quizContext?.specializations || []),
    ...fallbackSkills
  ]).slice(0, 6);

  const message = [
    "Generate a daily quiz for an ORIN student.",
    "Return valid JSON only. No markdown, no explanation outside JSON.",
    "Use this exact shape:",
    '{"questions":[{"question":"...","options":["...","...","...","..."],"correctOption":"...","difficulty":"easy|medium|hard","skill":"...","explanation":"..."}]}',
    `Create exactly ${desiredCount} unique MCQ questions for the domain "${domain}".`,
    `Difficulty plan in order: ${difficultyPlan.join(", ")}.`,
    `Preferred sub-category: ${quizContext?.subCategory || "General"}.`,
    `Preferred specializations: ${(quizContext?.specializations || []).join(", ") || "None"}.`,
    `Career goal hint: ${quizContext?.careerGoal || "Not specified"}.`,
    `Focus skills: ${focusSkills.join(", ") || "General aptitude within the domain"}.`,
    `Avoid repeating recently used domains: ${(history.recentDomains || []).join(", ") || "None"}.`,
    `Avoid repeating recently weak/questioned skills too literally: ${(history.recentAttemptSummaries || []).map((attempt) => attempt.askedSkills.join(", ")).join(" | ") || "None"}.`,
    "Each question must have exactly 4 options and exactly 1 correct option.",
    "Questions must be student-friendly, interview/placement style where relevant, and factually safe.",
    "Do not use placeholders like Option A/B/C/D without real content."
  ].join("\n");

  const { answer, provider, model } = await requestAiResponse({
    role: "student",
    message,
    context: {
      assistantMode: "general",
      feature: "daily_quiz_generation",
      domain,
      subCategory: quizContext?.subCategory || "",
      specializations: quizContext?.specializations || [],
      careerGoal: quizContext?.careerGoal || "",
      startDifficulty,
      focusSkills,
      recentDomains: history.recentDomains || [],
      weakSkills: history.weakSkills || [],
      strongSkills: history.strongSkills || []
    }
  });

  const parsed = extractJsonFromAiText(answer);
  const questionRows = Array.isArray(parsed?.questions)
    ? parsed.questions
    : Array.isArray(parsed)
      ? parsed
      : [];

  const usedQuestions = new Set();
  const normalizedQuestions = [];
  questionRows.forEach((item, index) => {
    const normalized = normalizeGeneratedQuizQuestion(item, index, domain, difficultyPlan[index] || startDifficulty);
    const key = normalizeText(normalized.question);
    if (!key || usedQuestions.has(key)) return;
    if (!isValidGeneratedQuizQuestion(normalized)) return;
    usedQuestions.add(key);
    normalizedQuestions.push(normalized);
  });

  if (normalizedQuestions.length < 5) {
    throw new Error("AI quiz generation returned too few valid questions.");
  }

  return {
    questionPool: normalizedQuestions,
    provider,
    model
  };
}

async function upsertUserSkill(userId, domain, skillName, isCorrect) {
  const row = await UserSkillLevel.findOneAndUpdate(
    { userId, domain, skillName },
    {
      $setOnInsert: {
        userId,
        domain,
        skillName,
        skillScore: 50,
        level: "Medium"
      }
    },
    { upsert: true, new: true }
  );

  const delta = isCorrect ? 5 : -2;
  const nextScore = Math.max(0, Math.min(100, Number(row.skillScore || 50) + delta));
  row.skillScore = nextScore;
  row.level = normalizedLevelFromScore(nextScore);
  row.lastUpdated = new Date();
  await row.save();
  return row;
}

async function updateQuizStreak(userId, dateKey) {
  const streak = (await QuizStreak.findOne({ userId })) || (await QuizStreak.create({ userId, currentStreak: 0, lastQuizDate: "" }));
  if (streak.lastQuizDate === dateKey) {
    return streak;
  }

  let next = 1;
  if (streak.lastQuizDate) {
    const last = new Date(`${streak.lastQuizDate}T00:00:00.000Z`);
    const current = new Date(`${dateKey}T00:00:00.000Z`);
    const diffDays = Math.round((current.getTime() - last.getTime()) / 86400000);
    next = diffDays === 1 ? streak.currentStreak + 1 : 1;
  }
  streak.currentStreak = next;
  streak.lastQuizDate = dateKey;
  await streak.save();
  return streak;
}

async function buildSkillRadar(userId, domain) {
  const rows = await UserSkillLevel.find({ userId, domain }).sort({ updatedAt: -1 }).limit(6).lean();
  return {
    domain,
    skills: rows.map((row) => ({
      name: row.skillName,
      score: Math.max(0, Math.min(100, Number(row.skillScore || 0)))
    }))
  };
}

async function buildWeakSkillMentorRecommendations(domain, weakSkills = []) {
  if (!weakSkills.length) return [];
  const weakTokens = weakSkills.map((item) => normalizeText(item)).filter(Boolean);
  const mentors = await User.find({
    role: "mentor",
    approvalStatus: "approved",
    isDeleted: false,
    $or: [
      { primaryCategory: domain },
      { specializations: { $in: weakSkills } }
    ]
  })
    .select("name primaryCategory subCategory specializations")
    .limit(25)
    .lean();

  return mentors
    .map((mentor) => {
      const mentorTags = uniqueTokens([
        mentor.primaryCategory,
        mentor.subCategory,
        ...(mentor.specializations || [])
      ]);
      const overlap = weakTokens.filter((token) => mentorTags.has(token)).length;
      return {
        mentorId: mentor._id,
        name: mentor.name,
        expertise: mentor.specializations || [],
        matchScore: overlap * 30 + (mentor.primaryCategory === domain ? 20 : 0)
      };
    })
    .filter((item) => item.matchScore > 0)
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 5);
}

function toFeedResponse(post, userId, comments = []) {
  const myReaction = (post.reactions || []).find((entry) => String(entry.userId) === String(userId))?.type || null;
  const reactionCounts = post.reactionCounts || {};
  return {
    ...post,
    isLiked: (post.likedBy || []).some((id) => String(id) === String(userId)),
    isSaved: (post.savedBy || []).some((id) => String(id) === String(userId)),
    isShared: (post.sharedBy || []).some((id) => String(id) === String(userId)),
    userReaction: myReaction,
    reactionCounts: {
      like: reactionCounts.like || 0,
      love: reactionCounts.love || 0,
      care: reactionCounts.care || 0,
      haha: reactionCounts.haha || 0,
      wow: reactionCounts.wow || 0,
      sad: reactionCounts.sad || 0,
      angry: reactionCounts.angry || 0
    },
    comments
  };
}

async function attachFeedAuthorPhotos(posts = [], comments = []) {
  const authorIds = [
    ...new Set(
      [
        ...posts.map((item) => item?.authorId?._id || item?.authorId),
        ...comments.map((item) => item?.authorId?._id || item?.authorId)
      ]
        .map((item) => String(item || "").trim())
        .filter(Boolean)
    )
  ];

  if (!authorIds.length) return { posts, comments };

  const objectIds = authorIds.map((id) => new mongoose.Types.ObjectId(id));
  const [studentProfiles, mentorProfiles] = await Promise.all([
    StudentProfile.find({ userId: { $in: objectIds } })
      .select("userId profilePhotoUrl")
      .lean(),
    MentorProfile.find({ userId: { $in: objectIds } })
      .select("userId profilePhotoUrl")
      .lean()
  ]);

  const photoMap = new Map();
  [...studentProfiles, ...mentorProfiles].forEach((item) => {
    if (item?.userId && item?.profilePhotoUrl) {
      photoMap.set(String(item.userId), item.profilePhotoUrl);
    }
  });

  const applyPhoto = (entry) => {
    if (!entry?.authorId) return entry;
    const authorKey = String(entry.authorId?._id || entry.authorId || "");
    const profilePhotoUrl = photoMap.get(authorKey) || entry.authorId.profilePhotoUrl || "";
    if (entry.authorId && typeof entry.authorId === "object") {
      entry.authorId.profilePhotoUrl = profilePhotoUrl;
    }
    return entry;
  };

  posts.forEach(applyPhoto);
  comments.forEach(applyPhoto);

  return { posts, comments };
}

async function ensureReputation(userId) {
  let rep = await ReputationScore.findOne({ userId });
  if (!rep) {
    rep = await ReputationScore.create({ userId, score: 0, levelTag: "Starter" });
  }
  return rep;
}

async function applyReputationDelta(userId, updates = {}) {
  const rep = await ensureReputation(userId);
  const add = (current, delta) => Math.max(0, Number(current || 0) + Number(delta || 0));

  rep.breakdown = rep.breakdown || {};
  rep.breakdown.projectUploads = add(rep.breakdown.projectUploads, updates.projectUploads);
  rep.breakdown.skillEndorsements = add(rep.breakdown.skillEndorsements, updates.skillEndorsements);
  rep.breakdown.dailyChallenges = add(rep.breakdown.dailyChallenges, updates.dailyChallenges);
  rep.breakdown.mentorReviews = add(rep.breakdown.mentorReviews, updates.mentorReviews);
  rep.breakdown.activityPosts = add(rep.breakdown.activityPosts, updates.activityPosts);
  rep.breakdown.dailyQuizXp = add(rep.breakdown.dailyQuizXp, updates.dailyQuizXp);
  rep.breakdown.quizBattleXp = add(rep.breakdown.quizBattleXp, updates.quizBattleXp);
  rep.breakdown.roadmapXp = add(rep.breakdown.roadmapXp, updates.roadmapXp);
  rep.breakdown.challengeXp = add(rep.breakdown.challengeXp, updates.challengeXp);
  rep.breakdown.resourceXp = add(rep.breakdown.resourceXp, updates.resourceXp);

  rep.score =
    rep.breakdown.projectUploads * 40 +
    rep.breakdown.skillEndorsements * 25 +
    rep.breakdown.dailyChallenges * 20 +
    rep.breakdown.mentorReviews * 30 +
    rep.breakdown.activityPosts * 15 +
    Number(rep.breakdown.dailyQuizXp || 0) +
    Number(rep.breakdown.quizBattleXp || 0) +
    Number(rep.breakdown.roadmapXp || 0) +
    Number(rep.breakdown.challengeXp || 0) +
    Number(rep.breakdown.resourceXp || 0);
  rep.levelTag = computeLevelTag(rep.score);
  await rep.save();
  return rep;
}

function reputationBreakdownPayload(rep) {
  const breakdown = rep?.breakdown || {};
  return {
    projectUploads: Number(breakdown.projectUploads || 0),
    skillEndorsements: Number(breakdown.skillEndorsements || 0),
    dailyChallenges: Number(breakdown.dailyChallenges || 0),
    mentorReviews: Number(breakdown.mentorReviews || 0),
    activityPosts: Number(breakdown.activityPosts || 0),
    dailyQuizXp: Number(breakdown.dailyQuizXp || 0),
    quizBattleXp: Number(breakdown.quizBattleXp || 0),
    roadmapXp: Number(breakdown.roadmapXp || 0),
    challengeXp: Number(breakdown.challengeXp || 0),
    resourceXp: Number(breakdown.resourceXp || 0)
  };
}

async function upsertLeaderboardForToday({ collegeName = "", stateName = "" } = {}) {
  const dateKey = toDateKey();
  const allReps = await ReputationScore.find({})
    .populate("userId", "name role")
    .sort({ score: -1, updatedAt: -1 })
    .limit(200)
    .lean();

  const userIds = allReps
    .map((item) => item.userId?._id)
    .filter(Boolean);
  const studentProfiles = userIds.length
    ? await StudentProfile.find({ userId: { $in: userIds } })
      .select("userId collegeName state")
      .lean()
    : [];
  const studentProfileMap = new Map(
    studentProfiles.map((item) => [
      String(item.userId),
      {
        collegeName: String(item.collegeName || "").trim(),
        state: String(item.state || "").trim()
      }
    ])
  );

  const globalEntries = allReps.map((item, idx) => ({
    userId: item.userId?._id,
    score: item.score || 0,
    rank: idx + 1
  }));

  await LeaderboardSnapshot.findOneAndUpdate(
    { dateKey, scope: "global", collegeName: "", stateName: "" },
    { $set: { entries: globalEntries, collegeName: "", stateName: "" } },
    { upsert: true, new: true }
  );

  if (collegeName) {
    const normalizedCollege = normalizeText(collegeName);
    const collegeEntries = allReps
      .filter((item) => normalizeText(studentProfileMap.get(String(item.userId?._id))?.collegeName || "") === normalizedCollege)
      .map((item, idx) => ({
        userId: item.userId?._id,
        score: item.score || 0,
        rank: idx + 1
      }));

    await LeaderboardSnapshot.findOneAndUpdate(
      { dateKey, scope: "college", collegeName, stateName: "" },
      { $set: { entries: collegeEntries, collegeName, stateName: "" } },
      { upsert: true, new: true }
    );
  }

  if (stateName) {
    const normalizedState = normalizeText(stateName);
    const stateEntries = allReps
      .filter((item) => normalizeText(studentProfileMap.get(String(item.userId?._id))?.state || "") === normalizedState)
      .map((item, idx) => ({
        userId: item.userId?._id,
        score: item.score || 0,
        rank: idx + 1
      }));

    await LeaderboardSnapshot.findOneAndUpdate(
      { dateKey, scope: "state", collegeName: "", stateName },
      { $set: { entries: stateEntries, collegeName: "", stateName } },
      { upsert: true, new: true }
    );
  }
}

exports.getNetworkOverview = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const [pendingIncoming, pendingOutgoing, acceptedConnections, followers, following, reputation] = await Promise.all([
    Connection.countDocuments({ recipientId: userId, status: "pending" }),
    Connection.countDocuments({ requesterId: userId, status: "pending" }),
    Connection.countDocuments({
      status: "accepted",
      $or: [{ requesterId: userId }, { recipientId: userId }]
    }),
    UserFollow.countDocuments({ followingId: userId }),
    UserFollow.countDocuments({ followerId: userId }),
    ensureReputation(userId)
  ]);

  res.json({
    connections: {
      accepted: acceptedConnections,
      pendingIncoming,
      pendingOutgoing
    },
    follow: {
      followers,
      following
    },
    reputation: {
      score: reputation.score,
      levelTag: reputation.levelTag,
      breakdown: reputation.breakdown
    }
  });
});

exports.getConnections = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const status = req.query.status || "accepted";

  const list = await Connection.find({
    status,
    $or: [{ requesterId: userId }, { recipientId: userId }]
  })
    .populate("requesterId", "name role email")
    .populate("recipientId", "name role email")
    .sort({ updatedAt: -1 })
    .lean();

  const userIds = list.flatMap((item) => [item?.requesterId?._id, item?.recipientId?._id]).filter(Boolean);
  const [studentProfiles, mentorProfiles] = await Promise.all([
    StudentProfile.find({ userId: { $in: userIds } }).select("userId profilePhotoUrl").lean(),
    MentorProfile.find({ userId: { $in: userIds } }).select("userId profilePhotoUrl").lean()
  ]);
  const photoMap = new Map();
  [...studentProfiles, ...mentorProfiles].forEach((item) => {
    photoMap.set(String(item.userId), item.profilePhotoUrl || "");
  });
  list.forEach((item) => {
    if (item?.requesterId?._id) item.requesterId.profilePhotoUrl = photoMap.get(String(item.requesterId._id)) || "";
    if (item?.recipientId?._id) item.recipientId.profilePhotoUrl = photoMap.get(String(item.recipientId._id)) || "";
  });

  res.json(list);
});

exports.sendConnectionRequest = asyncHandler(async (req, res) => {
  const requesterId = req.user.id;
  const { recipientId } = req.body;

  if (!recipientId) throw new ApiError(400, "recipientId is required");
  if (requesterId === recipientId) throw new ApiError(400, "Cannot connect with yourself");
  if (!mongoose.Types.ObjectId.isValid(recipientId)) throw new ApiError(400, "Invalid recipientId");

  const recipient = await User.findOne({ _id: recipientId, isDeleted: false }).select("role");
  if (!recipient) throw new ApiError(404, "Recipient not found");

  const existing = await Connection.findOne({
    $or: [
      { requesterId, recipientId },
      { requesterId: recipientId, recipientId: requesterId }
    ]
  });

  if (existing) {
    if (existing.status === "rejected" || existing.status === "blocked") {
      throw new ApiError(400, "Connection cannot be requested for this user");
    }
    return res.status(200).json({ message: "Connection already exists", connection: existing });
  }

  const relationshipType =
    req.user.role === "student" && recipient.role === "mentor"
      ? "student_mentor"
      : req.user.role === "student" && recipient.role === "student"
        ? "student_student"
        : "student_recruiter";

  let connection;
  try {
    connection = await Connection.create({
      requesterId,
      recipientId,
      relationshipType
    });
  } catch (error) {
    if (error?.code === 11000) {
      const duplicate = await Connection.findOne({
        $or: [
          { requesterId, recipientId },
          { requesterId: recipientId, recipientId: requesterId }
        ]
      });
      return res.status(200).json({
        message:
          duplicate?.status === "accepted"
            ? "Already in your circle"
            : String(duplicate?.recipientId || "") === String(requesterId) && duplicate?.status === "pending"
              ? "This user already requested to connect with you"
              : "Request already sent",
        connection: duplicate
      });
    }
    throw error;
  }

  await Notification.create({
    title: "New Connection Request",
    message: "You have a new connection request on ORIN.",
    type: "direct",
    sentBy: requesterId,
    targetRole: "all",
    recipient: recipientId
  });

  res.status(201).json({ message: "Connection request sent", connection });
});

exports.respondConnectionRequest = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { connectionId } = req.params;
  const { action } = req.body;

  if (!["accept", "reject"].includes(action)) throw new ApiError(400, "action must be accept or reject");

  const connection = await Connection.findOne({
    _id: connectionId,
    recipientId: userId,
    status: "pending"
  });
  if (!connection) throw new ApiError(404, "Pending connection request not found");

  connection.status = action === "accept" ? "accepted" : "rejected";
  connection.respondedAt = new Date();
  await connection.save();

  await Notification.create({
    title: `Connection ${action === "accept" ? "Accepted" : "Rejected"}`,
    message: `Your connection request was ${action}ed.`,
    type: "direct",
    sentBy: userId,
    targetRole: "all",
    recipient: connection.requesterId
  });

  res.json({ message: `Connection ${action}ed`, connection });
});

exports.toggleFollow = asyncHandler(async (req, res) => {
  const followerId = req.user.id;
  const { userId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(userId)) throw new ApiError(400, "Invalid userId");
  if (followerId === userId) throw new ApiError(400, "Cannot follow yourself");

  const existing = await UserFollow.findOne({ followerId, followingId: userId });
  if (existing) {
    await existing.deleteOne();
    return res.json({ following: false });
  }

  await UserFollow.create({ followerId, followingId: userId });
  await Notification.create({
    title: "New Follower",
    message: "Someone started following you on ORIN.",
    type: "direct",
    sentBy: followerId,
    targetRole: "all",
    recipient: userId
  });
  return res.json({ following: true });
});

exports.getFeed = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const profile = await StudentProfile.findOne({ userId }).select("collegeName skills").lean();
  const collegeName = profile?.collegeName || "";
  const skills = profile?.skills || [];

  const posts = await FeedPost.find({
    $or: [
      { visibility: "public" },
      { authorId: userId },
      { visibility: "connections" },
      ...(collegeName ? [{ collegeTag: collegeName }] : []),
      ...(skills.length ? [{ domainTags: { $in: skills.slice(0, 5) } }] : [])
    ]
  })
    .populate("authorId", "name role")
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  const postIds = posts.map((p) => p._id);
  const comments = await FeedComment.find({ postId: { $in: postIds } })
    .populate("authorId", "name role")
    .sort({ createdAt: -1 })
    .lean();

  await attachFeedAuthorPhotos(posts, comments);

  const commentsByPostId = comments.reduce((acc, item) => {
    const key = String(item.postId);
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

  const data = posts.map((post) => toFeedResponse(post, userId, commentsByPostId[String(post._id)] || []));

  res.json(data);
});

exports.getInstitutionFeed = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const profile = await StudentProfile.findOne({ userId }).select("institutionName collegeName className classLevel").lean();
  const institutionName = String(profile?.institutionName || profile?.collegeName || "").trim();
  const className = String(profile?.className || profile?.classLevel || "").trim();

  if (!institutionName) {
    return res.json([]);
  }

  const institutionProfiles = await StudentProfile.find({
    $or: [{ institutionName }, { collegeName: institutionName }]
  })
    .select("userId")
    .lean();
  const institutionUserIds = institutionProfiles
    .map((item) => item.userId)
    .filter(Boolean);

  if (!institutionUserIds.length) {
    return res.json([]);
  }

  const targetedFilters = [
    { scope: "institution", institutionName },
    ...(className ? [{ scope: "class", institutionName, className }] : [{ scope: "class", institutionName }])
  ];

  const posts = await FeedPost.find({
    visibility: { $in: ["public", "connections"] },
    $or: [
      { authorId: { $in: institutionUserIds }, scope: { $in: [undefined, null, "", "global"] } },
      ...targetedFilters
    ]
  })
    .populate("authorId", "name role")
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  const postIds = posts.map((p) => p._id);
  const comments = await FeedComment.find({ postId: { $in: postIds } })
    .populate("authorId", "name role")
    .sort({ createdAt: -1 })
    .lean();

  await attachFeedAuthorPhotos(posts, comments);

  const commentsByPostId = comments.reduce((acc, item) => {
    const key = String(item.postId);
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

  res.json(posts.map((post) => toFeedResponse(post, userId, commentsByPostId[String(post._id)] || [])));
});

exports.getPublicFeed = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const posts = await FeedPost.find({ visibility: "public" })
    .populate("authorId", "name role")
    .sort({ createdAt: -1 })
    .limit(80)
    .lean();
  const postIds = posts.map((p) => p._id);
  const comments = await FeedComment.find({ postId: { $in: postIds } })
    .populate("authorId", "name role")
    .sort({ createdAt: -1 })
    .lean();
  await attachFeedAuthorPhotos(posts, comments);
  const commentsByPostId = comments.reduce((acc, item) => {
    const key = String(item.postId);
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});
  res.json(posts.map((post) => toFeedResponse(post, userId, commentsByPostId[String(post._id)] || [])));
});

exports.getSavedPosts = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const posts = await FeedPost.find({ savedBy: userId })
    .populate("authorId", "name role")
    .sort({ createdAt: -1 })
    .limit(80)
    .lean();

  const postIds = posts.map((p) => p._id);
  const comments = await FeedComment.find({ postId: { $in: postIds } })
    .populate("authorId", "name role")
    .sort({ createdAt: -1 })
    .lean();

  await attachFeedAuthorPhotos(posts, comments);

  const commentsByPostId = comments.reduce((acc, item) => {
    const key = String(item.postId);
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

  res.json(posts.map((post) => toFeedResponse(post, userId, commentsByPostId[String(post._id)] || [])));
});

exports.createPost = asyncHandler(async (req, res) => {
  const authorId = req.user.id;
  const { content, postType, domainTags = [], mediaUrls = [], visibility = "public" } = req.body;

  if (!content || content.trim().length < 3) throw new ApiError(400, "Post content is required");

  const profile = await StudentProfile.findOne({ userId: authorId }).select("institutionName collegeName").lean();
  const institutionTag = String(profile?.institutionName || profile?.collegeName || "").trim();
  const requestedScope = ["global", "institution", "class"].includes(String(req.body?.scope || ""))
    ? String(req.body.scope)
    : "global";
  const institutionName = requestedScope === "global"
    ? ""
    : String(req.body?.institutionName || "").trim().slice(0, 160);
  const className = requestedScope === "class"
    ? String(req.body?.className || "").trim().slice(0, 80)
    : "";
  if (requestedScope !== "global" && !institutionName) throw new ApiError(400, "Select an institution for this post");
  if (requestedScope === "class" && !className) throw new ApiError(400, "Select a class for this post");
  const audienceStage = ["highschool", "after12", "all"].includes(String(req.body?.audienceStage || ""))
    ? String(req.body.audienceStage)
    : "all";

  const post = await FeedPost.create({
    authorId,
    content: content.trim(),
    postType: postType || "learning_progress",
    domainTags: Array.isArray(domainTags) ? domainTags : [],
    mediaUrls: Array.isArray(mediaUrls) ? mediaUrls : [],
    visibility,
    collegeTag: institutionName || institutionTag,
    scope: requestedScope,
    audienceStage,
    institutionName,
    className
  });

  await applyReputationDelta(authorId, { activityPosts: 1 });
  res.status(201).json(post);
});

exports.updatePost = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { postId } = req.params;
  const { content } = req.body;

  if (!mongoose.Types.ObjectId.isValid(postId)) throw new ApiError(400, "Invalid post id");
  if (!content || content.trim().length < 3) throw new ApiError(400, "Post content is required");

  const post = await FeedPost.findById(postId);
  if (!post) throw new ApiError(404, "Post not found");
  if (String(post.authorId) !== String(userId)) throw new ApiError(403, "You can edit only your own posts");

  post.content = content.trim();
  await post.save();

  const hydrated = await FeedPost.findById(postId)
    .populate("authorId", "name role profilePhotoUrl")
    .lean();

  await attachFeedAuthorPhotos([hydrated], []);

  res.json(toFeedResponse(hydrated, userId, []));
});

exports.deletePost = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { postId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(postId)) throw new ApiError(400, "Invalid post id");

  const post = await FeedPost.findById(postId);
  if (!post) throw new ApiError(404, "Post not found");
  if (String(post.authorId) !== String(userId)) throw new ApiError(403, "You can delete only your own posts");

  await FeedComment.deleteMany({ postId });
  await post.deleteOne();

  res.json({ message: "Post deleted successfully" });
});

exports.addComment = asyncHandler(async (req, res) => {
  const authorId = req.user.id;
  const { postId } = req.params;
  const { content } = req.body;

  if (!content || content.trim().length < 1) throw new ApiError(400, "Comment content is required");

  const post = await FeedPost.findById(postId);
  if (!post) throw new ApiError(404, "Post not found");

  const comment = await FeedComment.create({
    postId,
    authorId,
    content: content.trim()
  });

  post.commentCount += 1;
  await post.save();

  if (String(post.authorId) !== String(authorId)) {
    await Notification.create({
      title: "New Comment",
      message: "Someone commented on your post.",
      type: "direct",
      sentBy: authorId,
      targetRole: "all",
      recipient: post.authorId
    });
  }

  const data = await FeedComment.findById(comment._id).populate("authorId", "name role").lean();
  await attachFeedAuthorPhotos([], [data]);
  res.status(201).json(data);
});

exports.getPostComments = asyncHandler(async (req, res) => {
  const { postId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(postId)) throw new ApiError(400, "Invalid post id");

  const post = await FeedPost.findById(postId);
  if (!post) throw new ApiError(404, "Post not found");

  const comments = await FeedComment.find({ postId })
    .populate("authorId", "name role")
    .sort({ createdAt: -1 })
    .lean();

  await attachFeedAuthorPhotos([], comments);
  res.json(comments);
});

exports.updateComment = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { postId, commentId } = req.params;
  const { content } = req.body;

  if (!mongoose.Types.ObjectId.isValid(postId) || !mongoose.Types.ObjectId.isValid(commentId)) {
    throw new ApiError(400, "Invalid id");
  }
  if (!content || !content.trim()) throw new ApiError(400, "Comment content is required");

  const comment = await FeedComment.findOne({ _id: commentId, postId });
  if (!comment) throw new ApiError(404, "Comment not found");
  if (String(comment.authorId) !== String(userId)) throw new ApiError(403, "You can edit only your own comment");

  comment.content = content.trim();
  await comment.save();

  const data = await FeedComment.findById(comment._id).populate("authorId", "name role").lean();
  await attachFeedAuthorPhotos([], [data]);
  res.json(data);
});

exports.deleteComment = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { postId, commentId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(postId) || !mongoose.Types.ObjectId.isValid(commentId)) {
    throw new ApiError(400, "Invalid id");
  }

  const [comment, post] = await Promise.all([
    FeedComment.findOne({ _id: commentId, postId }),
    FeedPost.findById(postId)
  ]);
  if (!comment) throw new ApiError(404, "Comment not found");
  if (!post) throw new ApiError(404, "Post not found");

  const isCommentOwner = String(comment.authorId) === String(userId);
  const isPostOwner = String(post.authorId) === String(userId);
  if (!isCommentOwner && !isPostOwner) {
    throw new ApiError(403, "Not allowed to delete this comment");
  }

  await comment.deleteOne();
  post.commentCount = Math.max(0, Number(post.commentCount || 0) - 1);
  await post.save();

  res.json({ message: "Comment deleted" });
});

exports.reactToPost = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { postId } = req.params;
  const { action, reactionType } = req.body;

  if (!["like", "react", "save", "share"].includes(action)) throw new ApiError(400, "Invalid action");

  const post = await FeedPost.findById(postId);
  if (!post) throw new ApiError(404, "Post not found");

  if (!post.reactionCounts) {
    post.reactionCounts = { like: 0, love: 0, care: 0, haha: 0, wow: 0, sad: 0, angry: 0 };
  }
  if (!Array.isArray(post.reactions)) {
    post.reactions = [];
  }
  if (!Array.isArray(post.savedBy)) {
    post.savedBy = [];
  }
  if (!Array.isArray(post.sharedBy)) {
    post.sharedBy = [];
  }
  if (!Number.isFinite(Number(post.saveCount))) {
    post.saveCount = 0;
  }
  if (!Number.isFinite(Number(post.shareCount))) {
    post.shareCount = 0;
  }

  if (action === "like" || action === "react") {
    const nextReaction = action === "like" ? "like" : String(reactionType || "").toLowerCase();
    if (!REACTION_TYPES.includes(nextReaction)) {
      throw new ApiError(400, "Invalid reactionType");
    }

    const existingIndex = post.reactions.findIndex((entry) => String(entry.userId) === String(userId));
    const existing = existingIndex >= 0 ? post.reactions[existingIndex] : null;
    const previousType = existing?.type || null;

    if (existing && previousType === nextReaction) {
      post.reactions.splice(existingIndex, 1);
      post.reactionCounts[nextReaction] = Math.max(0, Number(post.reactionCounts[nextReaction] || 0) - 1);
    } else {
      if (existing && previousType) {
        post.reactionCounts[previousType] = Math.max(0, Number(post.reactionCounts[previousType] || 0) - 1);
        post.reactions[existingIndex] = { userId, type: nextReaction };
      } else {
        post.reactions.push({ userId, type: nextReaction });
      }
      post.reactionCounts[nextReaction] = Number(post.reactionCounts[nextReaction] || 0) + 1;

      if (String(post.authorId) !== String(userId)) {
        await Notification.create({
          title: "New Reaction",
          message: `Someone reacted (${nextReaction}) to your post.`,
          type: "direct",
          sentBy: userId,
          targetRole: "all",
          recipient: post.authorId
        });
      }
    }

    post.likedBy = post.reactions.map((entry) => entry.userId);
    post.likeCount = post.reactions.length;
  }

  if (action === "save") {
    const hasSaved = post.savedBy.some((id) => String(id) === userId);
    if (hasSaved) {
      post.savedBy = post.savedBy.filter((id) => String(id) !== userId);
      post.saveCount = Math.max(0, post.saveCount - 1);
    } else {
      post.savedBy.push(userId);
      post.saveCount += 1;
    }
  }

  if (action === "share") {
    const hasShared = post.sharedBy.some((id) => String(id) === userId);
    if (!hasShared) {
      post.sharedBy.push(userId);
      post.shareCount += 1;

      if (String(post.authorId) !== String(userId)) {
        await Notification.create({
          title: "Post Shared",
          message: "Someone shared your post.",
          type: "direct",
          sentBy: userId,
          targetRole: "all",
          recipient: post.authorId
        });
      }
    }
  }

  await post.save();
  const userReaction = post.reactions.find((entry) => String(entry.userId) === String(userId))?.type || null;
  res.json({
    postId: post._id,
    likeCount: post.likeCount,
    reactionCounts: post.reactionCounts,
    userReaction,
    saveCount: post.saveCount,
    shareCount: post.shareCount
  });
});

exports.endorseSkill = asyncHandler(async (req, res) => {
  const endorsedByUserId = req.user.id;
  const { userId: endorsedUserId } = req.params;
  const { skill } = req.body;

  if (!skill || !skill.trim()) throw new ApiError(400, "Skill is required");
  if (!mongoose.Types.ObjectId.isValid(endorsedUserId)) throw new ApiError(400, "Invalid userId");
  if (endorsedByUserId === endorsedUserId) throw new ApiError(400, "Cannot endorse yourself");

  const exists = await SkillEndorsement.findOne({
    endorsedUserId,
    endorsedByUserId,
    skill: skill.trim()
  });

  if (exists) return res.json({ message: "Skill already endorsed" });

  await SkillEndorsement.create({
    endorsedUserId,
    endorsedByUserId,
    skill: skill.trim()
  });

  await applyReputationDelta(endorsedUserId, { skillEndorsements: 1 });
  res.status(201).json({ message: "Skill endorsed" });
});

exports.getDailyDashboard = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const dateKey = toDateKey();
  const [reputation, profile, userDoc, todayAttempt, streak] = await Promise.all([
    ensureReputation(userId),
    StudentProfile.findOne({ userId }).select("collegeName state careerGoals skills").lean(),
    User.findById(userId).select("primaryCategory interestedCategories").lean(),
    QuizAttempt.findOne({ userId, dateKey }).lean(),
    QuizStreak.findOne({ userId }).lean()
  ]);
  const domain = domainFromProfile({ user: userDoc, profile });

  await upsertLeaderboardForToday({ collegeName: profile?.collegeName || "", stateName: profile?.state || "" });

  const [globalSnapshot, collegeSnapshot, stateSnapshot] = await Promise.all([
    LeaderboardSnapshot.findOne({ dateKey, scope: "global", collegeName: "", stateName: "" }).lean(),
    profile?.collegeName
      ? LeaderboardSnapshot.findOne({ dateKey, scope: "college", collegeName: profile.collegeName, stateName: "" }).lean()
      : null,
    profile?.state
      ? LeaderboardSnapshot.findOne({ dateKey, scope: "state", collegeName: "", stateName: profile.state }).lean()
      : null
  ]);

  const globalRank =
    globalSnapshot?.entries.find((item) => String(item.userId) === String(userId))?.rank || null;
  const collegeRank =
    collegeSnapshot?.entries.find((item) => String(item.userId) === String(userId))?.rank || null;
  const stateRank =
    stateSnapshot?.entries.find((item) => String(item.userId) === String(userId))?.rank || null;

  const skillRadar = await buildSkillRadar(userId, domain);
  const sortedSkills = [...(skillRadar.skills || [])].sort((a, b) => b.score - a.score);
  const strength = sortedSkills[0]?.name || "Consistent Learning";
  const weakSkills = sortedSkills.filter((item) => item.score < 60).map((item) => item.name).slice(0, 3);
  const mentorRecommendations = await buildWeakSkillMentorRecommendations(domain, weakSkills);
  const trendingOpportunity = await CareerOpportunity.findOne({ isActive: true }).sort({ updatedAt: -1 }).lean();

  res.json({
    dateKey,
    tasks: [],
    streakDays: streak?.currentStreak || 0,
    xp: todayAttempt?.xpAwarded || 0,
    levelTag: reputation.levelTag,
    reputationScore: reputation.score,
    reputationBreakdown: reputationBreakdownPayload(reputation),
    dailyQuiz: {
      completedToday: Boolean(todayAttempt),
      domain,
      attemptsLeft: todayAttempt ? 0 : 1,
      message: todayAttempt ? QUIZ_DAILY_LIMIT_MESSAGE : "Complete today's adaptive quiz to earn XP.",
      result: todayAttempt
        ? {
            score: todayAttempt.score,
            totalQuestions: todayAttempt.totalQuestions || 5,
            xpEarned: todayAttempt.xpAwarded || 0,
            streak: todayAttempt.streakAfter || streak?.currentStreak || 0
          }
        : null
    },
    skillRadar,
    careerIntelligence: todayAttempt
      ? {
          strength,
          needsImprovement: weakSkills,
          mentorRecommendations,
          recommendedNextStep:
            weakSkills.length > 0
              ? `Book a mentor session on ${weakSkills[0]}.`
              : "Continue with advanced challenges to maintain momentum.",
          trendingOpportunity: trendingOpportunity
            ? {
                title: trendingOpportunity.title,
                company: trendingOpportunity.company || "",
                role: trendingOpportunity.role || ""
              }
            : null
        }
      : null,
    leaderboard: {
      globalRank,
      collegeRank,
      stateRank
    }
  });
});

exports.completeDailyTask = asyncHandler(async (req, res) => {
  res.status(410).json({
    message: "Daily tasks were replaced by Daily Career Quiz.",
    action: "Use /api/network/daily-quiz and /api/network/daily-quiz/submit."
  });
});

exports.getDailyQuiz = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const dateKey = toDateKey();
  const [profile, userDoc, existingAttempt, streak] = await Promise.all([
    StudentProfile.findOne({ userId }).select("careerGoals skills").lean(),
    User.findById(userId).select("primaryCategory interestedCategories").lean(),
    QuizAttempt.findOne({ userId, dateKey }).lean(),
    QuizStreak.findOne({ userId }).lean()
  ]);
  const requestedDomain = String(req.query?.domain || "").trim();
  const domain = mentorCategoryTree[requestedDomain]
    ? requestedDomain
    : domainFromProfile({ user: userDoc, profile });

  if (existingAttempt) {
    return res.json({
      completedToday: true,
      dateKey,
      domain: existingAttempt.domain || domain,
      message: QUIZ_DAILY_LIMIT_MESSAGE,
      result: {
        score: existingAttempt.score,
        totalQuestions: existingAttempt.totalQuestions || 5,
        xpEarned: existingAttempt.xpAwarded || 0,
        streak: existingAttempt.streakAfter || streak?.currentStreak || 0
      },
      quiz: null
    });
  }

  const quizContext = buildQuizContext({ user: userDoc, profile, domain });
  const seededSkills = domainSkills(domain, quizContext);
  const profileSkills = (profile?.skills || []).map((item) => String(item || "").trim()).filter(Boolean);
  const skillSet = Array.from(new Set([...profileSkills, ...seededSkills]));
  const userSkillRows = await UserSkillLevel.find({ userId, domain }).select("skillScore").lean();
  const avgSkill =
    userSkillRows.length > 0
      ? userSkillRows.reduce((sum, item) => sum + Number(item.skillScore || 0), 0) / userSkillRows.length
      : 50;
  const startDifficulty = avgSkill < 30 ? "easy" : avgSkill < 70 ? "medium" : "hard";
  const templateQuestionPool = generateQuestionPool({ domain, skills: skillSet, quizContext });

  let questionPool = templateQuestionPool;
  let generationSource = "template";
  let generationMeta = {
    provider: null,
    model: null
  };

  try {
    const aiQuiz = await generateAiQuestionPool({
      userId,
      domain,
      quizContext,
      startDifficulty,
      desiredCount: QUIZ_AI_POOL_SIZE,
      fallbackSkills: skillSet
    });

    if (Array.isArray(aiQuiz?.questionPool) && aiQuiz.questionPool.length >= 5) {
      questionPool = aiQuiz.questionPool;
      generationSource = "ai";
      generationMeta = {
        provider: aiQuiz.provider || null,
        model: aiQuiz.model || null
      };
    }
  } catch (_error) {
    generationSource = "template";
  }

  res.json({
    completedToday: false,
    dateKey,
    domain,
    subCategory: quizContext.subCategory,
    message: "Daily Career Quiz ready.",
    streak: streak?.currentStreak || 0,
    quiz: {
      totalQuestions: 5,
      startDifficulty,
      generationSource,
      generationMeta,
      questionPool
    }
  });
});

exports.submitDailyQuiz = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const dateKey = toDateKey();
  const { domain, answers } = req.body || {};

  if (!domain || typeof domain !== "string") throw new ApiError(400, "Domain is required");
  if (!Array.isArray(answers) || answers.length !== 5) throw new ApiError(400, "Exactly 5 answers are required");

  const existingAttempt = await QuizAttempt.findOne({ userId, dateKey });
  if (existingAttempt) throw new ApiError(400, QUIZ_DAILY_LIMIT_MESSAGE);

  const normalizedAnswers = answers.map((item) => ({
    questionId: String(item.questionId || ""),
    skillName: String(item.skill || item.skillName || "General").trim(),
    difficulty: ["easy", "medium", "hard"].includes(String(item.difficulty || "").toLowerCase())
      ? String(item.difficulty).toLowerCase()
      : "medium",
    selectedOption: String(item.selectedOption || ""),
    correctOption: String(item.correctOption || ""),
    isCorrect: Boolean(item.isCorrect)
  }));

  const score = normalizedAnswers.filter((item) => item.isCorrect).length;
  const baseXp = QUIZ_XP_BY_SCORE[score] || 0;
  const streak = await updateQuizStreak(userId, dateKey);
  const streakBonus = STREAK_BONUS_XP[streak.currentStreak] || 0;
  const totalXp = baseXp + streakBonus;

  const updatedSkillRows = [];
  for (const answer of normalizedAnswers) {
    const updated = await upsertUserSkill(userId, domain, answer.skillName, answer.isCorrect);
    updatedSkillRows.push(updated);
  }

  const attempt = await QuizAttempt.create({
    userId,
    dateKey,
    domain,
    score,
    totalQuestions: 5,
    xpAwarded: totalXp,
    streakAfter: streak.currentStreak,
    answers: normalizedAnswers
  });

  await applyReputationDelta(userId, { dailyQuizXp: totalXp });

  const sortedSkills = [...updatedSkillRows].sort((a, b) => Number(b.skillScore || 0) - Number(a.skillScore || 0));
  const strength = sortedSkills[0]?.skillName || "Consistent Learning";
  const weakSkills = sortedSkills.filter((item) => Number(item.skillScore || 0) < 60).map((item) => item.skillName).slice(0, 3);
  const mentorRecommendations = await buildWeakSkillMentorRecommendations(domain, weakSkills);
  const trendingOpportunity = await CareerOpportunity.findOne({ isActive: true }).sort({ updatedAt: -1 }).lean();

  res.status(201).json({
    message: "Quiz completed",
    result: {
      score,
      totalQuestions: 5,
      xpEarned: totalXp,
      streak: streak.currentStreak
    },
    streakBonusXp: streakBonus,
    skillRadar: {
      domain,
      skills: sortedSkills.slice(0, 6).map((item) => ({
        name: item.skillName,
        score: Number(item.skillScore || 0)
      }))
    },
    careerIntelligence: {
      strength,
      needsImprovement: weakSkills,
      mentorRecommendations,
      recommendedNextStep:
        weakSkills.length > 0
          ? `Book a mentor session on ${weakSkills[0]}.`
          : "Continue advanced projects and mentor interactions.",
      trendingOpportunity: trendingOpportunity
        ? {
            title: trendingOpportunity.title,
            company: trendingOpportunity.company || "",
            role: trendingOpportunity.role || ""
          }
        : null
    },
    attemptId: attempt._id
  });
});

exports.getSmartSuggestions = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const profile = await StudentProfile.findOne({ userId }).select("collegeName skills").lean();
  const mySkills = profile?.skills || [];
  const myCollege = profile?.collegeName || "";

  const connections = await Connection.find({
    status: "accepted",
    $or: [{ requesterId: userId }, { recipientId: userId }]
  }).lean();
  const connectedIds = new Set([String(userId)]);
  connections.forEach((item) => {
    connectedIds.add(String(item.requesterId));
    connectedIds.add(String(item.recipientId));
  });

  const users = await User.find({
    isDeleted: false,
    _id: { $nin: Array.from(connectedIds) },
    role: { $in: ["student", "mentor"] }
  })
    .select("name role email primaryCategory subCategory specializations")
    .limit(60)
    .lean();

  const profiles = await StudentProfile.find({
    userId: { $in: users.map((u) => u._id) }
  })
    .select("userId collegeName skills")
    .lean();
  const profileByUserId = new Map(profiles.map((item) => [String(item.userId), item]));

  const scored = users
    .map((item) => {
      const p = profileByUserId.get(String(item._id));
      const sameCollege = myCollege && p?.collegeName && p.collegeName === myCollege ? 1 : 0;
      const skillOverlap = (p?.skills || []).filter((s) => mySkills.includes(s)).length;
      const domainOverlap = (item.specializations || []).filter((s) => mySkills.includes(s)).length;
      const score = sameCollege * 50 + skillOverlap * 20 + domainOverlap * 10 + (item.role === "mentor" ? 12 : 0);
      return {
        id: item._id,
        name: item.name,
        role: item.role,
        score,
        reason: sameCollege
          ? "Same college"
          : skillOverlap > 0
            ? "Similar skills"
            : domainOverlap > 0
              ? "Similar domain"
              : "Career network suggestion"
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 15);

  res.json(scored);
});

exports.getCollegeNetwork = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const profile = await StudentProfile.findOne({ userId }).select("collegeName").lean();
  const collegeName = profile?.collegeName || "";

  if (!collegeName) {
    return res.json({
      collegeName: "",
      topStudents: [],
      trendingProjects: [],
      skillRankings: []
    });
  }

  const collegeProfiles = await StudentProfile.find({ collegeName })
    .populate("userId", "name email role")
    .sort({ profileCompleteness: -1, updatedAt: -1 })
    .limit(20)
    .lean();

  const topStudents = collegeProfiles.slice(0, 10).map((item, idx) => ({
    rank: idx + 1,
    userId: item.userId?._id,
    name: item.userId?.name || "Student",
    profileCompleteness: item.profileCompleteness || 0
  }));

  const trendingProjects = collegeProfiles
    .flatMap((item) =>
      (item.projects || []).map((project) => ({
        owner: item.userId?.name || "Student",
        name: project.name || "",
        summary: project.summary || "",
        link: project.link || ""
      }))
    )
    .filter((item) => item.name)
    .slice(0, 20);

  const skillCounter = {};
  collegeProfiles.forEach((item) => {
    (item.skills || []).forEach((skill) => {
      const key = String(skill || "").trim();
      if (!key) return;
      skillCounter[key] = (skillCounter[key] || 0) + 1;
    });
  });
  const skillRankings = Object.keys(skillCounter)
    .map((skill) => ({ skill, users: skillCounter[skill] }))
    .sort((a, b) => b.users - a.users)
    .slice(0, 10);

  res.json({
    collegeName,
    topStudents,
    trendingProjects,
    skillRankings
  });
});

exports.getMentorMatches = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const studentProfile = await StudentProfile.findOne({ userId }).lean();
  const studentUser = await User.findById(userId).select("primaryCategory subCategory goals").lean();

  const domainOverride = String(req.query.domain || "").trim();
  const subDomainOverride = String(req.query.subDomain || "").trim();
  const goalOverride = String(req.query.goal || "").trim();
  const skillsOverride = parseCsvList(req.query.skills);
  const levelOverride = normalizeText(req.query.level || "");

  const effectiveDomain = domainOverride || studentUser?.primaryCategory || "";
  const effectiveSubDomain = subDomainOverride || studentUser?.subCategory || "";
  const effectiveGoal = goalOverride || studentProfile?.careerGoals || studentUser?.goals || effectiveDomain || "Career Growth";
  const effectiveSkills = skillsOverride.length ? skillsOverride : studentProfile?.skills || [];

  const studentSignals = [
    ...effectiveSkills,
    ...(effectiveGoal ? [effectiveGoal] : []),
    ...(studentUser?.goals ? [studentUser.goals] : []),
    ...(effectiveDomain ? [effectiveDomain] : []),
    ...(effectiveSubDomain ? [effectiveSubDomain] : [])
  ];
  const studentTokens = uniqueTokens(studentSignals);

  const mentorProfiles = await MentorProfile.find({})
    .populate("userId", "name email approvalStatus role isDeleted primaryCategory subCategory specializations")
    .sort({ rating: -1, totalSessionsConducted: -1, updatedAt: -1 })
    .limit(120)
    .lean();

  const scored = mentorProfiles
    .filter((item) => {
      const user = item.userId;
      if (!user || user.role !== "mentor" || user.approvalStatus !== "approved" || user.isDeleted === true) return false;

      // Optional level filter coming from the app UI (Beginner / Intermediate / Advanced).
      if (!levelOverride) return true;
      const years = Number(item.experienceYears || 0);
      if (levelOverride === "beginner") return years <= 3;
      if (levelOverride === "intermediate") return years >= 2 && years <= 6;
      if (levelOverride === "advanced") return years >= 5;
      return true;
    })
    .map((mentor) => {
      const mentorSignals = [
        mentor.primaryCategory || "",
        mentor.subCategory || "",
        ...(mentor.specializations || []),
        ...(mentor.expertiseDomains || []),
        ...(mentor.userId?.specializations || [])
      ];
      const mentorTokens = uniqueTokens(mentorSignals);

      let overlap = 0;
      studentTokens.forEach((token) => {
        if (mentorTokens.has(token)) overlap += 1;
      });

      const categoryExact =
        normalizeText(mentor.primaryCategory) &&
        normalizeText(mentor.primaryCategory) === normalizeText(effectiveDomain || "")
          ? 1
          : 0;
      const subCategoryExact =
        normalizeText(mentor.subCategory) &&
        normalizeText(mentor.subCategory) === normalizeText(effectiveSubDomain || "")
          ? 1
          : 0;

      const ratingFactor = Math.min(5, Number(mentor.rating || 0)) / 5;
      const experienceFactor = Math.min(12, Number(mentor.experienceYears || 0)) / 12;
      const sessionsFactor = Math.min(100, Number(mentor.totalSessionsConducted || 0)) / 100;

      const scoreRaw =
        overlap * 10 +
        categoryExact * 18 +
        subCategoryExact * 10 +
        ratingFactor * 25 +
        experienceFactor * 20 +
        sessionsFactor * 17;
      const matchScore = Math.max(25, Math.min(99, Math.round(scoreRaw)));

      return {
        mentorId: mentor.userId?._id,
        name: mentor.userId?.name || "Mentor",
        email: mentor.userId?.email || "",
        title: mentor.title || "Mentor",
        primaryCategory: mentor.primaryCategory || mentor.userId?.primaryCategory || "",
        subCategory: mentor.subCategory || mentor.userId?.subCategory || "",
        specializations: mentor.specializations || [],
        expertiseDomains: mentor.expertiseDomains || [],
        experienceYears: mentor.experienceYears || 0,
        rating: Number(mentor.rating || 0),
        totalSessionsConducted: Number(mentor.totalSessionsConducted || 0),
        sessionPrice: Number(mentor.sessionPrice || 0),
        profilePhotoUrl: mentor.profilePhotoUrl || "",
        matchScore,
        reasons: [
          categoryExact ? "Same domain" : null,
          subCategoryExact ? "Same sub-domain" : null,
          overlap > 0 ? `Skill overlap (${overlap})` : null,
          ratingFactor > 0 ? "Strong mentor rating" : null
        ].filter(Boolean)
      };
    })
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 12);

  res.json({
    studentSignals: {
      domain: effectiveDomain,
      subDomain: effectiveSubDomain,
      skills: effectiveSkills,
      careerGoal: effectiveGoal,
      level: levelOverride || ""
    },
    recommendations: scored
  });
});

exports.getSessionHistory = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const rows = await Session.find({
    studentId: userId,
    $or: [{ status: "completed" }, { sessionStatus: "completed" }, { paymentStatus: "verified" }, { paymentStatus: "paid" }]
  })
    .populate("mentorId", "name email")
    .sort({ scheduledStart: -1 })
    .limit(100)
    .lean();

  const history = rows.map((item) => ({
    sessionId: item._id,
    mentorId: item.mentorId?._id || null,
    mentorName: item.mentorId?.name || "Mentor",
    mentorEmail: item.mentorId?.email || "",
    date: item.date,
    time: item.time,
    amount: item.amount,
    paymentStatus: item.paymentStatus,
    status: item.status,
    sessionStatus: item.sessionStatus,
    notes: item.studentNotes || item.notes || "",
    feedback: item.feedback || "",
    meetingLink: item.meetingLink || ""
  }));

  res.json(history);
});

exports.updateStudentSessionNote = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { sessionId } = req.params;
  const { note } = req.body;

  if (!mongoose.Types.ObjectId.isValid(sessionId)) throw new ApiError(400, "Invalid sessionId");
  const nextNote = String(note || "").trim();
  if (!nextNote) throw new ApiError(400, "note is required");

  const session = await Session.findOne({ _id: sessionId, studentId: userId });
  if (!session) throw new ApiError(404, "Session not found");

  session.studentNotes = nextNote.slice(0, 2500);
  await session.save();

  res.json({ message: "Session note updated", sessionId: session._id, studentNotes: session.studentNotes });
});

exports.submitMentorReview = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { sessionId } = req.params;
  const { rating, reviewText = "" } = req.body;

  if (!mongoose.Types.ObjectId.isValid(sessionId)) throw new ApiError(400, "Invalid sessionId");
  const numericRating = Number(rating || 0);
  if (!Number.isFinite(numericRating) || numericRating < 1 || numericRating > 5) {
    throw new ApiError(400, "rating must be between 1 and 5");
  }

  const session = await Session.findOne({ _id: sessionId, studentId: userId });
  if (!session) throw new ApiError(404, "Session not found");

  const review = await MentorReview.findOneAndUpdate(
    { sessionId: session._id },
    {
      $set: {
        mentorId: session.mentorId,
        studentId: userId,
        rating: numericRating,
        reviewText: String(reviewText || "").trim().slice(0, 1200)
      }
    },
    { upsert: true, new: true }
  );

  const stats = await MentorReview.aggregate([
    { $match: { mentorId: session.mentorId } },
    {
      $group: {
        _id: "$mentorId",
        avgRating: { $avg: "$rating" },
        totalReviews: { $sum: 1 }
      }
    }
  ]);
  const avgRating = Number(stats[0]?.avgRating || 0);
  const totalReviews = Number(stats[0]?.totalReviews || 0);

  await MentorProfile.findOneAndUpdate(
    { userId: session.mentorId },
    { $set: { rating: Math.round(avgRating * 10) / 10, totalSessionsConducted: Math.max(totalReviews, 0) } }
  );

  await applyReputationDelta(session.mentorId, { mentorReviews: 1 });

  res.status(201).json({
    message: "Review saved",
    review: {
      id: review._id,
      rating: review.rating,
      reviewText: review.reviewText
    }
  });
});

exports.getMentorReviews = asyncHandler(async (req, res) => {
  const { mentorId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(mentorId)) throw new ApiError(400, "Invalid mentorId");

  const rows = await MentorReview.find({ mentorId })
    .populate("studentId", "name")
    .sort({ createdAt: -1 })
    .limit(40)
    .lean();

  const summary = await MentorReview.aggregate([
    { $match: { mentorId: new mongoose.Types.ObjectId(mentorId) } },
    { $group: { _id: "$mentorId", average: { $avg: "$rating" }, total: { $sum: 1 } } }
  ]);

  res.json({
    averageRating: Number(summary[0]?.average || 0).toFixed(1),
    totalReviews: Number(summary[0]?.total || 0),
    reviews: rows.map((item) => ({
      id: item._id,
      rating: item.rating,
      reviewText: item.reviewText,
      studentName: item.studentId?.name || "Student",
      createdAt: item.createdAt
    }))
  });
});

exports.getCareerRoadmap = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const studentProfile = await StudentProfile.findOne({ userId }).select("careerGoals skills").lean();
  const user = await User.findById(userId).select("goals primaryCategory subCategory").lean();
  let journeyState = await getJourneyState(userId, req.user.role);

  const ctx = resolveAiDomainContext({
    user,
    primaryCategory: req.query.primaryCategory || req.query.domain || journeyState?.goal?.domain,
    subCategory: req.query.subCategory || req.query.subDomain || journeyState?.goal?.subDomain,
    focus: req.query.focus || req.query.specialization || journeyState?.goal?.focus
  });

  const goal = String(
    req.query.goal ||
      journeyState?.goal?.title ||
      studentProfile?.careerGoals ||
      user?.goals ||
      ctx.goalLabel ||
      "Career Growth"
  );
  const template = getAiTemplate(ctx.primaryCategory, ctx.subCategory, ctx.focus);
  const currentRoadmapId = String(journeyState?.roadmap?.roadmapId || "").trim();
  const overrideSkills = parseCsvList(req.query.skills);
  const skillProfile = deriveSkillGapProfile({
    goal,
    template,
    overrideSkills,
    journeyState,
    profileSkills: studentProfile?.skills || []
  });
  const requestedRoadmapId = buildSkillAwareRoadmapId(goal, ctx, skillProfile.currentSkills);
  const stateSteps = (Array.isArray(journeyState?.roadmap?.steps) ? journeyState.roadmap.steps : [])
    .map((item) => item?.title)
    .filter(Boolean);
  const rawSteps = currentRoadmapId === requestedRoadmapId && stateSteps.length
    ? stateSteps
    : buildSkillProgressiveRoadmap({
        goal,
        ctx,
        template,
        knownSkills: skillProfile.currentSkills,
        missingSkills: skillProfile.missingSkills
      });
  const steps = rawSteps;
  const shouldRefreshRoadmap =
    currentRoadmapId !== requestedRoadmapId ||
    stateSteps.length !== steps.length ||
    stateSteps.some((title, index) => String(title || "").trim() !== String(steps[index] || "").trim());

  if (shouldRefreshRoadmap) {
    await updateJourneyGoal(
      userId,
      {
        title: goal,
        domain: ctx.primaryCategory,
        subDomain: ctx.subCategory,
        focus: ctx.focus,
        source: req.query.goal ? "assistant" : "profile"
      },
      req.user.role
    );
    await updateSkillProfile(
      userId,
      {
        knownSkills: skillProfile.currentSkills,
        missingSkills: skillProfile.missingSkills,
        readinessScore: skillProfile.readinessScore,
        level: skillProfile.level,
        roadmapSteps: steps,
        roadmapId: requestedRoadmapId
      },
      req.user.role
    );
    journeyState = await getJourneyState(userId, req.user.role);
  }

  const syncedRoadmap = await persistSyncedRoadmapState(journeyState);

  res.json({
    goal: String(goal),
    domainContext: ctx,
    steps: syncedRoadmap.steps.map((step, idx) => ({
      id: step.id,
      stepNumber: idx + 1,
      title: step.title,
      completed: step.status === "completed",
      status: step.status,
      startedAt: step.startedAt,
      completedAt: step.completedAt,
      unlockedAt: step.unlockedAt,
      proofStatus: step.proofStatus,
      proofSubmittedAt: step.proofSubmittedAt,
      proofSubmitted: Boolean(step.proofSubmittedAt || step.proofText || step.proofLink || step.proofImageUrl),
      proofImageUrl: step.proofImageUrl || "",
      canStart: step.status === "active" && !step.startedAt,
      canSubmitProof: step.status === "active" && Boolean(step.startedAt),
      proofRequired: true
    })),
    progress: {
      completedSteps: syncedRoadmap.steps.filter((step) => step.status === "completed").length,
      totalSteps: syncedRoadmap.steps.length,
      progressPercent: syncedRoadmap.progressPercent,
      currentStepId: syncedRoadmap.currentStepId,
      lockHours: ROADMAP_STEP_LOCK_HOURS
    },
    basedOn: {
      skills: skillProfile.currentSkills,
      domain: user?.primaryCategory || "",
      subDomain: user?.subCategory || "",
      missingSkills: skillProfile.missingSkills
    }
  });
});

exports.startCareerRoadmapMission = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const stepId = String(req.params?.stepId || "").trim();
  const state = await getJourneyState(userId, req.user.role);
  const synced = await persistSyncedRoadmapState(state);
  const step = synced.steps.find((item) => String(item.id) === stepId);

  if (!step) throw new ApiError(404, "Roadmap step not found");
  if (step.status !== "active") throw new ApiError(400, "This mission is still locked");
  if (step.completedAt) throw new ApiError(400, "This mission is already completed");

  step.startedAt = step.startedAt || new Date();
  state.roadmap.steps = synced.steps;
  state.roadmap.updatedAt = new Date();
  await state.save();

  res.json({
    success: true,
    message: "Mission started. Submit proof after completing the work.",
    step: {
      id: step.id,
      status: step.status,
      startedAt: step.startedAt
    }
  });
});

exports.submitCareerRoadmapProof = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const stepId = String(req.params?.stepId || "").trim();
  const proofText = String(req.body?.proofText || "").trim();
  const proofLink = String(req.body?.proofLink || "").trim();
  const proofImageUrl = String(req.body?.proofImageUrl || "").trim();

  if (!proofText && !proofLink && !proofImageUrl) {
    throw new ApiError(400, "Submit at least one proof item before completing the mission");
  }

  const state = await getJourneyState(userId, req.user.role);
  const synced = await persistSyncedRoadmapState(state);
  const stepIndex = synced.steps.findIndex((item) => String(item.id) === stepId);
  if (stepIndex < 0) throw new ApiError(404, "Roadmap step not found");

  const step = synced.steps[stepIndex];
  if (step.status !== "active") throw new ApiError(400, "This mission is not ready for proof submission");
  if (!step.startedAt) throw new ApiError(400, "Start the mission before submitting proof");
  if (step.completedAt) throw new ApiError(400, "This mission is already completed");

  const now = new Date();
  step.proofText = proofText;
  step.proofLink = proofLink;
  step.proofImageUrl = proofImageUrl;
  step.proofStatus = "approved";
  step.proofSubmittedAt = now;
  step.completedAt = now;
  step.status = "completed";

  const nextStep = synced.steps[stepIndex + 1];
  if (nextStep && !nextStep.completedAt) {
    nextStep.unlockedAt = new Date(now.getTime() + ROADMAP_STEP_LOCK_HOURS * 60 * 60 * 1000);
    nextStep.status = "locked";
  }

  const finalState = syncRoadmapState({
    steps: synced.steps
  });
  state.roadmap.steps = finalState.steps;
  state.roadmap.progressPercent = finalState.progressPercent;
  state.roadmap.currentStepId = finalState.currentStepId;
  state.roadmap.updatedAt = now;
  await state.save();

  res.json({
    success: true,
    message: "Proof submitted. Mission completed and the next mission will unlock on schedule.",
    step: {
      id: step.id,
      status: step.status,
      completedAt: step.completedAt,
      proofStatus: step.proofStatus
    },
    progress: {
      completedSteps: finalState.steps.filter((item) => item.status === "completed").length,
      totalSteps: finalState.steps.length,
      progressPercent: finalState.progressPercent,
      currentStepId: finalState.currentStepId
    }
  });
});

exports.getInstitutionRoadmaps = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const role = req.user.role;

  const profile = role === "mentor"
    ? await MentorProfile.findOne({ userId }).select("institutionName mentorOrgRole").lean()
    : await StudentProfile.findOne({ userId }).select("institutionName collegeName className learnerStage").lean();

  const institutionName = String(profile?.institutionName || profile?.collegeName || "").trim();
  const className = role === "student" ? String(profile?.className || "").trim() : "";
  const query = role === "mentor"
    ? { mentorId: userId }
    : {
        status: "published",
        $and: [
          audienceStageVisibilityFilter(audienceStageForViewer(role, profile), "mentorId", userId),
          {
            $or: [
              { scope: "global" },
              { scope: { $exists: false }, institutionName },
              { scope: "institution", institutionName },
              ...(className ? [{ scope: "class", institutionName, className }] : [])
            ]
          },
          ...(className ? [{ $or: [{ className }, { className: "" }, { className: { $exists: false } }] }] : [])
        ]
      };

  const rows = await InstitutionRoadmap.find(query)
    .populate("mentorId", "name")
    .sort({ createdAt: -1 })
    .limit(30)
    .lean();

  const roadmapIds = rows.map((item) => item._id);
  const submissions =
    role === "student" && roadmapIds.length
      ? await InstitutionRoadmapSubmission.find({ roadmapId: { $in: roadmapIds }, studentId: userId }).lean()
      : [];
  const submissionMap = new Map(
    submissions.map((item) => [`${String(item.roadmapId)}::${String(item.weekId || "")}`, item])
  );

  res.json({
    institutionName,
    className,
    roadmaps: rows.map((item) => ({
      id: item._id,
      title: item.title,
      description: item.description || "",
      domain: item.domain || "",
      scope: item.scope || (item.institutionName ? "institution" : "global"),
      institutionName: item.institutionName || "",
      className: item.className || "",
      status: item.status,
      weeks: (item.weeks || []).map((week, index) => ({
        id: week.id || `week-${index + 1}`,
        title: week.title || `Week ${index + 1}`,
        description: week.description || "",
        tasks: week.tasks || [],
        resources: week.resources || [],
        quizTitle: week.quizTitle || "",
        challengeTitle: week.challengeTitle || "",
        xpReward: Number(week.xpReward || 0),
        submission:
          role === "student"
            ? (() => {
                const submission = submissionMap.get(`${String(item._id)}::${String(week.id || `week-${index + 1}`)}`);
                if (!submission) return null;
                return {
                  id: submission._id,
                  status: submission.status,
                  proofText: submission.proofText || "",
                  proofLink: submission.proofLink || "",
                  proofImageUrl: submission.proofImageUrl || "",
                  submittedAt: submission.submittedAt,
                  mentorReview: {
                    reviewedAt: submission.mentorReview?.reviewedAt || null,
                    notes: submission.mentorReview?.notes || "",
                    xpAwarded: Number(submission.mentorReview?.xpAwarded || 0),
                    certificateId: submission.mentorReview?.certificateId || null
                  }
                };
              })()
            : null
      })),
      mentor: {
        id: item.mentorId?._id || null,
        name: item.mentorId?.name || "Mentor"
      },
      createdAt: item.createdAt
    }))
  });
});

exports.createInstitutionRoadmap = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const mentorProfile = await MentorProfile.findOne({ userId }).select("institutionName mentorOrgRole").lean();

  const title = String(req.body?.title || "").trim();
  const className = String(req.body?.className || "").trim();
  const scopeDetails = normalizeContentScope({
    requestedScope: req.body?.scope,
    role: req.user.role,
    institutionName: req.body?.institutionName || mentorProfile?.institutionName || "",
    className
  });
  if (!title) throw new ApiError(400, "title is required");

  const weeks = (Array.isArray(req.body?.weeks) ? req.body.weeks : [])
    .slice(0, 12)
    .map((item, index) => normalizeInstitutionRoadmapWeek(item, index))
    .filter((item) => item.title);

  if (!weeks.length) throw new ApiError(400, "Add at least one roadmap week");

  const roadmap = await InstitutionRoadmap.create({
    mentorId: userId,
    scope: scopeDetails.scope,
    institutionName: scopeDetails.institutionName,
    title,
    description: String(req.body?.description || "").trim(),
    domain: String(req.body?.domain || "").trim(),
    className: scopeDetails.className,
    audienceStage: audienceStageForMentorProfile(mentorProfile, req.body?.audienceStage),
    status: String(req.body?.status || "published").trim() === "draft" ? "draft" : "published",
    weeks
  });

  res.status(201).json({
    message: "Institution roadmap created",
    roadmapId: roadmap._id
  });
});

exports.submitInstitutionRoadmapWeekProof = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { roadmapId, weekId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(roadmapId)) throw new ApiError(400, "Invalid roadmapId");
  const proofText = String(req.body?.proofText || "").trim();
  const proofLink = String(req.body?.proofLink || "").trim();
  const proofImageUrl = String(req.body?.proofImageUrl || "").trim();
  if (!proofText && !proofLink && !proofImageUrl) throw new ApiError(400, "Submit at least one proof item");

  const [studentProfile, roadmap] = await Promise.all([
    StudentProfile.findOne({ userId }).select("institutionName collegeName className").lean(),
    InstitutionRoadmap.findById(roadmapId).lean()
  ]);
  if (!roadmap || roadmap.status !== "published") throw new ApiError(404, "Institution roadmap not found");
  const institutionName = String(studentProfile?.institutionName || studentProfile?.collegeName || "").trim();
  const roadmapScope = String(roadmap.scope || (roadmap.institutionName ? "institution" : "global")).trim();
  if (roadmapScope !== "global" && (!institutionName || institutionName !== String(roadmap.institutionName || "").trim())) {
    throw new ApiError(403, "You cannot submit proof for this institution roadmap");
  }
  const studentClassName = String(studentProfile?.className || "").trim();
  const roadmapClassName = String(roadmap.className || "").trim();
  if (roadmapClassName && roadmapClassName !== studentClassName) {
    throw new ApiError(403, "This roadmap is assigned to a different class");
  }

  const week = (roadmap.weeks || []).find((item) => String(item.id || "") === String(weekId || ""));
  if (!week) throw new ApiError(404, "Institution roadmap week not found");

  const existing = await InstitutionRoadmapSubmission.findOne({ roadmapId, studentId: userId, weekId });
  if (existing?.status === "accepted") {
    throw new ApiError(400, "This week is already approved");
  }

  const submission = await InstitutionRoadmapSubmission.findOneAndUpdate(
    { roadmapId, studentId: userId, weekId },
    {
      $set: {
        proofText,
        proofLink,
        proofImageUrl,
        status: "submitted",
        submittedAt: new Date(),
        "mentorReview.reviewedAt": null,
        "mentorReview.notes": "",
        "mentorReview.xpAwarded": 0,
        "mentorReview.certificateId": null
      }
    },
    { upsert: true, new: true }
  );

  res.status(201).json({
    message: "Institution roadmap proof submitted",
    submission: {
      id: submission._id,
      status: submission.status,
      submittedAt: submission.submittedAt
    }
  });
});

exports.getInstitutionRoadmapSubmissionsForMentor = asyncHandler(async (req, res) => {
  const mentorId = req.user.id;
  const roadmapIds = await InstitutionRoadmap.find({ mentorId }).distinct("_id");
  if (!roadmapIds.length) return res.json([]);

  const rows = await InstitutionRoadmapSubmission.find({ roadmapId: { $in: roadmapIds } })
    .populate("studentId", "name email")
    .populate("roadmapId")
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();

  res.json(
    rows.map((item) => {
      const roadmap = item.roadmapId || {};
      const week = (roadmap.weeks || []).find((entry) => String(entry.id || "") === String(item.weekId || ""));
      return {
        id: item._id,
        roadmapId: roadmap._id,
        roadmapTitle: roadmap.title || "Institution Roadmap",
        weekId: item.weekId,
        weekTitle: week?.title || item.weekId,
        status: item.status,
        proofText: item.proofText || "",
        proofLink: item.proofLink || "",
        proofImageUrl: item.proofImageUrl || "",
        submittedAt: item.submittedAt,
        student: {
          id: item.studentId?._id || null,
          name: item.studentId?.name || "Student",
          email: item.studentId?.email || ""
        },
        mentorReview: {
          reviewedAt: item.mentorReview?.reviewedAt || null,
          notes: item.mentorReview?.notes || "",
          xpAwarded: Number(item.mentorReview?.xpAwarded || 0),
          certificateId: item.mentorReview?.certificateId || null
        }
      };
    })
  );
});

exports.reviewInstitutionRoadmapSubmission = asyncHandler(async (req, res) => {
  const mentorId = req.user.id;
  const { submissionId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(submissionId)) throw new ApiError(400, "Invalid submissionId");

  const submission = await InstitutionRoadmapSubmission.findById(submissionId);
  if (!submission) throw new ApiError(404, "Submission not found");

  const roadmap = await InstitutionRoadmap.findById(submission.roadmapId).lean();
  if (!roadmap || String(roadmap.mentorId) !== String(mentorId)) throw new ApiError(403, "Not allowed to review this submission");

  const status = String(req.body?.status || "").trim();
  if (!["accepted", "rejected"].includes(status)) throw new ApiError(400, "status must be accepted or rejected");
  const xpAwarded = Math.max(0, Number(req.body?.xpAwarded || 0));
  const notes = String(req.body?.notes || "").trim();
  const previousRoadmapXp = submission.status === "accepted" ? Number(submission.mentorReview?.xpAwarded || 0) : 0;

  submission.status = status;
  submission.mentorReview.reviewedAt = new Date();
  submission.mentorReview.notes = notes;
  submission.mentorReview.xpAwarded = status === "accepted" ? xpAwarded : 0;

  const roadmapXpDelta = Number(submission.mentorReview.xpAwarded || 0) - previousRoadmapXp;
  if (roadmapXpDelta !== 0) {
    await applyReputationDelta(submission.studentId, { roadmapXp: roadmapXpDelta });
  }

  if (status === "accepted" && req.body?.issueCertificate) {
    const week = (roadmap.weeks || []).find((item) => String(item.id || "") === String(submission.weekId || ""));
    const studentUser = await User.findById(submission.studentId).select("name").lean();
    const { certificate } = await issueCertificate({
      userId: submission.studentId,
      userName: studentUser?.name || "Student",
      title: `${roadmap.title} - ${week?.title || submission.weekId} Completion`,
      type: "roadmap",
      issuedBy: req.user.name || "Institution Mentor",
      source: "Institution Roadmap",
      level: "Institution",
      domain: String(roadmap.domain || "").trim(),
      referenceType: "roadmap",
      referenceId: `institution-roadmap:${String(roadmap._id)}:${String(submission.weekId)}`,
      metadata: {
        domain: String(roadmap.domain || "").trim(),
        level: "Institution",
        score: xpAwarded || Number(week?.xpReward || 0),
        goal: roadmap.title,
        totalSteps: Number((roadmap.weeks || []).length || 0),
        completedSteps: 1
      }
    });
    submission.mentorReview.certificateId = certificate?._id || null;
  }

  await submission.save();

  res.json({
    message: "Institution roadmap submission reviewed",
    submission: {
      id: submission._id,
      status: submission.status,
      mentorReview: {
        reviewedAt: submission.mentorReview.reviewedAt,
        notes: submission.mentorReview.notes,
        xpAwarded: submission.mentorReview.xpAwarded,
        certificateId: submission.mentorReview.certificateId
      }
    }
  });
});

exports.getCareerOpportunities = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const role = req.user.role;
  const [profile, user, journeyState, audienceProfile] = await Promise.all([
    StudentProfile.findOne({ userId }).select("skills careerGoals projects institutionName collegeName className learnerStage").lean(),
    User.findById(userId).select("primaryCategory subCategory").lean(),
    getJourneyState(userId, role || "student"),
    role === "mentor"
      ? MentorProfile.findOne({ userId }).select("institutionName mentorOrgRole").lean()
      : StudentProfile.findOne({ userId }).select("institutionName collegeName className learnerStage").lean()
  ]);
  const goal = String(journeyState?.goal?.title || profile?.careerGoals || user?.primaryCategory || "Career Growth").trim();
  const internshipState = buildInternshipReadinessState({ journeyState, profile, goal });
  const audienceInstitutionName = String(audienceProfile?.institutionName || audienceProfile?.collegeName || "").trim();
  const audienceClassName = String(audienceProfile?.className || "").trim();
  const viewerAudienceStage = audienceStageForViewer(role, audienceProfile);
  const audienceStageFilter = audienceStageVisibilityFilter(viewerAudienceStage, "postedBy", userId);
  const opportunityAudienceFilters = [
    { scope: { $exists: false } },
    { scope: "global" },
    { scope: "", institutionName: "" },
    { scope: null, institutionName: "" }
  ];
  if (audienceInstitutionName) {
    opportunityAudienceFilters.push({ scope: "institution", institutionName: audienceInstitutionName });
    opportunityAudienceFilters.push({ scope: { $exists: false }, institutionName: audienceInstitutionName });
    if (audienceClassName) {
      opportunityAudienceFilters.push({ scope: "class", institutionName: audienceInstitutionName, className: audienceClassName });
    }
  }

  const queryTokens = uniqueTokens([
    ...(profile?.skills || []),
    profile?.careerGoals || "",
    user?.primaryCategory || "",
    user?.subCategory || "",
    journeyState?.goal?.focus || "",
    journeyState?.goal?.subDomain || "",
    ...(journeyState?.skillProfile?.missingSkills || []),
    String(req.query.q || "")
  ]);

  const opportunitiesQuery =
    role === "mentor"
      ? {
          $and: [
            { $or: opportunityAudienceFilters },
            audienceStageFilter,
            {
              $or: [
                { isActive: true },
                { postedBy: userId }
              ]
            }
          ]
        }
      : {
          isActive: true,
          $and: [
            { $or: opportunityAudienceFilters },
            audienceStageFilter
          ]
        };

  let opportunities = await CareerOpportunity.find(opportunitiesQuery)
    .sort({ createdAt: -1 })
    .limit(80)
    .lean();

  if (opportunities.length === 0) {
    opportunities = [
      {
        _id: "seed-1",
        title: "ML Internship Program",
        company: "AI Startup",
        type: "internship",
        role: "ML Intern",
        duration: "3 months",
        location: "Remote",
        domainTags: ["ai", "ml", "python"],
        applicationUrl: "",
        description: "Hands-on internship for students interested in machine learning.",
        createdAt: new Date()
      },
      {
        _id: "seed-2",
        title: "National Coding Hackathon",
        company: "Open Innovation Forum",
        type: "hackathon",
        role: "Participant",
        duration: "48 hours",
        location: "Online",
        domainTags: ["coding", "web", "ai"],
        applicationUrl: "",
        description: "Build a practical solution and compete with students nationwide.",
        createdAt: new Date()
      }
    ];
  }

  const scored = opportunities
    .map((item) => {
      const tokens = uniqueTokens([
        item.title,
        item.company,
        item.role,
        item.description,
        ...(item.domainTags || [])
      ]);
      let score = 0;
      queryTokens.forEach((token) => {
        if (tokens.has(token)) score += 1;
      });
      const recommended = score > 0 || internshipState.unlocked;
      const recommendationReason = internshipState.unlocked
        ? score > 0
          ? `Recommended because it fits your ${goal} journey`
          : "You are internship-ready and can start applying"
        : internshipState.reasons[0] || "Build readiness before applying";
      return {
        ...item,
        category: item.category || item.type || "internship",
        bannerImageUrl: item.bannerImageUrl || "",
        supportingDocuments: item.supportingDocuments || [],
        isPaid: Boolean(item.isPaid),
        eventDate: item.eventDate || item.applicationDeadline || null,
        relevanceScore: score,
        recommended,
        readinessUnlocked: internshipState.unlocked,
        readinessScore: internshipState.readinessScore,
        roadmapProgress: internshipState.roadmapProgress,
        completedProjectCount: internshipState.completedProjectCount,
        recommendationReason,
        readinessHint: internshipState.reasons[0] || ""
      };
    })
    .sort((a, b) => b.relevanceScore - a.relevanceScore || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 40);

  res.json(scored);
});

exports.submitCareerOpportunity = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const title = String(req.body?.title || "").trim();
  if (!title) throw new ApiError(400, "Title is required");

  const type = String(req.body?.type || "internship").trim();
  const allowedTypes = ["workshop", "internship", "hackathon", "competition", "research", "job", "other"];
  if (!allowedTypes.includes(type)) throw new ApiError(400, "Invalid opportunity type");
  const category = String(req.body?.category || type || "internship").trim();

  const applicationUrl = String(req.body?.applicationUrl || "").trim();
  const bannerImageUrl = String(req.body?.bannerImageUrl || "").trim();
  const supportingDocuments = Array.isArray(req.body?.supportingDocuments)
    ? req.body.supportingDocuments.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 8)
    : [];
  const isPaid = Boolean(req.body?.isPaid);
  const applicationDeadline = req.body?.applicationDeadline ? new Date(req.body.applicationDeadline) : null;
  const eventDate = req.body?.eventDate ? new Date(req.body.eventDate) : null;
  const domainTags = Array.isArray(req.body?.domainTags)
    ? req.body.domainTags.map((t) => String(t || "").trim()).filter(Boolean).slice(0, 10)
    : [];
  if (applicationDeadline && Number.isNaN(applicationDeadline.getTime())) throw new ApiError(400, "Invalid application deadline");
  if (eventDate && Number.isNaN(eventDate.getTime())) throw new ApiError(400, "Invalid event date");

  const doc = await CareerOpportunity.create({
    title,
    company: String(req.body?.company || "").trim(),
    type,
    category,
    role: String(req.body?.role || "").trim(),
    duration: String(req.body?.duration || "").trim(),
    location: String(req.body?.location || "").trim(),
    domainTags,
    applicationUrl,
    applicationDeadline,
    eventDate,
    bannerImageUrl,
    supportingDocuments,
    isPaid,
    description: String(req.body?.description || "").trim(),
    isActive: false, // pending admin activation
    postedBy: userId
  });

  res.status(201).json({
    message: "Opportunity submitted for admin review",
    opportunity: {
      id: doc._id,
      title: doc.title,
      isActive: doc.isActive
    }
  });
});

exports.getCollegeLeaderboard = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const profile = await StudentProfile.findOne({ userId }).select("collegeName state").lean();
  const collegeName = profile?.collegeName || "";
  const stateName = String(profile?.state || "").trim();
  const dateKey = toDateKey();

  await upsertLeaderboardForToday({ collegeName, stateName });

  const globalSnapshot = await LeaderboardSnapshot.findOne({ dateKey, scope: "global", collegeName: "", stateName: "" })
    .populate("entries.userId", "name")
    .lean();

  const collegeSnapshot = collegeName
    ? await LeaderboardSnapshot.findOne({ dateKey, scope: "college", collegeName, stateName: "" })
      .populate("entries.userId", "name")
      .lean()
    : null;

  const stateSnapshot = stateName
    ? await LeaderboardSnapshot.findOne({ dateKey, scope: "state", collegeName: "", stateName })
      .populate("entries.userId", "name")
      .lean()
    : null;

  const profileIds = [
    ...new Set(
        [
          ...(globalSnapshot?.entries || []).map((item) => item.userId?._id || item.userId),
          ...(stateSnapshot?.entries || []).map((item) => item.userId?._id || item.userId),
          ...(collegeSnapshot?.entries || []).map((item) => item.userId?._id || item.userId)
        ]
        .map((item) => String(item || "").trim())
        .filter(Boolean)
    )
  ].map((id) => new mongoose.Types.ObjectId(id));

  const profileRows = profileIds.length
    ? await StudentProfile.find({ userId: { $in: profileIds } })
      .select("userId profilePhotoUrl")
      .lean()
    : [];

  const photoMap = new Map(
    profileRows.map((item) => [String(item.userId), item.profilePhotoUrl || ""])
  );
  const streakRows = profileIds.length
    ? await QuizStreak.find({ userId: { $in: profileIds } }).select("userId currentStreak").lean()
    : [];
  const streakMap = new Map(streakRows.map((item) => [String(item.userId), Number(item.currentStreak || 0)]));

  const mapEntries = (entries = []) => {
    const rows = entries.map((item) => {
      const userIdValue = item.userId?._id || item.userId || null;
      const streakDays = streakMap.get(String(userIdValue || "")) || 0;
      const streakBonusScore = Math.min(150, streakDays * 3);
      return {
        baseRank: Number(item.rank || 0),
        userId: userIdValue,
        name: item.userId?.name || "User",
        score: Number(item.score || 0) + streakBonusScore,
        baseScore: Number(item.score || 0),
        streakDays,
        streakBonusScore,
        profilePhotoUrl: photoMap.get(String(userIdValue || "")) || ""
      };
    });
    rows.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.baseRank - b.baseRank;
    });
    return rows.slice(0, 20).map((item, index) => ({
      rank: index + 1,
      userId: item.userId,
      name: item.name,
      score: item.score,
      baseScore: item.baseScore,
      streakDays: item.streakDays,
      streakBonusScore: item.streakBonusScore,
      profilePhotoUrl: item.profilePhotoUrl
    }));
  };

  const globalEntries = mapEntries(globalSnapshot?.entries || []);
  const stateEntries = mapEntries(stateSnapshot?.entries || []);
  const collegeEntries = mapEntries(collegeSnapshot?.entries || []);
  const meCollege = collegeEntries.find((item) => String(item.userId) === String(userId)) || null;
  const meState = stateEntries.find((item) => String(item.userId) === String(userId)) || null;
  const meGlobal = globalEntries.find((item) => String(item.userId) === String(userId)) || null;
  const meStreak = streakMap.get(String(userId)) || 0;

  const completedCompetitions = await HighSchoolCompetition.find({
    status: "completed"
  })
    .sort({ updatedAt: -1 })
    .limit(50)
    .select("title subject winnerStudentId winnerStudentName winnerInstitutionName level2Batches")
    .lean();

  const programsLeaderboard = completedCompetitions
    .map((item, index) => {
      let winnerStudentName = String(item.winnerStudentName || "").trim();
      let winnerInstitutionName = String(item.winnerInstitutionName || "").trim();
      if (!winnerStudentName && Array.isArray(item.level2Batches) && item.level2Batches.length) {
        for (const batch of item.level2Batches) {
          const winnerId = String(batch?.winnerStudentId || "").trim();
          if (!winnerId) continue;
          const participant = (batch?.participants || []).find((row) => String(row.studentId) === winnerId);
          if (participant) {
            winnerStudentName = String(participant.studentName || "").trim();
            winnerInstitutionName = String(participant.institutionName || "").trim();
            break;
          }
        }
      }
      return {
        rank: index + 1,
        competitionId: String(item._id),
        title: item.title,
        subject: item.subject,
        winnerStudentId: item.winnerStudentId || null,
        winnerStudentName: winnerStudentName || "Winner Pending",
        winnerInstitutionName: winnerInstitutionName || "Institution Pending"
      };
    })
    .filter((item) => String(item.winnerStudentName || "").trim());

  const institutionProgramTable = new Map();
  programsLeaderboard.forEach((row) => {
    const key = String(row.winnerInstitutionName || "Unknown Institution").trim() || "Unknown Institution";
    institutionProgramTable.set(key, Number(institutionProgramTable.get(key) || 0) + 1);
  });
  const programsInstitutionLeaderboard = [...institutionProgramTable.entries()]
    .map(([institutionName, wins]) => ({ institutionName, wins }))
    .sort((a, b) => b.wins - a.wins || a.institutionName.localeCompare(b.institutionName))
    .map((item, index) => ({ rank: index + 1, ...item }));

  res.json({
    dateKey,
    collegeName,
    stateName,
    collegeTop: collegeEntries,
    stateTop: stateEntries,
    globalTop: globalEntries,
    me: {
      score: meCollege?.score || meState?.score || meGlobal?.score || 0,
      streakDays: meStreak,
      collegeRank: meCollege?.rank || null,
      stateRank: meState?.rank || null,
      globalRank: meGlobal?.rank || null
    },
    programsLeaderboard: {
      competitions: programsLeaderboard,
      institutions: programsInstitutionLeaderboard
    }
  });
});

exports.getLiveSessions = asyncHandler(async (req, res) => {
  await expireOverdueLiveSessionBookings();

  const baseQuery =
    req.user.role === "mentor"
      ? {
          isCancelled: false,
          $or: [
            { approvalStatus: "approved", isPublic: true },
            { mentorId: req.user.id }
          ],
          startsAt: { $gte: new Date(Date.now() - 2 * 60 * 60 * 1000) }
        }
      : {
          isPublic: true,
          isCancelled: false,
          approvalStatus: "approved",
          startsAt: { $gte: new Date(Date.now() - 2 * 60 * 60 * 1000) }
        };

  const rows = await MentorLiveSession.find(baseQuery)
    .populate("mentorId", "name email")
    .sort({ startsAt: 1 })
    .limit(60)
    .lean();

  const sessionIds = rows.map((item) => item._id);
  const [bookingStats, myBookings] = await Promise.all([
    MentorLiveSessionBooking.aggregate([
      {
        $match: {
          liveSessionId: { $in: sessionIds },
          bookingStatus: { $in: ["pending_payment", "booked"] },
          paymentStatus: { $in: ["pending", "paid"] }
        }
      },
      { $group: { _id: "$liveSessionId", count: { $sum: 1 } } }
    ]),
    MentorLiveSessionBooking.find({
      liveSessionId: { $in: sessionIds },
      studentId: req.user.id
    })
      .sort({ createdAt: -1 })
      .lean()
  ]);

  const bookingCountBySessionId = new Map(
    bookingStats.map((item) => [String(item._id), Number(item.count || 0)])
  );
  const myBookingBySessionId = new Map();
  myBookings.forEach((booking) => {
    const key = String(booking.liveSessionId);
    if (!myBookingBySessionId.has(key)) {
      myBookingBySessionId.set(key, booking);
    }
  });

  res.json(
    rows.map((item) =>
      normalizeLiveSessionPayload(
        {
          ...item,
          bookingCount: bookingCountBySessionId.get(String(item._id)) || 0
        },
        req.user.id,
        myBookingBySessionId
      )
    )
  );
});

exports.createLiveSession = asyncHandler(async (req, res) => {
  if (req.user.role !== "mentor") throw new ApiError(403, "Only mentors can create live sessions");

  const {
    title,
    topic = "",
    description = "",
    posterImageUrl = "",
    startsAt,
    endsAt = null,
    durationMinutes = 60,
    meetingLink = "",
    meetingProvider = "manual",
    domainTags = [],
    sessionMode = "free",
    price = 0,
    currency = "INR",
    maxParticipants = 50
  } = req.body;
  if (!title || !String(title).trim()) throw new ApiError(400, "title is required");
  const startDate = new Date(startsAt);
  if (Number.isNaN(startDate.getTime())) throw new ApiError(400, "startsAt is invalid");
  const normalizedMode = String(sessionMode || "free").trim().toLowerCase();
  const normalizedPrice = Number(price || 0);
  if (!["free", "paid"].includes(normalizedMode)) throw new ApiError(400, "sessionMode must be free or paid");
  if (normalizedMode === "paid" && normalizedPrice <= 0) throw new ApiError(400, "Paid live sessions require a valid price");
  const normalizedMaxParticipants = Math.min(Math.max(Number(maxParticipants || 0), 1), 1000);

  const doc = await MentorLiveSession.create({
    mentorId: req.user.id,
    title: String(title).trim(),
    topic: String(topic || "").trim(),
    description: String(description || "").trim(),
    posterImageUrl: String(posterImageUrl || "").trim(),
    startsAt: startDate,
    endsAt: endsAt ? new Date(endsAt) : null,
    durationMinutes: Math.min(Math.max(Number(durationMinutes || 60), 15), 480),
    ...buildManualMeetingPayload(String(meetingLink || "").trim()),
    domainTags: Array.isArray(domainTags) ? domainTags : [],
    sessionMode: normalizedMode,
    price: normalizedMode === "paid" ? normalizedPrice : 0,
    currency: String(currency || "INR").trim() || "INR",
    maxParticipants: normalizedMaxParticipants,
    interestedUserIds: [],
    isPublic: true,
    isCancelled: false,
    approvalStatus: "pending",
    adminReviewNote: "",
    reviewedBy: null,
    reviewedAt: null
  });

  if (String(meetingProvider || "").trim().toLowerCase() === "jitsi") {
    const jitsiMeeting = buildJitsiMeetingPayload({
      scope: "live-session",
      entityId: doc._id,
      createdBy: req.user.id
    });
    doc.meetingProvider = jitsiMeeting.meetingProvider;
    doc.meetingLink = jitsiMeeting.meetingLink;
    doc.meetingMeta = jitsiMeeting.meetingMeta;
    await doc.save();
  }

  await createAuditLog({
    req,
    actorId: req.user.id,
    action: "network.live_session.create",
    entityType: "MentorLiveSession",
    entityId: doc._id,
    metadata: { sessionMode: normalizedMode, price: doc.price, maxParticipants: doc.maxParticipants }
  });

  res.status(201).json({
    message: "Live session submitted for admin approval",
    liveSession: normalizeLiveSessionPayload(doc.toObject(), req.user.id)
  });
});

exports.updateLiveSessionMeetingLink = asyncHandler(async (req, res) => {
  const { liveSessionId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(liveSessionId)) throw new ApiError(400, "Invalid live session id");

  const session = await MentorLiveSession.findOne({ _id: liveSessionId, mentorId: req.user.id });
  if (!session) throw new ApiError(404, "Live session not found");

  const provider = String(req.body?.meetingProvider || "manual").trim().toLowerCase();
  const nextMeeting =
    provider === "jitsi"
      ? buildJitsiMeetingPayload({ scope: "live-session", entityId: session._id, createdBy: req.user.id })
      : buildManualMeetingPayload(req.body?.meetingLink);

  session.meetingProvider = nextMeeting.meetingProvider;
  session.meetingLink = nextMeeting.meetingLink;
  session.meetingMeta = nextMeeting.meetingMeta;
  await session.save();

  res.status(200).json({
    message: session.meetingLink ? "Live session link updated" : "Live session link cleared",
    liveSession: normalizeLiveSessionPayload(session.toObject(), req.user.id)
  });
});

exports.toggleLiveSessionInterest = asyncHandler(async (req, res) => {
  const { liveSessionId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(liveSessionId)) throw new ApiError(400, "Invalid live session id");

  const liveSession = await MentorLiveSession.findById(liveSessionId);
  if (!liveSession || liveSession.isCancelled || !liveSession.isPublic) {
    throw new ApiError(404, "Live session not found");
  }

  if (String(liveSession.mentorId) === String(req.user.id)) {
    throw new ApiError(400, "Mentor cannot mark interest on own live session");
  }

  const alreadyInterested = (liveSession.interestedUserIds || []).some(
    (userId) => String(userId) === String(req.user.id)
  );

  if (alreadyInterested) {
    liveSession.interestedUserIds = (liveSession.interestedUserIds || []).filter(
      (userId) => String(userId) !== String(req.user.id)
    );
  } else {
    liveSession.interestedUserIds.push(req.user.id);
  }

  await liveSession.save();

  res.json({
    message: alreadyInterested ? "Interest removed" : "Marked as interested",
    liveSession: {
      id: liveSession._id,
      interestedCount: liveSession.interestedUserIds.length,
      isInterested: !alreadyInterested
    }
  });
});

exports.bookLiveSession = asyncHandler(async (req, res) => {
  if (req.user.role !== "student") throw new ApiError(403, "Only students can book live sessions");

  await expireOverdueLiveSessionBookings();

  const { liveSessionId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(liveSessionId)) throw new ApiError(400, "Invalid live session id");

  const liveSession = await MentorLiveSession.findById(liveSessionId).lean();
  if (!liveSession || liveSession.isCancelled || !liveSession.isPublic || liveSession.approvalStatus !== "approved") {
    throw new ApiError(404, "Live session not available");
  }

  if (new Date(liveSession.startsAt).getTime() <= Date.now()) {
    throw new ApiError(400, "Live session has already started");
  }

  const activeCount = await MentorLiveSessionBooking.countDocuments({
    liveSessionId,
    bookingStatus: { $in: ["pending_payment", "booked"] },
    paymentStatus: { $in: ["pending", "paid"] }
  });
  if (activeCount >= Number(liveSession.maxParticipants || 50)) {
    throw new ApiError(409, "This live session is full");
  }

  const existing = await MentorLiveSessionBooking.findOne({
    liveSessionId,
    studentId: req.user.id,
    bookingStatus: { $in: ["pending_payment", "booked"] }
  }).sort({ createdAt: -1 });

  if (existing) {
    if (existing.bookingStatus === "booked" && existing.paymentStatus === "paid") {
      return res.status(200).json({
        message: "Live session already booked",
        mode: existing.paymentMode === "free" ? "free" : "razorpay",
        booking: existing
      });
    }

    if (existing.paymentMode === "razorpay" && existing.paymentStatus === "pending") {
      return res.status(200).json({
        message: "Live session payment already pending",
        mode: "razorpay",
        booking: existing,
        order: existing.orderId
          ? { id: existing.orderId, amount: existing.amount * 100, currency: existing.currency || "INR" }
          : null,
        razorpayKeyId,
        paymentInstructions: {
          amount: existing.amount,
          currency: existing.currency || "INR",
          dueAt: existing.paymentDueAt || null
        }
      });
    }
  }

  if (liveSession.sessionMode !== "paid" || Number(liveSession.price || 0) <= 0) {
    const freeBooking = await MentorLiveSessionBooking.create({
      liveSessionId,
      mentorId: liveSession.mentorId,
      studentId: req.user.id,
      amount: 0,
      currency: liveSession.currency || "INR",
      paymentMode: "free",
      paymentStatus: "paid",
      bookingStatus: "booked"
    });

    return res.status(201).json({
      message: "Live session booked",
      mode: "free",
      booking: freeBooking
    });
  }

  if (paymentMode !== "razorpay") {
    throw new ApiError(400, "Paid live-session booking currently requires Razorpay mode");
  }

  const order = await createRazorpayOrder({
    amount: Number(liveSession.price || 0),
    currency: liveSession.currency || "INR",
    receipt: `orin_live_${Date.now()}`,
    notes: {
      liveSessionId: String(liveSessionId),
      studentId: req.user.id,
      mentorId: String(liveSession.mentorId)
    }
  });

  const paymentDueAt = createLivePaymentDueAt();
  const booking = await MentorLiveSessionBooking.create({
    liveSessionId,
    mentorId: liveSession.mentorId,
    studentId: req.user.id,
    amount: Number(liveSession.price || 0),
    currency: liveSession.currency || "INR",
    paymentMode: "razorpay",
    paymentStatus: "pending",
    bookingStatus: "pending_payment",
    orderId: order.id,
    paymentDueAt
  });

  await createAuditLog({
    req,
    actorId: req.user.id,
    action: "network.live_session.order.create",
    entityType: "MentorLiveSessionBooking",
    entityId: booking._id,
    metadata: { liveSessionId, orderId: order.id, amount: booking.amount }
  });

  res.status(201).json({
    message: "Live session payment created",
    mode: "razorpay",
    booking,
    order: {
      id: order.id,
      amount: order.amount,
      currency: order.currency
    },
    razorpayKeyId,
    paymentInstructions: {
      amount: booking.amount,
      currency: booking.currency,
      dueAt: paymentDueAt
    }
  });
});

exports.retryLiveSessionPaymentOrder = asyncHandler(async (req, res) => {
  if (req.user.role !== "student") throw new ApiError(403, "Only students can retry live-session payment");

  const { bookingId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(bookingId)) throw new ApiError(400, "Invalid booking id");

  await expireOverdueLiveSessionBookings();

  const booking = await MentorLiveSessionBooking.findOne({ _id: bookingId, studentId: req.user.id });
  if (!booking) throw new ApiError(404, "Booking not found");
  if (booking.paymentMode !== "razorpay") throw new ApiError(400, "Only Razorpay bookings can be retried");
  if (booking.bookingStatus === "booked" && booking.paymentStatus === "paid") {
    throw new ApiError(400, "Booking is already confirmed");
  }
  if (booking.bookingStatus === "cancelled") {
    throw new ApiError(400, "This payment window expired. Please book again.");
  }

  const order = await createRazorpayOrder({
    amount: Number(booking.amount || 0),
    currency: booking.currency || "INR",
    receipt: `orin_live_retry_${Date.now()}`,
    notes: {
      bookingId: String(booking._id),
      liveSessionId: String(booking.liveSessionId),
      studentId: req.user.id
    }
  });

  const paymentDueAt = createLivePaymentDueAt();
  booking.orderId = order.id;
  booking.paymentStatus = "pending";
  booking.bookingStatus = "pending_payment";
  booking.paymentDueAt = paymentDueAt;
  await booking.save();

  res.status(200).json({
    message: "Live session payment refreshed",
    mode: "razorpay",
    booking,
    order: {
      id: order.id,
      amount: order.amount,
      currency: order.currency
    },
    razorpayKeyId,
    paymentInstructions: {
      amount: booking.amount,
      currency: booking.currency,
      dueAt: paymentDueAt
    }
  });
});

exports.verifyLiveSessionPayment = asyncHandler(async (req, res) => {
  const { bookingId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
  if (!mongoose.Types.ObjectId.isValid(bookingId)) throw new ApiError(400, "Invalid booking id");

  const booking = await MentorLiveSessionBooking.findOne({ _id: bookingId, studentId: req.user.id });
  if (!booking) throw new ApiError(404, "Booking not found");
  if (booking.paymentMode !== "razorpay") throw new ApiError(400, "This booking is not in Razorpay mode");
  if (booking.bookingStatus === "booked" && booking.paymentStatus === "paid") {
    return res.status(200).json({ message: "Payment already verified", booking });
  }
  if (booking.orderId !== razorpay_order_id) throw new ApiError(400, "Order id mismatch");

  const valid = verifyRazorpaySignature({
    orderId: razorpay_order_id,
    paymentId: razorpay_payment_id,
    signature: razorpay_signature
  });
  if (!valid) throw new ApiError(400, "Invalid payment signature");

  booking.paymentStatus = "paid";
  booking.paymentId = razorpay_payment_id;
  booking.paymentSignature = razorpay_signature;
  booking.bookingStatus = "booked";
  booking.paymentDueAt = null;
  await booking.save();

  await createAuditLog({
    req,
    actorId: req.user.id,
    action: "network.live_session.payment.verify",
    entityType: "MentorLiveSessionBooking",
    entityId: booking._id,
    metadata: { orderId: razorpay_order_id, paymentId: razorpay_payment_id }
  });

  res.status(200).json({
    message: "Live session payment verified",
    booking
  });
});

exports.cancelLiveSessionBooking = asyncHandler(async (req, res) => {
  const { bookingId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(bookingId)) throw new ApiError(400, "Invalid booking id");

  const booking = await MentorLiveSessionBooking.findOne({ _id: bookingId, studentId: req.user.id });
  if (!booking) throw new ApiError(404, "Booking not found");
  if (booking.bookingStatus === "booked" && booking.paymentStatus === "paid") {
    throw new ApiError(400, "Paid live-session bookings cannot be cancelled here");
  }

  booking.bookingStatus = "cancelled";
  booking.paymentStatus = booking.paymentStatus === "paid" ? "paid" : "cancelled";
  booking.cancelledAt = new Date();
  await booking.save();

  res.status(200).json({ message: "Live session booking cancelled", booking });
});

exports.getMentorLiveSessionPaidBookings = asyncHandler(async (req, res) => {
  if (req.user.role !== "mentor") throw new ApiError(403, "Only mentors can view paid live session bookings");

  const rows = await MentorLiveSessionBooking.find({
    mentorId: req.user.id,
    paymentStatus: "paid"
  })
    .populate("studentId", "name email")
    .populate("liveSessionId", "title startsAt sessionMode price currency posterImageUrl")
    .sort({ createdAt: -1 })
    .limit(300)
    .lean();

  res.status(200).json(rows);
});

exports.getSprints = asyncHandler(async (req, res) => {
  await expireOverdueSprintEnrollments();

  const baseQuery =
    req.user.role === "mentor"
      ? {
          isCancelled: false,
          $or: [
            { approvalStatus: "approved", isPublic: true },
            { mentorId: req.user.id }
          ],
          endDate: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
        }
      : {
          isPublic: true,
          isCancelled: false,
          approvalStatus: "approved",
          endDate: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
        };

  const rows = await MentorSprint.find(baseQuery)
    .populate("mentorId", "name email")
    .sort({ startDate: 1, createdAt: -1 })
    .limit(60)
    .lean();

  const sprintIds = rows.map((item) => item._id);
  const [enrollmentStats, myEnrollments] = await Promise.all([
    MentorSprintEnrollment.aggregate([
      {
        $match: {
          sprintId: { $in: sprintIds },
          enrollmentStatus: { $in: ["pending_payment", "enrolled"] },
          paymentStatus: { $in: ["pending", "paid"] }
        }
      },
      { $group: { _id: "$sprintId", count: { $sum: 1 } } }
    ]),
    req.user.role === "student"
      ? MentorSprintEnrollment.find({
          sprintId: { $in: sprintIds },
          studentId: req.user.id
        })
          .sort({ createdAt: -1 })
          .lean()
      : Promise.resolve([])
  ]);

  const enrollmentCountBySprintId = new Map(
    enrollmentStats.map((item) => [String(item._id), Number(item.count || 0)])
  );
  const myEnrollmentBySprintId = new Map();
  myEnrollments.forEach((enrollment) => {
    const key = String(enrollment.sprintId);
    if (!myEnrollmentBySprintId.has(key)) {
      myEnrollmentBySprintId.set(key, enrollment);
    }
  });

  res.json(
    rows.map((item) =>
      normalizeSprintPayload(
        {
          ...item,
          enrollmentCount: enrollmentCountBySprintId.get(String(item._id)) || 0
        },
        req.user.id,
        myEnrollmentBySprintId
      )
    )
  );
});

exports.getSprintDetail = asyncHandler(async (req, res) => {
  await expireOverdueSprintEnrollments();

  const { sprintId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(sprintId)) throw new ApiError(400, "Invalid sprint id");

  const sprint = await MentorSprint.findById(sprintId)
    .populate("mentorId", "name email")
    .lean();

  if (!sprint) throw new ApiError(404, "Sprint not found");

  const canView =
    req.user.role === "mentor"
      ? String(sprint.mentorId?._id || sprint.mentorId || "") === String(req.user.id) ||
        (sprint.approvalStatus === "approved" && sprint.isPublic && !sprint.isCancelled)
      : sprint.approvalStatus === "approved" && sprint.isPublic && !sprint.isCancelled;

  if (!canView) {
    throw new ApiError(404, "Sprint not available");
  }

  const [activeEnrollmentCount, paidEnrollmentCount, myEnrollment, mentorProfile] = await Promise.all([
    MentorSprintEnrollment.countDocuments({
      sprintId,
      enrollmentStatus: { $in: ["pending_payment", "enrolled"] },
      paymentStatus: { $in: ["pending", "paid"] }
    }),
    MentorSprintEnrollment.countDocuments({
      sprintId,
      enrollmentStatus: "enrolled",
      paymentStatus: "paid"
    }),
    req.user.role === "student"
      ? MentorSprintEnrollment.findOne({ sprintId, studentId: req.user.id })
          .sort({ createdAt: -1 })
          .lean()
      : Promise.resolve(null),
    MentorProfile.findOne({ userId: sprint.mentorId?._id || sprint.mentorId })
      .select("profilePhotoUrl title company about rating verifiedBadge experienceYears")
      .lean()
  ]);

  const payload = normalizeSprintPayload(
    {
      ...sprint,
      enrollmentCount: activeEnrollmentCount
    },
    req.user.id,
    myEnrollment ? new Map([[String(sprint._id), myEnrollment]]) : new Map()
  );

  res.status(200).json({
    sprint: {
      ...payload,
      paidEnrollmentCount,
      minParticipantsMet: activeEnrollmentCount >= Number(sprint.minParticipants || 1),
      hasStarted: sprint.startDate ? new Date(sprint.startDate).getTime() <= Date.now() : false,
      hasEnded: sprint.endDate ? new Date(sprint.endDate).getTime() <= Date.now() : false,
      mentor: {
        ...payload.mentor,
        profilePhotoUrl: mentorProfile?.profilePhotoUrl || "",
        title: mentorProfile?.title || "",
        company: mentorProfile?.company || "",
        about: mentorProfile?.about || "",
        rating: Number(mentorProfile?.rating || 0),
        verifiedBadge: Boolean(mentorProfile?.verifiedBadge),
        experienceYears: Number(mentorProfile?.experienceYears || 0)
      }
    }
  });
});

exports.getMentorSprintPaidEnrollments = asyncHandler(async (req, res) => {
  if (req.user.role !== "mentor") throw new ApiError(403, "Only mentors can view paid sprint enrollments");

  const rows = await MentorSprintEnrollment.find({
    mentorId: req.user.id,
    paymentStatus: "paid"
  })
    .populate("studentId", "name email")
    .populate("sprintId", "title startDate endDate sessionMode price currency posterImageUrl")
    .sort({ createdAt: -1 })
    .limit(300)
    .lean();

  res.status(200).json(rows);
});

exports.createSprint = asyncHandler(async (req, res) => {
  if (req.user.role !== "mentor") throw new ApiError(403, "Only mentors can create sprints");

  const {
    title,
    domain = "",
    description = "",
    posterImageUrl = "",
    curriculumDocumentUrl = "",
    curriculumFileType = "pdf",
    startDate,
    endDate,
    durationWeeks = 1,
    totalLiveSessions = 1,
    sessionSchedule = [],
    weeklyPlan = [],
    outcomes = [],
    tools = [],
    meetingLink = "",
    meetingProvider = "manual",
    sessionMode = "free",
    price = 0,
    currency = "INR",
    minParticipants = 1,
    maxParticipants = 20
  } = req.body;

  if (!String(title || "").trim()) throw new ApiError(400, "title is required");
  if (!String(posterImageUrl || "").trim()) throw new ApiError(400, "Sprint poster is required");

  const normalizedStartDate = new Date(startDate);
  const normalizedEndDate = new Date(endDate);
  if (Number.isNaN(normalizedStartDate.getTime())) throw new ApiError(400, "startDate is invalid");
  if (Number.isNaN(normalizedEndDate.getTime())) throw new ApiError(400, "endDate is invalid");
  if (normalizedEndDate.getTime() < normalizedStartDate.getTime()) {
    throw new ApiError(400, "endDate must be after startDate");
  }

  const normalizedMode = String(sessionMode || "free").trim().toLowerCase();
  const normalizedPrice = Number(price || 0);
  if (!["free", "paid"].includes(normalizedMode)) throw new ApiError(400, "sessionMode must be free or paid");
  if (normalizedMode === "paid" && normalizedPrice <= 0) throw new ApiError(400, "Paid sprints require a valid price");

  const normalizedMinParticipants = Math.min(Math.max(Number(minParticipants || 1), 1), 1000);
  const normalizedMaxParticipants = Math.min(Math.max(Number(maxParticipants || 1), 1), 1000);
  if (normalizedMinParticipants > normalizedMaxParticipants) {
    throw new ApiError(400, "minParticipants cannot exceed maxParticipants");
  }

  const normalizedSchedule = (Array.isArray(sessionSchedule) ? sessionSchedule : [])
    .map((item, index) => {
      const startsAt = item?.startsAt ? new Date(item.startsAt) : null;
      return {
        label: String(item?.label || `Session ${index + 1}`).trim(),
        startsAt: startsAt && !Number.isNaN(startsAt.getTime()) ? startsAt : null,
        durationMinutes: Math.min(Math.max(Number(item?.durationMinutes || 60), 15), 480)
      };
    })
    .slice(0, 50);

  const doc = await MentorSprint.create({
    mentorId: req.user.id,
    title: String(title).trim(),
    domain: String(domain || "").trim(),
    description: String(description || "").trim(),
    posterImageUrl: String(posterImageUrl || "").trim(),
    curriculumDocumentUrl: String(curriculumDocumentUrl || "").trim(),
    curriculumFileType: String(curriculumFileType || "").trim().toLowerCase(),
    startDate: normalizedStartDate,
    endDate: normalizedEndDate,
    durationWeeks: Math.min(Math.max(Number(durationWeeks || 1), 1), 52),
    totalLiveSessions: Math.min(Math.max(Number(totalLiveSessions || 1), 1), 100),
    sessionSchedule: normalizedSchedule,
    weeklyPlan: normalizeList(weeklyPlan),
    outcomes: normalizeList(outcomes),
    tools: normalizeList(tools),
    ...buildManualMeetingPayload(String(meetingLink || "").trim()),
    sessionMode: normalizedMode,
    price: normalizedMode === "paid" ? normalizedPrice : 0,
    currency: String(currency || "INR").trim() || "INR",
    minParticipants: normalizedMinParticipants,
    maxParticipants: normalizedMaxParticipants,
    isPublic: true,
    isCancelled: false,
    approvalStatus: "pending",
    adminReviewNote: "",
    reviewedBy: null,
    reviewedAt: null
  });

  if (String(meetingProvider || "").trim().toLowerCase() === "jitsi") {
    const jitsiMeeting = buildJitsiMeetingPayload({
      scope: "sprint",
      entityId: doc._id,
      createdBy: req.user.id
    });
    doc.meetingProvider = jitsiMeeting.meetingProvider;
    doc.meetingLink = jitsiMeeting.meetingLink;
    doc.meetingMeta = jitsiMeeting.meetingMeta;
    await doc.save();
  }

  await createAuditLog({
    req,
    actorId: req.user.id,
    action: "network.sprint.create",
    entityType: "MentorSprint",
    entityId: doc._id,
    metadata: {
      sessionMode: normalizedMode,
      price: doc.price,
      minParticipants: doc.minParticipants,
      maxParticipants: doc.maxParticipants
    }
  });

  res.status(201).json({
    message: "Sprint submitted for admin approval",
    sprint: normalizeSprintPayload(doc.toObject(), req.user.id)
  });
});

exports.updateSprintMeetingLink = asyncHandler(async (req, res) => {
  const { sprintId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(sprintId)) throw new ApiError(400, "Invalid sprint id");

  const sprint = await MentorSprint.findOne({ _id: sprintId, mentorId: req.user.id });
  if (!sprint) throw new ApiError(404, "Sprint not found");

  const provider = String(req.body?.meetingProvider || "manual").trim().toLowerCase();
  const nextMeeting =
    provider === "jitsi"
      ? buildJitsiMeetingPayload({ scope: "sprint", entityId: sprint._id, createdBy: req.user.id })
      : buildManualMeetingPayload(req.body?.meetingLink);

  sprint.meetingProvider = nextMeeting.meetingProvider;
  sprint.meetingLink = nextMeeting.meetingLink;
  sprint.meetingMeta = nextMeeting.meetingMeta;
  await sprint.save();

  res.status(200).json({
    message: sprint.meetingLink ? "Sprint link updated" : "Sprint link cleared",
    sprint: normalizeSprintPayload(sprint.toObject(), req.user.id)
  });
});

exports.bookSprint = asyncHandler(async (req, res) => {
  if (req.user.role !== "student") throw new ApiError(403, "Only students can join sprints");

  await expireOverdueSprintEnrollments();

  const { sprintId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(sprintId)) throw new ApiError(400, "Invalid sprint id");

  const sprint = await MentorSprint.findById(sprintId).lean();
  if (!sprint || sprint.isCancelled || !sprint.isPublic || sprint.approvalStatus !== "approved") {
    throw new ApiError(404, "Sprint not available");
  }

  if (new Date(sprint.startDate).getTime() <= Date.now()) {
    throw new ApiError(400, "Sprint has already started");
  }

  const activeCount = await MentorSprintEnrollment.countDocuments({
    sprintId,
    enrollmentStatus: { $in: ["pending_payment", "enrolled"] },
    paymentStatus: { $in: ["pending", "paid"] }
  });
  if (activeCount >= Number(sprint.maxParticipants || 20)) {
    throw new ApiError(409, "This sprint is sold out");
  }

  const existing = await MentorSprintEnrollment.findOne({
    sprintId,
    studentId: req.user.id,
    enrollmentStatus: { $in: ["pending_payment", "enrolled"] }
  }).sort({ createdAt: -1 });

  if (existing) {
    if (existing.enrollmentStatus === "enrolled" && existing.paymentStatus === "paid") {
      return res.status(200).json({
        message: "Sprint already joined",
        mode: existing.paymentMode === "free" ? "free" : "razorpay",
        enrollment: existing
      });
    }

    if (existing.paymentMode === "razorpay" && existing.paymentStatus === "pending") {
      return res.status(200).json({
        message: "Sprint payment already pending",
        mode: "razorpay",
        enrollment: existing,
        order: existing.orderId
          ? { id: existing.orderId, amount: existing.amount * 100, currency: existing.currency || "INR" }
          : null,
        razorpayKeyId,
        paymentInstructions: {
          amount: existing.amount,
          currency: existing.currency || "INR",
          dueAt: existing.paymentDueAt || null
        }
      });
    }
  }

  if (sprint.sessionMode !== "paid" || Number(sprint.price || 0) <= 0) {
    const freeEnrollment = await MentorSprintEnrollment.create({
      sprintId,
      mentorId: sprint.mentorId,
      studentId: req.user.id,
      amount: 0,
      currency: sprint.currency || "INR",
      ...buildSprintRevenueSnapshot(0),
      paymentMode: "free",
      paymentStatus: "paid",
      enrollmentStatus: "enrolled"
    });

    return res.status(201).json({
      message: "Sprint joined",
      mode: "free",
      enrollment: freeEnrollment
    });
  }

  if (paymentMode !== "razorpay") {
    throw new ApiError(400, "Paid sprint enrollment currently requires Razorpay mode");
  }

  const order = await createRazorpayOrder({
    amount: Number(sprint.price || 0),
    currency: sprint.currency || "INR",
    receipt: `orin_sprint_${Date.now()}`,
    notes: {
      sprintId: String(sprintId),
      studentId: req.user.id,
      mentorId: String(sprint.mentorId)
    }
  });

  const paymentDueAt = createSprintPaymentDueAt();
  const enrollment = await MentorSprintEnrollment.create({
    sprintId,
    mentorId: sprint.mentorId,
    studentId: req.user.id,
    amount: Number(sprint.price || 0),
    currency: sprint.currency || "INR",
    ...buildSprintRevenueSnapshot(Number(sprint.price || 0)),
    paymentMode: "razorpay",
    paymentStatus: "pending",
    enrollmentStatus: "pending_payment",
    orderId: order.id,
    paymentDueAt
  });

  await createAuditLog({
    req,
    actorId: req.user.id,
    action: "network.sprint.order.create",
    entityType: "MentorSprintEnrollment",
    entityId: enrollment._id,
    metadata: { sprintId, orderId: order.id, amount: enrollment.amount }
  });

  res.status(201).json({
    message: "Sprint payment created",
    mode: "razorpay",
    enrollment,
    order: {
      id: order.id,
      amount: order.amount,
      currency: order.currency
    },
    razorpayKeyId,
    paymentInstructions: {
      amount: enrollment.amount,
      currency: enrollment.currency,
      dueAt: paymentDueAt
    }
  });
});

exports.retrySprintPaymentOrder = asyncHandler(async (req, res) => {
  if (req.user.role !== "student") throw new ApiError(403, "Only students can retry sprint payment");

  const { enrollmentId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(enrollmentId)) throw new ApiError(400, "Invalid enrollment id");

  await expireOverdueSprintEnrollments();

  const enrollment = await MentorSprintEnrollment.findOne({ _id: enrollmentId, studentId: req.user.id });
  if (!enrollment) throw new ApiError(404, "Enrollment not found");
  if (enrollment.paymentMode !== "razorpay") throw new ApiError(400, "Only Razorpay enrollments can be retried");
  if (enrollment.enrollmentStatus === "enrolled" && enrollment.paymentStatus === "paid") {
    throw new ApiError(400, "Enrollment is already confirmed");
  }
  if (enrollment.enrollmentStatus === "cancelled") {
    throw new ApiError(400, "This payment window expired. Please join again.");
  }

  const order = await createRazorpayOrder({
    amount: Number(enrollment.amount || 0),
    currency: enrollment.currency || "INR",
    receipt: `orin_sprint_retry_${Date.now()}`,
    notes: {
      enrollmentId: String(enrollment._id),
      sprintId: String(enrollment.sprintId),
      studentId: req.user.id
    }
  });

  const paymentDueAt = createSprintPaymentDueAt();
  enrollment.orderId = order.id;
  enrollment.paymentStatus = "pending";
  enrollment.enrollmentStatus = "pending_payment";
  enrollment.paymentDueAt = paymentDueAt;
  await enrollment.save();

  res.status(200).json({
    message: "Sprint payment refreshed",
    mode: "razorpay",
    enrollment,
    order: {
      id: order.id,
      amount: order.amount,
      currency: order.currency
    },
    razorpayKeyId,
    paymentInstructions: {
      amount: enrollment.amount,
      currency: enrollment.currency,
      dueAt: paymentDueAt
    }
  });
});

exports.verifySprintPayment = asyncHandler(async (req, res) => {
  const { enrollmentId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
  if (!mongoose.Types.ObjectId.isValid(enrollmentId)) throw new ApiError(400, "Invalid enrollment id");

  const enrollment = await MentorSprintEnrollment.findOne({ _id: enrollmentId, studentId: req.user.id });
  if (!enrollment) throw new ApiError(404, "Enrollment not found");
  if (enrollment.paymentMode !== "razorpay") throw new ApiError(400, "This enrollment is not in Razorpay mode");
  if (enrollment.enrollmentStatus === "enrolled" && enrollment.paymentStatus === "paid") {
    return res.status(200).json({ message: "Payment already verified", enrollment });
  }
  if (enrollment.orderId !== razorpay_order_id) throw new ApiError(400, "Order id mismatch");

  const valid = verifyRazorpaySignature({
    orderId: razorpay_order_id,
    paymentId: razorpay_payment_id,
    signature: razorpay_signature
  });
  if (!valid) throw new ApiError(400, "Invalid payment signature");

  enrollment.paymentStatus = "paid";
  enrollment.paymentId = razorpay_payment_id;
  enrollment.paymentSignature = razorpay_signature;
  enrollment.enrollmentStatus = "enrolled";
  enrollment.paymentDueAt = null;
  await enrollment.save();

  await createAuditLog({
    req,
    actorId: req.user.id,
    action: "network.sprint.payment.verify",
    entityType: "MentorSprintEnrollment",
    entityId: enrollment._id,
    metadata: { orderId: razorpay_order_id, paymentId: razorpay_payment_id }
  });

  res.status(200).json({
    message: "Sprint payment verified",
    enrollment
  });
});

exports.cancelSprintEnrollment = asyncHandler(async (req, res) => {
  const { enrollmentId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(enrollmentId)) throw new ApiError(400, "Invalid enrollment id");

  const enrollment = await MentorSprintEnrollment.findOne({ _id: enrollmentId, studentId: req.user.id });
  if (!enrollment) throw new ApiError(404, "Enrollment not found");
  if (enrollment.enrollmentStatus === "enrolled" && enrollment.paymentStatus === "paid") {
    throw new ApiError(400, "Paid sprint enrollments cannot be cancelled here");
  }

  enrollment.enrollmentStatus = "cancelled";
  enrollment.paymentStatus = enrollment.paymentStatus === "paid" ? "paid" : "cancelled";
  enrollment.cancelledAt = new Date();
  await enrollment.save();

  res.status(200).json({ message: "Sprint enrollment cancelled", enrollment });
});

exports.getMentorSprintPayouts = asyncHandler(async (req, res) => {
  await expireOverdueSprintEnrollments();

  const enrollments = await MentorSprintEnrollment.find({
    mentorId: req.user.id,
    paymentStatus: "paid"
  })
    .populate("studentId", "name email")
    .populate("payoutPaidBy", "name email role")
    .populate("sprintId", "title startDate endDate sessionMode price currency posterImageUrl")
    .sort({ updatedAt: -1, createdAt: -1 })
    .lean();

  const mentorProfile = await MentorProfile.findOne({ userId: req.user.id })
    .select("payoutUpiId payoutQrCodeUrl payoutPhoneNumber phoneNumber")
    .lean();

  const mentorPaymentDetails = {
    upiId: mentorProfile?.payoutUpiId || "",
    qrCodeUrl: mentorProfile?.payoutQrCodeUrl || "",
    phoneNumber: mentorProfile?.payoutPhoneNumber || mentorProfile?.phoneNumber || ""
  };

  const enriched = enrollments.map((enrollment) =>
    enrichSprintEnrollmentForPayout(enrollment, enrollment.sprintId, mentorPaymentDetails)
  );

  const summary = enriched.reduce(
    (acc, enrollment) => {
      acc.totalEnrollments += 1;
      acc.lifetimeGross += Number(enrollment.amount || 0);
      acc.platformFees += Number(enrollment.platformFeeAmount || 0);
      acc.mentorEarnings += Number(enrollment.mentorPayoutAmount || 0);

      if (enrollment.payoutStatus === "pending") acc.pendingPayoutAmount += Number(enrollment.mentorPayoutAmount || 0);
      if (enrollment.payoutStatus === "paid") acc.paidOutAmount += Number(enrollment.mentorPayoutAmount || 0);
      if (enrollment.mentorPayoutConfirmationStatus === "confirmed") {
        acc.confirmedReceivedAmount += Number(enrollment.mentorPayoutAmount || 0);
      }
      if (enrollment.payoutStatus === "issue_reported" || enrollment.mentorPayoutConfirmationStatus === "issue_reported") {
        acc.issueAmount += Number(enrollment.mentorPayoutAmount || 0);
      }
      return acc;
    },
    {
      totalEnrollments: 0,
      lifetimeGross: 0,
      platformFees: 0,
      mentorEarnings: 0,
      pendingPayoutAmount: 0,
      paidOutAmount: 0,
      confirmedReceivedAmount: 0,
      issueAmount: 0,
      payoutSetupComplete: Boolean(mentorPaymentDetails.upiId || mentorPaymentDetails.qrCodeUrl || mentorPaymentDetails.phoneNumber)
    }
  );

  Object.keys(summary).forEach((key) => {
    if (key !== "totalEnrollments" && key !== "payoutSetupComplete") {
      summary[key] = roundCurrency(summary[key]);
    }
  });

  res.status(200).json({
    summary,
    payoutSetup: mentorPaymentDetails,
    enrollments: enriched
  });
});

exports.confirmSprintPayoutReceived = asyncHandler(async (req, res) => {
  const { enrollmentId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(enrollmentId)) throw new ApiError(400, "Invalid enrollment id");

  const enrollment = await MentorSprintEnrollment.findOne({ _id: enrollmentId, mentorId: req.user.id })
    .populate("sprintId", "title startDate endDate")
    .lean();
  if (!enrollment) throw new ApiError(404, "Sprint enrollment not found");

  const payoutStatus = getResolvedSprintPayoutStatus(enrollment, enrollment.sprintId);
  if (payoutStatus !== "paid") throw new ApiError(400, "Payout is not marked as paid yet");

  const updated = await MentorSprintEnrollment.findByIdAndUpdate(
    enrollmentId,
    {
      $set: {
        mentorPayoutConfirmationStatus: "confirmed",
        mentorPayoutConfirmedAt: new Date(),
        mentorPayoutIssueNote: ""
      }
    },
    { new: true }
  )
    .populate("studentId", "name email")
    .populate("payoutPaidBy", "name email role")
    .populate("sprintId", "title startDate endDate sessionMode price currency posterImageUrl")
    .lean();

  await Notification.create({
    title: "Sprint Payout Confirmed",
    message: "A mentor confirmed payout receipt for a paid sprint enrollment.",
    type: "booking",
    sentBy: req.user.id,
    targetRole: "admin"
  });

  await createAuditLog({
    req,
    actorId: req.user.id,
    action: "network.sprint.payout.confirm_received",
    entityType: "MentorSprintEnrollment",
    entityId: enrollmentId
  });

  res.status(200).json({
    message: "Sprint payout marked as received",
    enrollment: enrichSprintEnrollmentForPayout(updated, updated.sprintId)
  });
});

exports.reportSprintPayoutIssue = asyncHandler(async (req, res) => {
  const { enrollmentId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(enrollmentId)) throw new ApiError(400, "Invalid enrollment id");

  const enrollment = await MentorSprintEnrollment.findOne({ _id: enrollmentId, mentorId: req.user.id })
    .populate("sprintId", "title startDate endDate")
    .lean();
  if (!enrollment) throw new ApiError(404, "Sprint enrollment not found");

  const payoutStatus = getResolvedSprintPayoutStatus(enrollment, enrollment.sprintId);
  if (payoutStatus !== "paid") throw new ApiError(400, "Only paid-out sprint enrollments can be reported here");

  const note = String(req.body?.issueNote || "").trim();
  if (!note) throw new ApiError(400, "Issue note is required");

  const updated = await MentorSprintEnrollment.findByIdAndUpdate(
    enrollmentId,
    {
      $set: {
        payoutStatus: "issue_reported",
        mentorPayoutConfirmationStatus: "issue_reported",
        mentorPayoutIssueNote: note
      }
    },
    { new: true }
  )
    .populate("studentId", "name email")
    .populate("payoutPaidBy", "name email role")
    .populate("sprintId", "title startDate endDate sessionMode price currency posterImageUrl")
    .lean();

  await Notification.create({
    title: "Sprint Payout Issue",
    message: `A mentor reported a payout issue for sprint ${(updated?.sprintId?.title || "program")}.`,
    type: "booking",
    sentBy: req.user.id,
    targetRole: "admin"
  });

  await createAuditLog({
    req,
    actorId: req.user.id,
    action: "network.sprint.payout.report_issue",
    entityType: "MentorSprintEnrollment",
    entityId: enrollmentId,
    metadata: { issueNote: note }
  });

  res.status(200).json({
    message: "Sprint payout issue reported",
    enrollment: enrichSprintEnrollmentForPayout(updated, updated.sprintId)
  });
});

function resumeSafeArray(value) {
  return Array.isArray(value) ? value : [];
}

function resumeFileName(name, extension) {
  const safeBase = String(name || "orin_resume")
    .trim()
    .replace(/[^\w.\-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `${safeBase || "orin_resume"}.${extension}`;
}

function buildProfileSummary(payload) {
  if (payload.summary) return payload.summary;

  const topSkills = resumeSafeArray(payload.skills).slice(0, 4);
  const roleLine = payload.roleLabel || "Career Builder";

  if (payload.userRole === "mentor") {
    const expertise = topSkills.length ? `Expertise in ${topSkills.join(", ")}.` : "Focused on mentoring, practical guidance, and domain support.";
    const mentoringLine = payload.totalStudentsMentored
      ? `Supported ${payload.totalStudentsMentored}+ learners through ORIN sessions.`
      : "Helps students with roadmap clarity, sessions, and structured growth.";
    return `${roleLine}. ${expertise} ${mentoringLine}`.trim();
  }

  const skillsLine = topSkills.length ? `Skilled in ${topSkills.join(", ")}.` : "Building strong practical and domain-specific skills.";
  const goalLine = payload.careerGoal ? `Targeting ${payload.careerGoal}.` : "Focused on career growth and mentorship.";
  return `${roleLine}. ${skillsLine} ${goalLine}`.trim();
}

function truncateResumeText(value = "", maxLength = 220) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trim()}…`;
}

function compactResumeItems(items = [], maxItems = 3) {
  return resumeSafeArray(items)
    .filter(Boolean)
    .sort((a, b) => {
      const aScore = Number(Boolean(a?.description || a?.summary)) + Number(Boolean(a?.tech?.length || a?.techStack?.length));
      const bScore = Number(Boolean(b?.description || b?.summary)) + Number(Boolean(b?.tech?.length || b?.techStack?.length));
      return bScore - aScore;
    })
    .slice(0, maxItems);
}

function normalizeResumeOverrides(input = {}) {
  return {
    targetRole: String(input?.targetRole || "").trim(),
    summary: String(input?.summary || "").trim(),
    phone: String(input?.phone || "").trim(),
    linkedInUrl: String(input?.linkedInUrl || "").trim(),
    location: String(input?.location || "").trim(),
    careerGoal: String(input?.careerGoal || "").trim(),
    strengths: String(input?.strengths || "").trim(),
    projectDescription: String(input?.projectDescription || "").trim(),
    experienceDescription: String(input?.experienceDescription || "").trim(),
    educationDetail: String(input?.educationDetail || "").trim()
  };
}

function collectResumeMissingFields(payload = {}) {
  const missing = [];
  const pushMissing = (id, label, prompt, recommendedValue = "") => {
    missing.push({ id, label, prompt, recommendedValue });
  };

  if (!payload.roleLabel) {
    pushMissing("targetRole", "Target Role", "Add the role you are applying for so the resume reads like a real job document.");
  }
  if (!payload.phone) {
    pushMissing("phone", "Phone Number", "Recruiters expect a direct phone number in the resume header.");
  }
  if (!payload.location) {
    pushMissing("location", "Location", "Add your city and state so the resume feels placement-ready.");
  }
  if (!payload.summary || payload.summary.length < 80) {
    pushMissing("summary", "Professional Summary", "Write a 2-3 line summary with strengths, goals, and real impact.");
  }
  if (!resumeSafeArray(payload.skills).length) {
    pushMissing("skills", "Skills", "Add at least 5 strong skills in Edit Profile for an interview-ready resume.");
  }
  if (!resumeSafeArray(payload.projects).length) {
    pushMissing("projects", "Projects", "Add at least one strong project with tools used and what you built.");
  } else if (resumeSafeArray(payload.projects).some((item) => !item?.description)) {
    pushMissing("projectDescription", "Project Details", "Explain what your strongest project solves and what your contribution was.");
  }
  if (!resumeSafeArray(payload.education).length) {
    pushMissing("education", "Education", "Add your degree, college, and passing year.");
  }
  if (resumeSafeArray(payload.experience).length && resumeSafeArray(payload.experience).some((item) => !item?.description)) {
    pushMissing("experienceDescription", "Experience Highlights", "Add impact-focused experience details instead of just role names.");
  }
  if (!payload.careerGoal) {
    pushMissing("careerGoal", "Career Focus", "Tell ORIN what role or domain you want this resume to target.");
  }

  return missing;
}

function buildResumeReadiness(payload = {}) {
  let score = 0;
  if (payload.roleLabel) score += 12;
  if (payload.phone) score += 10;
  if (payload.location) score += 8;
  if (payload.summary && payload.summary.length >= 80) score += 18;
  if (resumeSafeArray(payload.skills).length >= 5) score += 15;
  if (resumeSafeArray(payload.projects).length >= 1) score += 15;
  if (resumeSafeArray(payload.education).length >= 1) score += 10;
  if (payload.careerGoal) score += 7;
  if (resumeSafeArray(payload.experience).length >= 1) score += 5;
  return Math.max(0, Math.min(100, score));
}

async function buildResumePayloadForUser(userId, overrides = {}) {
  const user = await User.findById(userId).select("name email phoneNumber role").lean();
  if (!user) throw new ApiError(404, "User not found");
  const normalizedOverrides = normalizeResumeOverrides(overrides);

  if (user.role === "mentor") {
    const profile = await MentorProfile.findOne({ userId }).lean();
    const experience = [];

    if (profile?.company || profile?.title) {
      experience.push({
        organization: profile?.company || "Independent Mentor",
        role: profile?.title || "Mentor",
        start: profile?.experienceYears ? `${profile.experienceYears}+ years` : "",
        end: "Present",
        description: profile?.about || ""
      });
    }

    const payload = {
      name: user.name || "",
      role: normalizedOverrides.targetRole || profile?.title || "Mentor",
      roleLabel: normalizedOverrides.targetRole || profile?.title || "Mentor",
      userRole: "mentor",
      email: user.email || "",
      phone: normalizedOverrides.phone || profile?.phoneNumber || user.phoneNumber || "",
      profileImage: profile?.profilePhotoUrl || "",
      summary: normalizedOverrides.summary || profile?.about || "",
      domains: [
        profile?.primaryCategory,
        profile?.subCategory,
        ...resumeSafeArray(profile?.expertiseDomains),
        ...resumeSafeArray(profile?.specializations)
      ].filter(Boolean),
      skills: normalizeList([...resumeSafeArray(profile?.expertiseDomains), ...resumeSafeArray(profile?.specializations)]).filter(Boolean).slice(0, 8),
      projects: [],
      achievements: resumeSafeArray(profile?.achievements).map((item) => ({
        title: item?.title || String(item || "").trim(),
        issuer: item?.issuer || "ORIN Mentor Profile",
        date: item?.date || "",
        url: item?.url || ""
      })),
      projects: resumeSafeArray(profile?.projects).map((item) => ({
        title: item?.title || item?.name || "",
        tech: resumeSafeArray(item?.tech || item?.techStack).filter(Boolean),
        link: item?.link || "",
        description: item?.description || item?.summary || normalizedOverrides.projectDescription || ""
      })),
      experience: [
        ...resumeSafeArray(profile?.experiences).map((item) => ({
          organization: item?.organization || "",
          role: item?.role || "",
          start: item?.start || item?.startDate || "",
          end: item?.end || item?.endDate || "",
          description: item?.description || normalizedOverrides.experienceDescription || ""
        })),
        ...experience
      ].filter((item) => item.organization || item.role || item.start || item.end || item.description),
      education: resumeSafeArray(profile?.education).map((item) => ({
        school: item?.school || "",
        degree: item?.degree || "",
        year: item?.year || ""
      })),
      careerGoal: normalizedOverrides.careerGoal || "Mentor students with structured career guidance",
      linkedInUrl: normalizedOverrides.linkedInUrl || profile?.linkedInUrl || "",
      location: normalizedOverrides.location || profile?.state || "",
      strengths: normalizedOverrides.strengths || "",
      sessionPrice: profile?.sessionPrice || 0,
      rating: profile?.rating || 0,
      totalStudentsMentored: profile?.totalSessionsConducted || 0,
      resumeUrl: profile?.resumeUrl || ""
    };

    payload.summary = buildProfileSummary(payload);
    payload.summary = truncateResumeText(payload.summary, 260);
    payload.projects = compactResumeItems(payload.projects, 2).map((item) => ({
      ...item,
      description: truncateResumeText(item.description || "", 150)
    }));
    payload.experience = compactResumeItems(payload.experience, 2).map((item) => ({
      ...item,
      description: truncateResumeText(item.description || "", 150)
    }));
    payload.achievements = compactResumeItems(payload.achievements, 3);
    payload.education = compactResumeItems(payload.education, 1);
    return payload;
  }

  const profile = await StudentProfile.findOne({ userId }).lean();
  const payload = {
    name: user.name || "",
    role: normalizedOverrides.targetRole || profile?.headline || "Student",
    roleLabel: normalizedOverrides.targetRole || profile?.headline || "Student",
    userRole: "student",
    email: user.email || "",
    phone: normalizedOverrides.phone || user.phoneNumber || "",
    profileImage: profile?.profilePhotoUrl || "",
    summary: normalizedOverrides.summary || profile?.about || "",
    domains: [profile?.collegeName].filter(Boolean),
    skills: normalizeList(resumeSafeArray(profile?.skills)).filter(Boolean).slice(0, 8),
    projects: resumeSafeArray(profile?.projects).map((item) => ({
      title: item?.title || item?.name || "",
      tech: resumeSafeArray(item?.tech || item?.techStack).filter(Boolean),
      link: item?.link || "",
      description: item?.description || item?.summary || normalizedOverrides.projectDescription || ""
    })),
    achievements: resumeSafeArray(profile?.achievements).map((item) => ({
      title: item?.title || item?.type || "Achievement",
      issuer: item?.issuer || "",
      date: item?.date || "",
      url: item?.url || ""
    })),
    experience: resumeSafeArray(profile?.experiences).map((item) => ({
      organization: item?.organization || "",
      role: item?.role || "",
      start: item?.start || item?.startDate || "",
      end: item?.end || item?.endDate || "",
      description: item?.description || normalizedOverrides.experienceDescription || ""
    })),
    education: resumeSafeArray(profile?.education).map((item) => ({
      school: item?.school || "",
      degree: item?.degree || normalizedOverrides.educationDetail || "",
      year: item?.year || ""
    })),
    careerGoal: normalizedOverrides.careerGoal || profile?.careerGoals || "",
    linkedInUrl: normalizedOverrides.linkedInUrl || "",
    location: normalizedOverrides.location || profile?.state || "",
    strengths: normalizedOverrides.strengths || "",
    sessionPrice: 0,
    rating: 0,
    totalStudentsMentored: 0,
    resumeUrl: profile?.resumeUrl || ""
  };

  payload.summary = buildProfileSummary(payload);
  payload.summary = truncateResumeText(payload.summary, 260);
  payload.projects = compactResumeItems(payload.projects, 3).map((item) => ({
    ...item,
    description: truncateResumeText(item.description || "", 150)
  }));
  payload.experience = compactResumeItems(payload.experience, 2).map((item) => ({
    ...item,
    description: truncateResumeText(item.description || "", 150)
  }));
  payload.achievements = compactResumeItems(payload.achievements, 3);
  payload.education = compactResumeItems(payload.education, 1);
  return payload;
}

function buildResumeMarkdown(payload) {
  return [
    `# ${payload.name}`,
    payload.roleLabel ? `**${payload.roleLabel}**` : "",
    payload.summary || "",
    "",
    "## Contact",
    `- Email: ${payload.email || "Not provided"}`,
    payload.phone ? `- Phone: ${payload.phone}` : "",
    payload.location ? `- Location: ${payload.location}` : "",
    payload.linkedInUrl ? `- LinkedIn: ${payload.linkedInUrl}` : "",
    "",
    "## Skills",
    ...(payload.skills.length ? payload.skills.map((item) => `- ${item}`) : ["- Add your skills in profile"]),
    "",
    "## Projects",
    ...(payload.projects.length
      ? payload.projects.flatMap((project) => [
          `- **${project.title || "Project"}**`,
          project.description ? `  - ${project.description}` : "",
          project.tech?.length ? `  - Tech: ${project.tech.join(", ")}` : "",
          project.link ? `  - Link: ${project.link}` : ""
        ])
      : ["- Add projects in profile"]),
    "",
    "## Achievements",
    ...(payload.achievements.length
      ? payload.achievements.map((item) => `- ${item.title}${item.issuer ? ` - ${item.issuer}` : ""}${item.date ? ` (${item.date})` : ""}`)
      : ["- Add achievements in profile"]),
    "",
    "## Experience",
    ...(payload.experience.length
      ? payload.experience.map((item) => `- ${item.role || "Role"} at ${item.organization || "Organization"}${item.start || item.end ? ` (${item.start || ""}${item.end ? ` - ${item.end}` : ""})` : ""}`)
      : ["- Add experiences in profile"]),
    "",
    "## Education",
    ...(payload.education.length
      ? payload.education.map((item) => `- ${[item.degree, item.school, item.year].filter(Boolean).join(" | ")}`)
      : []),
    "",
    "## Career Goal",
    payload.careerGoal || "Career growth and mentorship",
    ...(payload.strengths ? ["", "## Strengths", payload.strengths] : [])
  ]
    .filter(Boolean)
    .join("\n");
}

function renderResumeList(items = []) {
  return items.length
    ? `<ul>${items.map((item) => `<li>${item}</li>`).join("")}</ul>`
    : `<p class="empty">Add details in your ORIN profile to strengthen this section.</p>`;
}

function renderResumeSectionsHtml(payload) {
  const projectsHtml = payload.projects.length
    ? payload.projects
        .map(
          (project) => `
            <article class="item-card">
              <div class="item-title">${project.title || "Project"}</div>
              ${project.tech?.length ? `<div class="item-meta">${project.tech.join(" | ")}</div>` : ""}
              ${project.description ? `<p>${project.description}</p>` : ""}
              ${project.link ? `<a href="${project.link}" target="_blank">${project.link}</a>` : ""}
            </article>
          `
        )
        .join("")
    : `<p class="empty">Projects will appear here when added to your profile.</p>`;

  const achievementsHtml = payload.achievements.length
    ? payload.achievements
        .map(
          (item) => `
            <article class="item-card">
              <div class="item-title">${item.title}</div>
              <div class="item-meta">${[item.issuer, item.date].filter(Boolean).join(" | ")}</div>
            </article>
          `
        )
        .join("")
    : `<p class="empty">Achievements will appear here when added to your profile.</p>`;

  const experienceHtml = payload.experience.length
    ? payload.experience
        .map(
          (item) => `
            <article class="item-card">
              <div class="item-title">${item.role || "Role"}${item.organization ? ` - ${item.organization}` : ""}</div>
              <div class="item-meta">${[item.start, item.end].filter(Boolean).join(" - ")}</div>
              ${item.description ? `<p>${item.description}</p>` : ""}
            </article>
          `
        )
        .join("")
    : `<p class="empty">Experience details will appear here when added to your profile.</p>`;

  const educationHtml = payload.education.length
    ? payload.education
        .map(
          (item) => `
            <article class="item-card">
              <div class="item-title">${item.degree || "Education"}</div>
              <div class="item-meta">${[item.school, item.year].filter(Boolean).join(" | ")}</div>
            </article>
          `
        )
        .join("")
    : "";

  return `
    <section class="section">
      <h2>Professional Summary</h2>
      <p>${payload.summary || "A profile summary will appear here."}</p>
    </section>
    ${payload.strengths ? `<section class="section"><h2>Strengths</h2><p>${payload.strengths}</p></section>` : ""}
    <section class="section">
      <h2>Skills</h2>
      ${renderResumeList(payload.skills)}
    </section>
    <section class="section">
      <h2>Projects</h2>
      ${projectsHtml}
    </section>
    <section class="section">
      <h2>Achievements</h2>
      ${achievementsHtml}
    </section>
    <section class="section">
      <h2>Experience</h2>
      ${experienceHtml}
    </section>
    ${educationHtml ? `<section class="section"><h2>Education</h2>${educationHtml}</section>` : ""}
    <section class="section">
      <h2>Career Focus</h2>
      <p>${payload.careerGoal || "Career growth and mentorship"}</p>
    </section>
  `;
}

function projectsHtmlFromPayload(payload) {
  return payload.projects.length
    ? payload.projects
        .map(
          (project) => `
            <article class="item-card">
              <div class="item-title">${project.title || "Project"}</div>
              ${project.tech?.length ? `<div class="item-meta">${project.tech.join(" | ")}</div>` : ""}
              ${project.description ? `<p>${project.description}</p>` : ""}
              ${project.link ? `<a href="${project.link}" target="_blank">${project.link}</a>` : ""}
            </article>
          `
        )
        .join("")
    : `<p class="empty">Projects will appear here when added to your profile.</p>`;
}

function achievementsHtmlFromPayload(payload) {
  return payload.achievements.length
    ? payload.achievements
        .map(
          (item) => `
            <article class="item-card">
              <div class="item-title">${item.title}</div>
              <div class="item-meta">${[item.issuer, item.date].filter(Boolean).join(" | ")}</div>
            </article>
          `
        )
        .join("")
    : `<p class="empty">Achievements will appear here when added to your profile.</p>`;
}

function experienceHtmlFromPayload(payload) {
  return payload.experience.length
    ? payload.experience
        .map(
          (item) => `
            <article class="item-card">
              <div class="item-title">${item.role || "Role"}${item.organization ? ` - ${item.organization}` : ""}</div>
              <div class="item-meta">${[item.start, item.end].filter(Boolean).join(" - ")}</div>
              ${item.description ? `<p>${item.description}</p>` : ""}
            </article>
          `
        )
        .join("")
    : `<p class="empty">Experience details will appear here when added to your profile.</p>`;
}

function buildResumeHtml(payload, template = "modern") {
  const safeTemplate = ["modern", "corporate", "creative"].includes(String(template)) ? String(template) : "modern";
  const photo = payload.profileImage
    ? `<img src="${payload.profileImage}" class="profile-img" alt="${payload.name}" />`
    : `<div class="profile-fallback">${String(payload.name || "O").slice(0, 1).toUpperCase()}</div>`;

  const commonStyles = `
    * { box-sizing: border-box; }
    body { margin: 0; font-family: 'Segoe UI', Arial, sans-serif; color: #12221a; background: #f5f7fb; }
    a { color: #1f7a4c; text-decoration: none; word-break: break-word; }
    .item-card { padding: 12px 14px; border: 1px solid #d8e3dc; border-radius: 14px; margin-bottom: 10px; background: rgba(255,255,255,0.9); }
    .item-title { font-weight: 700; margin-bottom: 4px; }
    .item-meta { color: #5f6c64; font-size: 12px; margin-bottom: 6px; }
    .empty { color: #667085; }
    ul { margin: 0; padding-left: 18px; }
    li { margin-bottom: 6px; }
    h1, h2, p { margin-top: 0; }
  `;

  if (safeTemplate === "corporate") {
    return `<!doctype html><html><head><meta charset="utf-8" /><style>${commonStyles}
      body { background: #ffffff; color: #101828; padding: 28px; }
      .header { display: flex; gap: 18px; align-items: center; border-bottom: 2px solid #101828; padding-bottom: 18px; }
      .profile-img, .profile-fallback { width: 84px; height: 84px; border-radius: 14px; object-fit: cover; background: #dfe7e2; display: flex; align-items: center; justify-content: center; font-size: 30px; font-weight: 800; }
      .role { color: #344054; font-weight: 700; margin: 4px 0 8px; }
      .contact { color: #475467; font-size: 13px; }
      .grid { display: grid; grid-template-columns: 1.5fr 1fr; gap: 18px; margin-top: 18px; }
      .section { margin-top: 0; }
      h2 { font-size: 16px; border-bottom: 1px solid #d0d5dd; padding-bottom: 6px; margin-bottom: 10px; }
    </style></head><body>
      <header class="header">${photo}<div><h1>${payload.name}</h1><div class="role">${payload.roleLabel}</div><div class="contact">${[payload.email, payload.phone, payload.location, payload.linkedInUrl].filter(Boolean).join(" | ")}</div></div></header>
      <div class="grid">
        <div>
          <section class="section"><h2>Professional Summary</h2><p>${payload.summary || "A profile summary will appear here."}</p></section>
          <section class="section"><h2>Experience</h2>${payload.experience.length ? payload.experience.map((item) => `<article class="item-card"><div class="item-title">${item.role || "Role"}${item.organization ? ` - ${item.organization}` : ""}</div><div class="item-meta">${[item.start, item.end].filter(Boolean).join(" - ")}</div>${item.description ? `<p>${item.description}</p>` : ""}</article>`).join("") : `<p class="empty">Experience details will appear here when added to your profile.</p>`}</section>
          <section class="section"><h2>Projects</h2>${payload.projects.length ? payload.projects.map((project) => `<article class="item-card"><div class="item-title">${project.title || "Project"}</div>${project.tech?.length ? `<div class="item-meta">${project.tech.join(" | ")}</div>` : ""}${project.description ? `<p>${project.description}</p>` : ""}${project.link ? `<a href="${project.link}" target="_blank">${project.link}</a>` : ""}</article>`).join("") : `<p class="empty">Projects will appear here when added to your profile.</p>`}</section>
        </div>
        <div>
          <section class="section"><h2>Skills</h2>${renderResumeList(payload.skills)}</section>
          ${payload.education?.length ? `<section class="section"><h2>Education</h2>${payload.education.map((item) => `<article class="item-card"><div class="item-title">${item.degree || "Education"}</div><div class="item-meta">${[item.school, item.year].filter(Boolean).join(" | ")}</div></article>`).join("")}</section>` : ""}
          <section class="section"><h2>Achievements</h2>${payload.achievements.length ? payload.achievements.map((item) => `<article class="item-card"><div class="item-title">${item.title}</div><div class="item-meta">${[item.issuer, item.date].filter(Boolean).join(" | ")}</div></article>`).join("") : `<p class="empty">Achievements will appear here when added to your profile.</p>`}</section>
          <section class="section"><h2>Career Focus</h2><p>${payload.careerGoal || "Career growth and mentorship"}</p></section>
        </div>
      </div>
    </body></html>`;
  }

  if (safeTemplate === "creative") {
    return `<!doctype html><html><head><meta charset="utf-8" /><style>${commonStyles}
      body { display: flex; background: #eef3ef; }
      .left { width: 32%; background: linear-gradient(180deg, #174f37 0%, #2c8a5a 100%); color: #fff; min-height: 100vh; padding: 28px 22px; }
      .right { width: 68%; padding: 28px 26px; }
      .profile-img, .profile-fallback { width: 110px; height: 110px; border-radius: 26px; object-fit: cover; background: rgba(255,255,255,0.18); display: flex; align-items: center; justify-content: center; font-size: 40px; font-weight: 800; margin-bottom: 18px; }
      .chip { display: inline-block; padding: 6px 10px; border-radius: 999px; margin: 0 8px 8px 0; background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.18); }
      .side-title { text-transform: uppercase; letter-spacing: 0.08em; font-size: 12px; margin-top: 24px; margin-bottom: 10px; opacity: 0.85; }
      .section { background: rgba(255,255,255,0.82); border-radius: 18px; padding: 16px; margin-bottom: 14px; }
      h2 { color: #174f37; margin-bottom: 10px; }
    </style></head><body>
      <aside class="left">${photo}<h1>${payload.name}</h1><p>${payload.roleLabel}</p><p>${payload.email}</p>${payload.phone ? `<p>${payload.phone}</p>` : ""}
        <div class="side-title">Skills</div>${payload.skills.length ? payload.skills.map((skill) => `<span class="chip">${skill}</span>`).join("") : "<p>Add skills in your profile.</p>"}
        <div class="side-title">Domains</div>${payload.domains.length ? payload.domains.map((domain) => `<span class="chip">${domain}</span>`).join("") : "<p>Domains will appear here.</p>"}
      </aside>
      <main class="right">${renderResumeSectionsHtml(payload)}</main>
    </body></html>`;
  }

  return `<!doctype html><html><head><meta charset="utf-8" /><style>${commonStyles}
    body { padding: 28px; background: linear-gradient(180deg, #eff8f2 0%, #ffffff 34%); }
    .shell { background: #ffffff; border-radius: 28px; overflow: hidden; box-shadow: 0 24px 60px rgba(31,122,76,0.12); border: 1px solid #d8e3dc; }
    .header { padding: 24px 28px; background: linear-gradient(135deg, #1f7a4c 0%, #58b77f 100%); color: #fff; display: flex; gap: 18px; align-items: center; }
    .profile-img, .profile-fallback { width: 92px; height: 92px; border-radius: 24px; object-fit: cover; background: rgba(255,255,255,0.18); display: flex; align-items: center; justify-content: center; font-size: 34px; font-weight: 800; border: 2px solid rgba(255,255,255,0.5); }
    .meta { color: rgba(255,255,255,0.92); font-size: 13px; }
    .content { padding: 24px; display: grid; grid-template-columns: 1.3fr 1fr; gap: 16px; }
    .section { margin-bottom: 16px; padding: 18px; border-radius: 18px; background: linear-gradient(180deg, #f9fcfa 0%, #ffffff 100%); border: 1px solid #e4ebe7; }
    h2 { color: #1f7a4c; margin-bottom: 10px; }
  </style></head><body>
    <div class="shell">
      <header class="header">${photo}<div><h1>${payload.name}</h1><p class="meta">${payload.roleLabel}</p><p class="meta">${[payload.email, payload.phone, payload.location].filter(Boolean).join(" | ")}</p></div></header>
      <main class="content">
        <div>
          <section class="section"><h2>Professional Summary</h2><p>${payload.summary || "A profile summary will appear here."}</p></section>
          <section class="section"><h2>Projects</h2>${projectsHtmlFromPayload(payload)}</section>
          <section class="section"><h2>Experience</h2>${experienceHtmlFromPayload(payload)}</section>
        </div>
        <div>
          <section class="section"><h2>Skills</h2>${renderResumeList(payload.skills)}</section>
          ${payload.education?.length ? `<section class="section"><h2>Education</h2>${payload.education.map((item) => `<article class="item-card"><div class="item-title">${item.degree || "Education"}</div><div class="item-meta">${[item.school, item.year].filter(Boolean).join(" | ")}</div></article>`).join("")}</section>` : ""}
          <section class="section"><h2>Achievements</h2>${achievementsHtmlFromPayload(payload)}</section>
          <section class="section"><h2>Career Focus</h2><p>${payload.careerGoal || "Career growth and mentorship"}</p></section>
        </div>
      </main>
    </div>
  </body></html>`;
}

exports.generateResume = asyncHandler(async (req, res) => {
  const template = req.query.template || "modern";
  const overrides = req.method === "POST" ? req.body || {} : req.query || {};
  const payload = await buildResumePayloadForUser(req.user.id, overrides);
  const markdown = buildResumeMarkdown(payload);
  const missingFields = collectResumeMissingFields(payload);
  const readinessScore = buildResumeReadiness(payload);

  res.json({
    resume: payload,
    summary: payload.summary,
    markdown,
    previewHtml: buildResumeHtml(payload, template),
    templates: ["modern", "corporate", "creative"],
    missingFields,
    readiness: {
      score: readinessScore,
      level: readinessScore >= 85 ? "Company-ready" : readinessScore >= 65 ? "Needs polish" : "Needs more detail",
      onePageOptimized: true
    },
    export: {
      fileName: resumeFileName(payload.name, "txt"),
      pdfFileName: resumeFileName(payload.name, "pdf"),
      mimeType: "text/plain"
    }
  });
});

function resumeMarkdownToPlainText(markdown) {
  return String(markdown || "")
    .replace(/\r\n/g, "\n")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function fetchResumeImageBuffer(url) {
  if (!url) return null;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch {
    return null;
  }
}

function renderPdfSection(doc, title, lines) {
  if (!lines.length) return;
  doc.moveDown(0.8);
  doc.font("Helvetica-Bold").fontSize(12).fillColor("#1F7A4C").text(title);
  doc.moveDown(0.25);
  doc.font("Helvetica").fontSize(10).fillColor("#1F2937");
  lines.forEach((line) => {
    if (line) doc.text(`- ${line}`, { lineGap: 2 });
  });
}

exports.downloadResumePdf = asyncHandler(async (req, res) => {
  let PDFDocument;
  try {
    PDFDocument = require("pdfkit");
  } catch {
    throw new ApiError(500, "PDF export is not available on the server.");
  }

  const template = ["modern", "corporate", "creative"].includes(String(req.query.template))
    ? String(req.query.template)
    : "modern";
  const payload = await buildResumePayloadForUser(req.user.id);
  const fileName = resumeFileName(payload.name, "pdf");
  const imageBuffer = await fetchResumeImageBuffer(payload.profileImage);
  const themeByTemplate = {
    modern: { primary: "#1F7A4C", text: "#12221A" },
    corporate: { primary: "#111827", text: "#111827" },
    creative: { primary: "#7C3AED", text: "#1F2937" }
  };
  const theme = themeByTemplate[template];

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);

  const doc = new PDFDocument({ margin: 48 });
  doc.pipe(res);

  doc.roundedRect(48, 42, doc.page.width - 96, 118, 18).fill(theme.primary);
  doc.fillColor("#FFFFFF");

  if (imageBuffer) {
    try {
      doc.image(imageBuffer, 64, 58, { fit: [74, 74], align: "center", valign: "center" });
    } catch {
      // If image rendering fails, continue without blocking PDF export.
    }
  }

  const textStartX = imageBuffer ? 152 : 64;
  doc.font("Helvetica-Bold").fontSize(22).text(payload.name || "ORIN Resume", textStartX, 62);
  doc.font("Helvetica").fontSize(11).text(payload.roleLabel || payload.role || "Career Builder", textStartX, 90);
  doc.fontSize(10).fillColor("#F3F6FB").text([payload.email, payload.phone].filter(Boolean).join(" | "), textStartX, 110, {
    width: doc.page.width - textStartX - 70
  });

  doc.fillColor(theme.text);
  doc.y = 180;
  doc.font("Helvetica-Bold").fontSize(13).text("Professional Summary");
  doc.moveDown(0.3);
  doc.font("Helvetica").fontSize(10).fillColor("#344054").text(payload.summary || "Profile summary unavailable.", {
    lineGap: 3
  });

  renderPdfSection(doc, "Skills", payload.skills.length ? payload.skills : ["Add your skills in ORIN profile."]);
  renderPdfSection(
    doc,
    "Projects",
    payload.projects.length
      ? payload.projects.map((project) =>
          [project.title, project.tech?.length ? `Tech: ${project.tech.join(", ")}` : "", project.description, project.link]
            .filter(Boolean)
            .join(" | ")
        )
      : ["Add projects in your ORIN profile."]
  );
  renderPdfSection(
    doc,
    "Achievements",
    payload.achievements.length
      ? payload.achievements.map((item) => [item.title, item.issuer, item.date].filter(Boolean).join(" | "))
      : ["Add achievements in your ORIN profile."]
  );
  renderPdfSection(
    doc,
    "Experience",
    payload.experience.length
      ? payload.experience.map((item) => [item.role, item.organization, [item.start, item.end].filter(Boolean).join(" - "), item.description].filter(Boolean).join(" | "))
      : ["Add experience in your ORIN profile."]
  );
  if (payload.education?.length) {
    renderPdfSection(
      doc,
      "Education",
      payload.education.map((item) => [item.degree, item.school, item.year].filter(Boolean).join(" | "))
    );
  }
  renderPdfSection(doc, "Career Focus", [payload.careerGoal || "Career growth and mentorship"]);
  doc.end();
});

exports.getSkillGapAnalysis = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const studentProfile = await StudentProfile.findOne({ userId }).select("skills careerGoals projects").lean();
  const user = await User.findById(userId).select("goals primaryCategory subCategory").lean();
  const journeyState = await getJourneyState(userId, req.user.role);

  const ctx = resolveAiDomainContext({
    user,
    primaryCategory: req.query.primaryCategory || req.query.domain || journeyState?.goal?.domain,
    subCategory: req.query.subCategory || req.query.subDomain || journeyState?.goal?.subDomain,
    focus: req.query.focus || req.query.specialization || journeyState?.goal?.focus
  });
  const goal = String(
    req.query.goal ||
      journeyState?.goal?.title ||
      studentProfile?.careerGoals ||
      user?.goals ||
      ctx.goalLabel ||
      "Career Growth"
  );
  const template = getAiTemplate(ctx.primaryCategory, ctx.subCategory, ctx.focus);
  const overrideSkills = parseCsvList(req.query.skills);
  const skillProfile = deriveSkillGapProfile({
    goal,
    template,
    overrideSkills,
    journeyState,
    profileSkills: studentProfile?.skills || []
  });
  const { currentSkills, missingSkills, readinessScore } = skillProfile;

  const mentorProfiles = await MentorProfile.find({})
    .populate("userId", "name approvalStatus role isDeleted")
    .sort({ rating: -1, totalSessionsConducted: -1 })
    .limit(80)
    .lean();
  const recommendedMentors = mentorProfiles
    .filter((item) => item.userId?.role === "mentor" && item.userId?.approvalStatus === "approved" && item.userId?.isDeleted !== true)
    .map((item) => {
      const signals = uniqueTokens([
        item.primaryCategory,
        item.subCategory,
        ...normalizeList(item.specializations || []),
        ...normalizeList(item.expertiseDomains || [])
      ]);
      let score = 0;
      missingSkills.forEach((skill) => {
        if (signals.has(normalizeText(skill))) score += 1;
      });
      return {
        mentorId: item.userId?._id,
        name: item.userId?.name || "Mentor",
        rating: Number(item.rating || 0),
        verifiedBadge: Boolean(item.verifiedBadge),
        score
      };
    })
    .sort((a, b) => b.score - a.score || b.rating - a.rating)
    .slice(0, 6);

  const projectIdeas = (template?.projects?.length ? template.projects : getProjectIdeasForGoal(goal)).slice(0, 5);
  const roadmapSteps = buildSkillProgressiveRoadmap({
    goal,
    ctx,
    template,
    knownSkills: currentSkills,
    missingSkills
  }).slice(0, 5);
  const requestedRoadmapId = buildSkillAwareRoadmapId(goal, ctx, currentSkills);

  await updateSkillProfile(
    userId,
    {
      knownSkills: currentSkills,
      missingSkills,
      readinessScore,
      level: skillProfile.level,
      roadmapSteps,
      roadmapId: requestedRoadmapId,
      recommendations: {
        mentorIds: recommendedMentors.map((item) => String(item.mentorId || "")).filter(Boolean),
        projectIdeaIds: projectIdeas.map((item) => String(item || "")),
        libraryResourceIds: missingSkills.map((skill) => `${skill} Fundamentals`),
        feedTags: uniqueTokens([goal, ctx.primaryCategory, ctx.subCategory, ctx.focus, ...missingSkills]).size
          ? Array.from(uniqueTokens([goal, ctx.primaryCategory, ctx.subCategory, ctx.focus, ...missingSkills])).slice(0, 8)
          : []
      }
    },
    req.user.role
  );

  res.json({
    goal,
    domainContext: ctx,
    currentSkills,
    missingSkills,
    readinessScore,
    suggestions: {
      mentors: recommendedMentors,
      courses: missingSkills.map((skill) => `${skill} Fundamentals`),
      projects: projectIdeas,
      roadmapUpdates: roadmapSteps
    }
  });
});

exports.getVerifiedMentors = asyncHandler(async (req, res) => {
  const requestedAudienceStage = String(req.query?.audienceStage || req.query?.learnerStage || "").trim().toLowerCase();
  const mentorQuery = { verifiedBadge: true };
  if (requestedAudienceStage === "highschool") {
    mentorQuery.mentorOrgRole = "institution_teacher";
  } else if (requestedAudienceStage === "after12") {
    mentorQuery.mentorOrgRole = { $ne: "institution_teacher" };
  }

  const mentors = await MentorProfile.find(mentorQuery)
    .populate("userId", "name role approvalStatus isDeleted")
    .sort({ rating: -1, totalSessionsConducted: -1, updatedAt: -1 })
    .limit(60)
    .lean();

  const rows = mentors
    .filter((item) => item.userId?.role === "mentor" && item.userId?.approvalStatus === "approved" && item.userId?.isDeleted !== true)
    .map((item) => ({
      mentorId: item.userId?._id,
      name: item.userId?.name || "Mentor",
      title: item.title || "Mentor",
      company: item.company || "",
      rating: Number(item.rating || 0),
      totalSessionsConducted: Number(item.totalSessionsConducted || 0),
      verifiedBadge: true,
      profilePhotoUrl: item.profilePhotoUrl || "",
      mentorOrgRole: item.mentorOrgRole || "global_mentor",
      expertiseDomains: Array.isArray(item.expertiseDomains) ? item.expertiseDomains : [],
      specializations: Array.isArray(item.specializations) ? item.specializations : [],
      primaryCategory: item.primaryCategory || "",
      subCategory: item.subCategory || ""
    }));

  res.json(rows);
});

exports.getCommunityChallenges = asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  const role = req.user?.role;
  const [journeyState, profile] = await Promise.all([
    getJourneyState(userId, role || "student"),
    StudentProfile.findOne({ userId }).select("projects").lean()
  ]);
  const goal = String(journeyState?.goal?.title || journeyState?.goal?.domain || "Career Growth").trim();
  const challengeState = buildChallengeJourneyState({ journeyState, profile, goal });
  const audienceProfile = role === "mentor"
    ? await MentorProfile.findOne({ userId }).select("institutionName mentorOrgRole").lean()
    : await StudentProfile.findOne({ userId }).select("institutionName collegeName className learnerStage").lean();
  const audienceInstitutionName = String(audienceProfile?.institutionName || audienceProfile?.collegeName || "").trim();
  const audienceClassName = String(audienceProfile?.className || "").trim();
  const viewerAudienceStage = audienceStageForViewer(role, audienceProfile);
  const audienceStageFilter = audienceStageVisibilityFilter(viewerAudienceStage, "createdBy", userId);
  const challengeAudienceFilters = [
    { scope: { $exists: false } },
    { scope: "global" },
    { scope: "", institutionName: "" },
    { scope: null, institutionName: "" }
  ];
  if (audienceInstitutionName) {
    challengeAudienceFilters.push({ scope: "institution", institutionName: audienceInstitutionName });
    challengeAudienceFilters.push({ scope: { $exists: false }, institutionName: audienceInstitutionName });
    if (audienceClassName) {
      challengeAudienceFilters.push({ scope: "class", institutionName: audienceInstitutionName, className: audienceClassName });
    }
  }

  const challengesQuery =
    role === "mentor"
      ? {
          $and: [
            {
              $or: challengeAudienceFilters
            },
            audienceStageFilter,
            {
              $or: [
                { isActive: true, approvalStatus: "approved" },
                // Mentors can see their own submissions even if not active yet (admin review workflow).
                { createdBy: userId }
              ]
            }
          ]
        }
      : {
          isActive: true,
          approvalStatus: "approved",
          $and: [
            { $or: challengeAudienceFilters },
            audienceStageFilter
          ]
        };

  let challenges = await CommunityChallenge.find(challengesQuery)
    .populate("createdBy", "name")
    .sort({ deadline: 1, createdAt: -1 })
    .limit(40)
    .lean();
  const submissionRows = userId
    ? await CommunityChallengeSubmission.find({ userId }).select("challengeId status mentorReview").lean()
    : [];
  const submissionMap = new Map(submissionRows.map((item) => [String(item.challengeId), item]));

  if (!challenges.length && viewerAudienceStage === "after12") {
    challenges = [
      {
        _id: "seed-challenge-ai",
        title: "AI Challenge - Build Image Classifier",
        domain: "AI & Machine Learning",
        description: "Build and submit an image classifier project.",
        deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        participants: new Array(320).fill(""),
        topParticipants: []
      }
    ];
  }

  res.json(
    challenges.map((item) => {
      const participantsCount = (item.participants || []).length;
      const relevance = scoreTokenOverlap(`${item.title} ${item.domain || ""} ${item.description || ""}`, challengeState.recommendationTokens);
      const isProjectAligned =
        challengeState.completedProjectCount > 0 ||
        scoreTokenOverlap(`${item.title} ${item.description || ""}`, tokenize(challengeState.currentStep?.title || "")) > 0;
      const recommendationReason = relevance > 0
        ? `Fits your current journey in ${journeyState?.goal?.focus || journeyState?.goal?.subDomain || journeyState?.goal?.domain || goal}`
        : isProjectAligned
          ? "Good next challenge after your current project progress"
          : `Useful challenge for building toward ${goal}`;

      return {
        id: item._id,
        title: item.title,
        domain: item.domain,
        scope: item.scope || "global",
        institutionName: item.institutionName || "",
        className: item.className || "",
        audienceStage: item.audienceStage || "",
        mentor: item.createdBy
          ? {
              id: item.createdBy?._id || null,
              name: item.createdBy?.name || "Mentor"
            }
          : null,
        description: item.description,
        bannerImageUrl: item.bannerImageUrl || "",
        prize: item.prize || "",
        skills: normalizeList(item.skills || []),
        tasks: normalizeList(item.tasks || []),
        submissionType: item.submissionType || "",
        proofInstructions: item.proofInstructions || "",
        participantLimit: Number(item.participantLimit || 0),
        deadline: item.deadline,
        isActive: item.isActive !== false,
        approvalStatus: item.approvalStatus || "approved",
        participantsCount,
        topParticipants: item.topParticipants || [],
        submissionStatus: submissionMap.get(String(item._id))?.status || "not_submitted",
        awardedRank: Number(submissionMap.get(String(item._id))?.mentorReview?.rank || 0),
        awardedXp: Number(submissionMap.get(String(item._id))?.mentorReview?.xpAwarded || 0),
        recommended: relevance > 0 || isProjectAligned,
        recommendationReason,
        challengeState: challengeState.currentStep?.title || "Foundation",
        xpHint: 50 + Math.min(40, participantsCount > 0 ? Math.round(participantsCount / 20) : 0)
      };
    }).sort((a, b) => {
      const scoreA = (a.recommended ? 2 : 0) + (a.participantsCount || 0) / 100;
      const scoreB = (b.recommended ? 2 : 0) + (b.participantsCount || 0) / 100;
      return scoreB - scoreA || new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
    })
  );
});

exports.submitCommunityChallenge = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const title = String(req.body?.title || "").trim();
  const domain = String(req.body?.domain || "").trim();
  const description = String(req.body?.description || "").trim();
  const deadlineRaw = req.body?.deadline;
  const bannerImageUrl = String(req.body?.bannerImageUrl || "").trim();
  const prize = String(req.body?.prize || "").trim();
  const submissionType = String(req.body?.submissionType || "").trim();
  const proofInstructions = String(req.body?.proofInstructions || "").trim();
  const participantLimit = Number(req.body?.participantLimit || 0);
  const skills = Array.isArray(req.body?.skills)
    ? req.body.skills.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 12)
    : [];
  const tasks = Array.isArray(req.body?.tasks)
    ? req.body.tasks.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 12)
    : [];
  const mentorProfile = await MentorProfile.findOne({ userId }).select("institutionName mentorOrgRole").lean();
  const mentorInstitutionName = String(req.body?.institutionName || mentorProfile?.institutionName || "").trim();
  const targetClassName = String(req.body?.className || "").trim();
  const scopeDetails = normalizeContentScope({
    requestedScope: req.body?.scope,
    role: req.user.role,
    institutionName: mentorInstitutionName,
    className: targetClassName
  });

  if (!title) throw new ApiError(400, "Title is required");
  if (!deadlineRaw) throw new ApiError(400, "Deadline is required");

  const deadline = new Date(deadlineRaw);
  if (Number.isNaN(deadline.getTime())) throw new ApiError(400, "Invalid deadline");
  if (deadline.getTime() < Date.now() + 5 * 60 * 1000) {
    throw new ApiError(400, "Deadline must be at least 5 minutes in the future");
  }

  const doc = await CommunityChallenge.create({
    title,
    domain,
    scope: scopeDetails.scope,
    institutionName: scopeDetails.institutionName,
    className: scopeDetails.className,
    audienceStage: audienceStageForMentorProfile(mentorProfile, req.body?.audienceStage),
    description,
    bannerImageUrl,
    prize,
    skills,
    tasks,
    submissionType,
    proofInstructions,
    participantLimit: Number.isFinite(participantLimit) ? Math.max(0, Math.min(5000, participantLimit)) : 0,
    deadline,
    isActive: false, // pending admin activation
    approvalStatus: "pending",
    isFeatured: false,
    createdBy: userId,
    participants: [],
    topParticipants: []
  });

  res.status(201).json({
    message: "Challenge submitted for admin review",
    challenge: {
      id: doc._id,
      title: doc.title,
      scope: doc.scope,
      isActive: doc.isActive
    }
  });
});

exports.joinCommunityChallenge = asyncHandler(async (req, res) => {
  const { challengeId } = req.params;
  const userId = req.user.id;
  if (!mongoose.Types.ObjectId.isValid(challengeId)) throw new ApiError(400, "Invalid challengeId");

  const challenge = await CommunityChallenge.findOne({ _id: challengeId, isActive: true, approvalStatus: "approved" });
  if (!challenge) throw new ApiError(404, "Challenge not found");
  if (challenge.participantLimit > 0 && challenge.participants.length >= challenge.participantLimit) {
    throw new ApiError(400, "Participant limit reached");
  }

  const already = challenge.participants.some((id) => String(id) === String(userId));
  if (!already) {
    challenge.participants.push(userId);
    await challenge.save();
  }

  await applyReputationDelta(userId, { dailyChallenges: 1 });

  res.json({ message: "Challenge joined", participantsCount: challenge.participants.length });
});

exports.submitCommunityChallengeProof = asyncHandler(async (req, res) => {
  const { challengeId } = req.params;
  const userId = req.user.id;
  if (!mongoose.Types.ObjectId.isValid(challengeId)) throw new ApiError(400, "Invalid challengeId");

  const challenge = await CommunityChallenge.findOne({ _id: challengeId, isActive: true, approvalStatus: "approved" }).lean();
  if (!challenge) throw new ApiError(404, "Challenge not found");
  const joined = (challenge.participants || []).some((id) => String(id) === String(userId));
  if (!joined) throw new ApiError(400, "Join the challenge before submitting proof");

  const proofNote = String(req.body?.proofNote || "").trim();
  const proofLinks = Array.isArray(req.body?.proofLinks)
    ? req.body.proofLinks.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 8)
    : String(req.body?.proofLink || "").trim()
      ? [String(req.body?.proofLink || "").trim()]
      : [];
  const proofFiles = Array.isArray(req.body?.proofFiles)
    ? req.body.proofFiles.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 8)
    : [];

  if (!proofNote && !proofLinks.length && !proofFiles.length) {
    throw new ApiError(400, "Add at least one proof note, link, or file");
  }

  const submission = await CommunityChallengeSubmission.findOneAndUpdate(
    { challengeId, userId },
    {
      $set: {
        proofNote,
        proofLinks,
        proofFiles,
        status: "submitted"
      }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  res.status(201).json({
    message: "Proof submitted for mentor review",
    submission
  });
});

exports.reviewCommunityChallengeSubmission = asyncHandler(async (req, res) => {
  const { challengeId, submissionId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(challengeId) || !mongoose.Types.ObjectId.isValid(submissionId)) {
    throw new ApiError(400, "Invalid challenge or submission id");
  }

  const challenge = await CommunityChallenge.findById(challengeId).lean();
  if (!challenge) throw new ApiError(404, "Challenge not found");
  if (String(challenge.createdBy || "") !== String(req.user.id) && req.user.role !== "admin") {
    throw new ApiError(403, "Only the challenge mentor or admin can review submissions");
  }

  const submission = await CommunityChallengeSubmission.findById(submissionId);
  if (!submission || String(submission.challengeId) !== String(challengeId)) {
    throw new ApiError(404, "Submission not found");
  }

  const rank = Number(req.body?.rank || 0);
  const xpAwarded = Number(req.body?.xpAwarded || 0);
  const notes = String(req.body?.notes || "").trim();
  const action = String(req.body?.action || "accept").trim();
  if (!["accept", "reject", "review"].includes(action)) {
    throw new ApiError(400, "action must be accept, reject, or review");
  }
  const previousChallengeXp = submission.status === "accepted" ? Number(submission.mentorReview?.xpAwarded || 0) : 0;

  submission.status = action === "accept" ? "accepted" : action === "reject" ? "rejected" : "reviewed";
  submission.mentorReview = {
    rank: Number.isFinite(rank) ? Math.max(0, Math.min(3, rank)) : 0,
    xpAwarded: Number.isFinite(xpAwarded) ? Math.max(0, xpAwarded) : 0,
    notes,
    reviewedBy: req.user.id,
    reviewedAt: new Date(),
    certificateId: submission.mentorReview?.certificateId || null
  };

  const challengeXpDelta = (submission.status === "accepted" ? Number(submission.mentorReview.xpAwarded || 0) : 0) - previousChallengeXp;
  if (challengeXpDelta !== 0) {
    await applyReputationDelta(submission.userId, { challengeXp: challengeXpDelta });
  }

  if (submission.status === "accepted" && req.body?.issueCertificate) {
    const { certificate } = await issueCertificate({
      userId: submission.userId,
      userName: "",
      title: String(req.body?.certificateTitle || `${challenge.title} Performance Certificate`).trim(),
      type: "challenge",
      issuedBy: req.user.role === "admin" ? "ORIN Admin" : "ORIN Mentor",
      source: "Challenge Review",
      level: submission.mentorReview.rank ? `Rank ${submission.mentorReview.rank}` : "Participant",
      domain: challenge.domain || "",
      referenceType: "challenge",
      referenceId: String(challenge._id),
      metadata: {
        domain: challenge.domain || "",
        level: submission.mentorReview.rank ? `Rank ${submission.mentorReview.rank}` : "Participant",
        challengeTitle: challenge.title,
        score: submission.mentorReview.xpAwarded || 0
      },
      status: "approved"
    });
    submission.mentorReview.certificateId = certificate._id;
  }

  await submission.save();
  res.status(200).json({ message: "Submission reviewed", submission });
});

exports.getOrinCertifications = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const [certs, profile] = await Promise.all([
    OrinCertification.find({ userId }).sort({ issuedAt: -1 }).limit(60).lean(),
    StudentProfile.findOne({ userId }).select("certifications").lean()
  ]);

  const profileCerts = (profile?.certifications || []).map((title, idx) => ({
    id: `profile-${idx}`,
    title: String(title),
    level: "Profile",
    domain: "",
    issuedAt: null,
    source: "Profile"
  }));

  res.json([
    ...certs.map((item) => ({
      id: item._id,
      certificateId: item.certificateId || "",
      userName: item.userName || req.user.name || "",
      title: item.title,
      type: item.type || "manual",
      level: item.level,
      domain: item.domain,
      issuedAt: item.issuedAt,
      issuedBy: item.issuedBy || "ORIN",
      source: item.source,
      status: item.status || "approved",
      qrCodeUrl: item.qrCodeUrl || "",
      verificationUrl: item.verificationUrl || "",
      certificateUrl: item.certificateUrl || "",
      metadata: item.metadata || {}
    })),
    ...profileCerts
  ]);
});

exports.getCertificateDetail = asyncHandler(async (req, res) => {
  const { certificateId } = req.params;
  const userId = req.user.id;

  let doc = null;
  if (mongoose.Types.ObjectId.isValid(certificateId)) {
    doc = await OrinCertification.findOne({ _id: certificateId, userId }).lean();
  }
  if (!doc) {
    doc = await OrinCertification.findOne({ certificateId, userId }).lean();
  }
  if (!doc) throw new ApiError(404, "Certificate not found");

  res.json({
    id: doc._id,
    certificateId: doc.certificateId || "",
    userId: doc.userId,
    userName: doc.userName || req.user.name || "",
    title: doc.title,
    type: doc.type || "manual",
    issuedBy: doc.issuedBy || "ORIN",
    issuedAt: doc.issuedAt,
    dateIssued: doc.issuedAt,
    level: doc.level || "Beginner",
    domain: doc.domain || "",
    status: doc.status || "approved",
    qrCodeUrl: doc.qrCodeUrl || "",
    verificationUrl: doc.verificationUrl || "",
    certificateUrl: doc.certificateUrl || "",
    metadata: doc.metadata || {}
  });
});

exports.verifyCertificatePublic = asyncHandler(async (req, res) => {
  const { certificateId } = req.params;
  const doc = await OrinCertification.findOne({ certificateId }).lean();
  if (!doc || doc.status !== "approved") {
    return res.status(404).json({ valid: false, message: "Certificate not found" });
  }

  res.json({
    valid: true,
    certificateId: doc.certificateId,
    name: doc.userName || "ORIN User",
    title: doc.title,
    type: doc.type || "manual",
    course: doc.title,
    domain: doc.domain || doc.metadata?.domain || "",
    level: doc.level || doc.metadata?.level || "Beginner",
    date: doc.issuedAt,
    issuedBy: doc.issuedBy || "ORIN",
    qrCodeUrl: doc.qrCodeUrl || "",
    verificationUrl: doc.verificationUrl || "",
    metadata: doc.metadata || {}
  });
});

exports.generateCertificate = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const type = String(req.body?.type || "").trim();
  const title = String(req.body?.title || "").trim();
  const domain = String(req.body?.domain || "").trim();
  const level = String(req.body?.level || "Beginner").trim();
  const referenceId = String(req.body?.referenceId || "").trim();

  if (!type) throw new ApiError(400, "type is required");
  if (!title) throw new ApiError(400, "title is required");

  let issuePayload = null;

  if (type === "roadmap") {
    const journeyState = await getJourneyState(userId, req.user.role);
    const syncedRoadmap = await persistSyncedRoadmapState(journeyState);
    const totalSteps = syncedRoadmap.steps.length;
    const completedSteps = syncedRoadmap.steps.filter(
      (step) => step.status === "completed" && Boolean(step.proofSubmittedAt || step.proofText || step.proofLink || step.proofImageUrl)
    ).length;

    if (!totalSteps || completedSteps < totalSteps) {
      throw new ApiError(400, "Roadmap certificate requires 100% completion");
    }

    issuePayload = {
      userId,
      userName: req.user.name,
      title,
      type: "roadmap",
      level,
      domain,
      issuedBy: "ORIN",
      source: "AI Roadmap",
      referenceType: "roadmap",
      referenceId: referenceId || normalizeText(title).replace(/\s+/g, "-"),
      metadata: {
        domain,
        level,
        goal: String(req.body?.metadata?.goal || req.body?.goal || journeyState?.goal?.title || title).trim(),
        totalSteps,
        completedSteps,
        score: Number(req.body?.metadata?.score || 100)
      }
    };
  } else if (type === "challenge") {
    if (!referenceId || !mongoose.Types.ObjectId.isValid(referenceId)) {
      throw new ApiError(400, "Challenge certificate requires a valid challenge referenceId");
    }

    const challenge = await CommunityChallenge.findOne({ _id: referenceId, isActive: true }).lean();
    if (!challenge) throw new ApiError(404, "Challenge not found");

    const joined = (challenge.participants || []).some((id) => String(id) === String(userId));
    if (!joined) throw new ApiError(400, "Join the challenge before claiming a certificate");

    const completedTasks = Number(req.body?.metadata?.completedTasks || req.body?.completedTasks || 0);
    const totalTasks = Number(req.body?.metadata?.totalTasks || req.body?.totalTasks || 0);
    if (!totalTasks || completedTasks < totalTasks) {
      throw new ApiError(400, "Complete all challenge tasks before claiming a certificate");
    }

    issuePayload = {
      userId,
      userName: req.user.name,
      title,
      type: "challenge",
      level,
      domain: domain || challenge.domain || "",
      issuedBy: "ORIN",
      source: "Challenge Completion",
      referenceType: "challenge",
      referenceId,
      metadata: {
        domain: domain || challenge.domain || "",
        level,
        score: Number(req.body?.metadata?.score || 100),
        challengeTitle: challenge.title,
        totalSteps: totalTasks,
        completedSteps: completedTasks
      }
    };
  } else {
    throw new ApiError(400, "Unsupported certificate type");
  }

  const { certificate, created } = await issueCertificate(issuePayload);

  res.status(created ? 201 : 200).json({
    success: true,
    created,
    certificate: {
      id: certificate._id,
      certificateId: certificate.certificateId || "",
      title: certificate.title,
      type: certificate.type || type,
      issuedAt: certificate.issuedAt,
      issuedBy: certificate.issuedBy || "ORIN",
      level: certificate.level || level,
      domain: certificate.domain || domain,
      qrCodeUrl: certificate.qrCodeUrl || "",
      verificationUrl: certificate.verificationUrl || "",
      certificateUrl: certificate.certificateUrl || "",
      metadata: certificate.metadata || {}
    }
  });
});

exports.getCertificationTracks = asyncHandler(async (_req, res) => {
  const tracks = await CertificationTrack.find({ isActive: true })
    .sort({ updatedAt: -1 })
    .limit(200)
    .lean();

  res.json(
    tracks.map((item) => ({
      id: item._id,
      title: item.title,
      level: item.level || "Beginner",
      domain: item.domain || "",
      description: item.description || "",
      requirements: item.requirements || []
    }))
  );
});

exports.requestCertificationTrack = asyncHandler(async (req, res) => {
  const { trackId } = req.params;
  const userId = req.user.id;
  if (!mongoose.Types.ObjectId.isValid(trackId)) throw new ApiError(400, "Invalid track id");

  const track = await CertificationTrack.findOne({ _id: trackId, isActive: true }).lean();
  if (!track) throw new ApiError(404, "Certification track not found");

  const existing = await CertificationRequest.findOne({ trackId, userId }).lean();
  if (existing) {
    return res.json({ message: "Request already exists", status: existing.status });
  }

  await CertificationRequest.create({
    trackId,
    userId,
    status: "pending",
    note: String(req.body?.note || "").trim()
  });

  res.status(201).json({ message: "Certification request submitted", status: "pending" });
});

exports.getMyCertificationRequests = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const rows = await CertificationRequest.find({ userId })
    .populate("trackId", "title level domain")
    .sort({ createdAt: -1 })
    .limit(200)
    .lean();

  res.json(
    rows.map((item) => ({
      id: item._id,
      status: item.status,
      note: item.note || "",
      createdAt: item.createdAt,
      track: {
        id: item.trackId?._id || null,
        title: item.trackId?.title || "Certification",
        level: item.trackId?.level || "Beginner",
        domain: item.trackId?.domain || ""
      }
    }))
  );
});

exports.getMentorGroups = asyncHandler(async (req, res) => {
  let groups = await MentorGroup.find({ isActive: true })
    .populate("mentorId", "name role approvalStatus isDeleted")
    .populate("memberIds", "name email role")
    .populate("pendingRequestIds", "name email role")
    .sort({ updatedAt: -1 })
    .limit(60)
    .lean();

  if (!groups.length) {
    groups = [
      {
        _id: "seed-group-ai",
        mentorId: { _id: null, name: "Google ML Engineer", role: "mentor", approvalStatus: "approved", isDeleted: false },
        name: "AI Beginners",
        domain: "AI & Machine Learning",
        description: "Weekly learning group for AI basics.",
        maxStudents: 50,
        memberIds: [],
        schedule: "Weekly sessions",
        isActive: true
      }
    ];
  }

  res.json(
    groups
      .filter((item) => !item.mentorId || (item.mentorId.role === "mentor" && item.mentorId.approvalStatus === "approved" && item.mentorId.isDeleted !== true))
      .map((item) => {
        const memberIds = item.memberIds || [];
        const pendingRequestIds = item.pendingRequestIds || [];
        const idOf = (value) => String(value?._id || value || "");
        const isOwner = String(item.mentorId?._id || "") === String(req.user.id);
        return {
          id: item._id,
          name: item.name,
          domain: item.domain,
          description: item.description,
          avatarUrl: item.avatarUrl || "",
          rules: item.rules || "",
          mentor: {
            id: item.mentorId?._id || null,
            name: item.mentorId?.name || "Mentor"
          },
          maxStudents: item.maxStudents || 0,
          membersCount: memberIds.length,
          pendingRequestsCount: pendingRequestIds.length,
          joined: memberIds.some((id) => idOf(id) === String(req.user.id)),
          requestPending: pendingRequestIds.some((id) => idOf(id) === String(req.user.id)),
          ownedByMe: isOwner,
          members: isOwner
            ? memberIds.slice(0, 30).map((member) => ({
                id: member._id,
                name: member.name || "Student",
                email: member.email || ""
              }))
            : [],
          pendingRequests: isOwner
            ? pendingRequestIds.slice(0, 30).map((student) => ({
                id: student._id,
                name: student.name || "Student",
                email: student.email || ""
              }))
            : [],
          topicTags: item.topicTags || [],
          schedule: item.schedule || "Weekly sessions",
          settings: {
            joinApproval: item.settings?.joinApproval !== false,
            allowMemberMessages: item.settings?.allowMemberMessages !== false,
            allowMemberMedia: item.settings?.allowMemberMedia !== false,
            allowReactions: item.settings?.allowReactions !== false
          }
        };
      })
  );
});

function buildMentorGroupMessagePayload(msg) {
  return {
    id: msg._id,
    text: msg.text || "",
    attachments: Array.isArray(msg.attachments)
      ? msg.attachments
          .map((item) => ({
            type: item.type === "image" ? "image" : "file",
            url: item.url || "",
            name: item.name || "",
            mimeType: item.mimeType || ""
          }))
          .filter((item) => item.url)
      : [],
    reactions: Array.isArray(msg.reactions)
      ? msg.reactions.map((item) => ({
          emoji: item.emoji,
          count: (item.userIds || []).length,
          reactedByMe: false,
          userIds: (item.userIds || []).map((id) => String(id))
        }))
      : [],
    createdAt: msg.createdAt,
    editedAt: msg.editedAt,
    sender: {
      id: msg.senderId?._id || msg.senderId,
      name: msg.senderId?.name || "Member",
      role: msg.senderId?.role || "member"
    }
  };
}

async function ensureMentorGroupAccess(groupId, user) {
  if (!mongoose.Types.ObjectId.isValid(groupId)) throw new ApiError(400, "Invalid groupId");
  const group = await MentorGroup.findById(groupId);
  if (!group || !group.isActive) throw new ApiError(404, "Group not found");
  const userId = String(user.id || user._id || "");
  const isMentorOwner = String(group.mentorId) === userId;
  const isMember = (group.memberIds || []).some((id) => String(id) === userId);
  if (!isMentorOwner && !isMember) {
    throw new ApiError(403, "You are not a member of this group");
  }
  return { group, userId, isMentorOwner };
}

async function sendMentorGroupPushNotifications({ group, senderId, senderName, text, attachments = [] }) {
  const memberIds = (group.memberIds || []).map((id) => String(id));
  const recipientIds = [...new Set([String(group.mentorId), ...memberIds])].filter((id) => id && id !== String(senderId));
  if (!recipientIds.length) return;

  const fallbackBody = attachments.length ? `${senderName} sent an attachment` : `${senderName} sent a message`;
  const cleanText = String(text || "").trim();
  const body = cleanText ? `${senderName}: ${cleanText.slice(0, 120)}` : fallbackBody;

  await Notification.insertMany(
    recipientIds.slice(0, 120).map((recipientId) => ({
      title: group.name || "Study Group",
      message: body,
      type: "direct",
      sentBy: senderId,
      targetRole: "all",
      recipient: recipientId
    }))
  );
}

exports.getMentorGroupMessages = asyncHandler(async (req, res) => {
  const { groupId } = req.params;
  const { group } = await ensureMentorGroupAccess(groupId, req.user);

  const messages = await MentorGroupMessage.find({ groupId: group._id, deletedAt: null })
    .populate("senderId", "name role")
    .sort({ createdAt: 1 })
    .limit(500)
    .lean();

  res.json({
    group: {
      id: group._id,
      name: group.name,
      domain: group.domain,
      description: group.description,
      avatarUrl: group.avatarUrl || "",
      rules: group.rules || "",
      schedule: group.schedule || "Weekly sessions",
      membersCount: group.memberIds.length,
      ownedByMe: String(group.mentorId) === String(req.user.id),
      settings: {
        joinApproval: group.settings?.joinApproval !== false,
        allowMemberMessages: group.settings?.allowMemberMessages !== false,
        allowMemberMedia: group.settings?.allowMemberMedia !== false,
        allowReactions: group.settings?.allowReactions !== false
      }
    },
    messages: messages.map((msg) => {
      const payload = buildMentorGroupMessagePayload(msg);
      payload.reactions = payload.reactions.map((reaction) => ({
        ...reaction,
        reactedByMe: reaction.userIds.includes(String(req.user.id)),
        userIds: undefined
      }));
      return payload;
    })
  });
});

exports.sendMentorGroupMessage = asyncHandler(async (req, res) => {
  const { groupId } = req.params;
  const { group, userId, isMentorOwner } = await ensureMentorGroupAccess(groupId, req.user);
  const text = String(req.body?.text || "").trim();
  const attachments = Array.isArray(req.body?.attachments)
    ? req.body.attachments
        .map((item) => ({
          type: item?.type === "image" ? "image" : "file",
          url: String(item?.url || "").trim(),
          name: String(item?.name || "").trim().slice(0, 160),
          mimeType: String(item?.mimeType || "").trim().slice(0, 120)
        }))
        .filter((item) => item.url)
        .slice(0, 4)
    : [];
  if (!text && !attachments.length) throw new ApiError(400, "Message text or attachment is required");
  if (!isMentorOwner && group.settings?.allowMemberMessages === false) {
    throw new ApiError(403, "Only the group mentor can send messages right now");
  }
  if (!isMentorOwner && attachments.length && group.settings?.allowMemberMedia === false) {
    throw new ApiError(403, "Media sharing is disabled for members in this group");
  }

  const message = await MentorGroupMessage.create({
    groupId: group._id,
    senderId: userId,
    text,
    attachments
  });

  const populated = await MentorGroupMessage.findById(message._id).populate("senderId", "name role").lean();
  const chatMessage = buildMentorGroupMessagePayload(populated);
  sendMentorGroupPushNotifications({
    group,
    senderId: userId,
    senderName: populated.senderId?.name || "Member",
    text,
    attachments
  }).catch(() => null);

  res.status(201).json({
    message: "Message sent",
    chatMessage
  });
});

exports.updateMentorGroupMessage = asyncHandler(async (req, res) => {
  const { groupId, messageId } = req.params;
  const { userId, isMentorOwner } = await ensureMentorGroupAccess(groupId, req.user);
  if (!mongoose.Types.ObjectId.isValid(messageId)) throw new ApiError(400, "Invalid message id");
  const text = String(req.body?.text || "").trim();
  if (!text) throw new ApiError(400, "Message text is required");

  const message = await MentorGroupMessage.findById(messageId);
  if (!message || String(message.groupId) !== String(groupId)) throw new ApiError(404, "Message not found");
  const isOwner = String(message.senderId) === String(userId);
  if (!isOwner && !isMentorOwner) throw new ApiError(403, "Not allowed to edit this message");

  message.text = text;
  message.editedAt = new Date();
  await message.save();

  const populated = await MentorGroupMessage.findById(message._id).populate("senderId", "name role").lean();
  const chatMessage = buildMentorGroupMessagePayload(populated);
  res.json({
    message: "Message updated",
    chatMessage
  });
});

exports.reactMentorGroupMessage = asyncHandler(async (req, res) => {
  const { groupId, messageId } = req.params;
  const { group, userId } = await ensureMentorGroupAccess(groupId, req.user);
  if (group.settings?.allowReactions === false) throw new ApiError(403, "Reactions are disabled for this group");
  if (!mongoose.Types.ObjectId.isValid(messageId)) throw new ApiError(400, "Invalid message id");
  const emoji = String(req.body?.emoji || "").trim().slice(0, 8);
  if (!emoji) throw new ApiError(400, "emoji is required");

  const message = await MentorGroupMessage.findById(messageId);
  if (!message || String(message.groupId) !== String(groupId) || message.deletedAt) {
    throw new ApiError(404, "Message not found");
  }

  message.reactions = message.reactions || [];
  let reaction = message.reactions.find((item) => item.emoji === emoji);
  if (!reaction) {
    message.reactions.push({ emoji, userIds: [userId] });
  } else {
    const exists = (reaction.userIds || []).some((id) => String(id) === String(userId));
    reaction.userIds = exists
      ? reaction.userIds.filter((id) => String(id) !== String(userId))
      : [...reaction.userIds, userId];
  }
  message.reactions = message.reactions.filter((item) => (item.userIds || []).length > 0);
  await message.save();

  const populated = await MentorGroupMessage.findById(message._id).populate("senderId", "name role").lean();
  const chatMessage = buildMentorGroupMessagePayload(populated);
  chatMessage.reactions = chatMessage.reactions.map((item) => ({
    ...item,
    reactedByMe: item.userIds.includes(String(userId)),
    userIds: undefined
  }));
  res.json({ message: "Reaction updated", chatMessage });
});

exports.deleteMentorGroupMessage = asyncHandler(async (req, res) => {
  const { groupId, messageId } = req.params;
  const { userId, isMentorOwner } = await ensureMentorGroupAccess(groupId, req.user);
  if (!mongoose.Types.ObjectId.isValid(messageId)) throw new ApiError(400, "Invalid message id");

  const message = await MentorGroupMessage.findById(messageId);
  if (!message || String(message.groupId) !== String(groupId)) throw new ApiError(404, "Message not found");
  const isOwner = String(message.senderId) === String(userId);
  if (!isOwner && !isMentorOwner) throw new ApiError(403, "Not allowed to delete this message");

  message.deletedAt = new Date();
  await message.save();

  res.json({ message: "Message deleted" });
});

exports.joinMentorGroup = asyncHandler(async (req, res) => {
  const { groupId } = req.params;
  const userId = req.user.id;
  if (!mongoose.Types.ObjectId.isValid(groupId)) throw new ApiError(400, "Invalid groupId");

  const group = await MentorGroup.findOne({ _id: groupId, isActive: true });
  if (!group) throw new ApiError(404, "Group not found");
  if (req.user.role !== "student") throw new ApiError(403, "Only students can join groups");

  const already = group.memberIds.some((id) => String(id) === String(userId));
  const pending = group.pendingRequestIds.some((id) => String(id) === String(userId));
  if (!already && !pending) {
    if (group.maxStudents > 0 && group.memberIds.length >= group.maxStudents) {
      throw new ApiError(400, "Group is full");
    }
    if (group.settings?.joinApproval === false) {
      group.memberIds.push(userId);
      await applyReputationDelta(userId, { activityPosts: 1 });
    } else {
      group.pendingRequestIds.push(userId);
      await Notification.create({
        title: "Study Group Join Request",
        message: "A student requested to join your study group.",
        type: "direct",
        sentBy: userId,
        targetRole: "mentor",
        recipient: group.mentorId
      });
    }
    await group.save();
  }

  res.json({
    message: pending || already ? "Group request already exists" : group.settings?.joinApproval === false ? "Group joined" : "Join request sent",
    membersCount: group.memberIds.length
  });
});

exports.respondMentorGroupJoinRequest = asyncHandler(async (req, res) => {
  const { groupId, studentId } = req.params;
  const action = String(req.body?.action || "").trim();
  if (!["approve", "reject"].includes(action)) throw new ApiError(400, "action must be approve or reject");
  if (!mongoose.Types.ObjectId.isValid(groupId) || !mongoose.Types.ObjectId.isValid(studentId)) {
    throw new ApiError(400, "Invalid group or student id");
  }

  const group = await MentorGroup.findById(groupId);
  if (!group || !group.isActive) throw new ApiError(404, "Group not found");
  if (String(group.mentorId) !== String(req.user.id)) throw new ApiError(403, "Only the mentor who created the group can manage requests");

  group.pendingRequestIds = (group.pendingRequestIds || []).filter((id) => String(id) !== String(studentId));
  if (action === "approve" && !(group.memberIds || []).some((id) => String(id) === String(studentId))) {
    if (group.maxStudents > 0 && group.memberIds.length >= group.maxStudents) {
      throw new ApiError(400, "Group is full");
    }
    group.memberIds.push(studentId);
    await applyReputationDelta(studentId, { activityPosts: 1 });
  }
  await group.save();
  await Notification.create({
    title: action === "approve" ? "Study Group Request Approved" : "Study Group Request Rejected",
    message: action === "approve" ? `You can now open ${group.name || "the study group"} chat.` : `Your request to join ${group.name || "the study group"} was rejected.`,
    type: "direct",
    sentBy: req.user.id,
    targetRole: "student",
    recipient: studentId
  });
  res.status(200).json({ message: action === "approve" ? "Student approved" : "Join request rejected", group });
});

exports.updateMentorGroup = asyncHandler(async (req, res) => {
  const { groupId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(groupId)) throw new ApiError(400, "Invalid groupId");
  const group = await MentorGroup.findById(groupId);
  if (!group || !group.isActive) throw new ApiError(404, "Group not found");
  if (String(group.mentorId) !== String(req.user.id)) {
    throw new ApiError(403, "Only the mentor who created the group can update it");
  }

  const patch = req.body || {};
  if (patch.name !== undefined) group.name = String(patch.name || "").trim().slice(0, 120) || group.name;
  if (patch.domain !== undefined) group.domain = String(patch.domain || "").trim().slice(0, 120);
  if (patch.description !== undefined) group.description = String(patch.description || "").trim().slice(0, 1000);
  if (patch.avatarUrl !== undefined) group.avatarUrl = String(patch.avatarUrl || "").trim();
  if (patch.rules !== undefined) group.rules = String(patch.rules || "").trim().slice(0, 1200);
  if (patch.schedule !== undefined) group.schedule = String(patch.schedule || "").trim().slice(0, 160) || "Weekly sessions";
  if (patch.maxStudents !== undefined) {
    const maxStudents = Number(patch.maxStudents || group.maxStudents || 50);
    group.maxStudents = Number.isFinite(maxStudents) ? Math.max(1, Math.min(500, maxStudents)) : group.maxStudents;
  }
  if (Array.isArray(patch.topicTags)) {
    group.topicTags = patch.topicTags.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 8);
  }
  if (patch.settings && typeof patch.settings === "object") {
    group.settings = {
      joinApproval: patch.settings.joinApproval !== false,
      allowMemberMessages: patch.settings.allowMemberMessages !== false,
      allowMemberMedia: patch.settings.allowMemberMedia !== false,
      allowReactions: patch.settings.allowReactions !== false
    };
  }

  await group.save();
  res.json({ message: "Group settings updated", group });
});

function buildQuizBattleQuestionSet({ subject = "", topic = "" } = {}) {
  const subjectKey = normalizeText(subject);
  const topicKey = normalizeText(topic);
  const subjectMatched = QUIZ_BATTLE_QUESTION_BANK.filter(
    (item) => normalizeText(item.subject) === subjectKey || normalizeText(item.topic) === topicKey
  );
  const pool = subjectMatched.length >= 4 ? subjectMatched : QUIZ_BATTLE_QUESTION_BANK;
  const shuffled = [...pool].sort(() => Math.random() - 0.5).slice(0, QUIZ_BATTLE_QUESTION_COUNT);
  return shuffled.map((item, index) => ({
    id: `q-${index + 1}`,
    text: item.text,
    options: item.options,
    correctOption: item.correctOption,
    explanation: item.explanation,
    durationSec: QUIZ_BATTLE_DEFAULT_DURATION_SEC
  }));
}

function buildQuizBattleRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i += 1) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function getRoomParticipant(room, userId) {
  return (room.participants || []).find((item) => String(item.userId) === String(userId)) || null;
}

function leaderboardRows(participants = []) {
  return [...participants]
    .sort((a, b) => (b.score || 0) - (a.score || 0) || new Date(a.joinedAt || 0) - new Date(b.joinedAt || 0))
    .map((item, index) => ({
      rank: index + 1,
      userId: String(item.userId),
      name: item.name || "Student",
      score: item.score || 0
    }));
}

function maybeAdvanceQuizBattleRoom(room) {
  if (!room || room.status !== "live") return false;
  const question = room.questions?.[room.currentQuestionIndex];
  if (!question) {
    room.status = "completed";
    return true;
  }

  const startedAt = room.questionStartedAt ? new Date(room.questionStartedAt).getTime() : 0;
  const elapsedSec = startedAt ? (Date.now() - startedAt) / 1000 : 0;
  const allAnswered = (room.currentQuestionAnsweredUserIds || []).length >= (room.participants || []).length;
  const timeOver = elapsedSec >= Number(question.durationSec || QUIZ_BATTLE_DEFAULT_DURATION_SEC);
  if (!allAnswered && !timeOver) return false;

  room.currentQuestionIndex += 1;
  room.currentQuestionAnsweredUserIds = [];
  room.currentQuestionFirstCorrectUserId = null;

  if (room.currentQuestionIndex >= (room.questions || []).length) {
    room.status = "completed";
    room.questionStartedAt = null;
  } else {
    room.questionStartedAt = new Date();
  }
  return true;
}

function quizBattleRoomPayload(room, viewerId = "") {
  const question = room.questions?.[room.currentQuestionIndex] || null;
  const leaderboard = leaderboardRows(room.participants || []);
  const me = leaderboard.find((item) => String(item.userId) === String(viewerId)) || null;
  return {
    roomId: String(room._id),
    roomCode: room.roomCode,
    subject: room.subject,
    topic: room.topic,
    status: room.status,
    questionIndex: room.currentQuestionIndex,
    totalQuestions: (room.questions || []).length,
    question: question
      ? {
          id: question.id,
          text: question.text,
          options: question.options,
          durationSec: question.durationSec,
          startedAt: room.questionStartedAt
        }
      : null,
    participantsCount: (room.participants || []).length,
    leaderboard,
    me
  };
}

exports.createHighSchoolQuizBattleRoom = asyncHandler(async (req, res) => {
  if (req.user.role !== "student") throw new ApiError(403, "Only students can create quiz battle rooms");
  const subject = String(req.body?.subject || "General Studies").trim() || "General Studies";
  const topic = String(req.body?.topic || "").trim();

  const creator = await User.findById(req.user.id).select("name").lean();
  const questions = buildQuizBattleQuestionSet({ subject, topic });
  if (!questions.length) throw new ApiError(400, "Unable to generate quiz battle questions");

  let roomCode = "";
  for (let attempt = 0; attempt < 8; attempt += 1) {
    roomCode = buildQuizBattleRoomCode();
    const exists = await HighSchoolQuizBattleRoom.findOne({ roomCode }).select("_id").lean();
    if (!exists) break;
  }
  if (!roomCode) throw new ApiError(500, "Unable to create room code. Try again.");

  const room = await HighSchoolQuizBattleRoom.create({
    roomCode,
    subject,
    topic,
    status: "waiting",
    hostId: req.user.id,
    participants: [
      {
        userId: req.user.id,
        name: creator?.name || "Student",
        score: 0
      }
    ],
    questions,
    currentQuestionIndex: 0
  });

  res.status(201).json({
    message: "Quiz battle room created",
    room: quizBattleRoomPayload(room, req.user.id)
  });
});

exports.joinHighSchoolQuizBattleRoom = asyncHandler(async (req, res) => {
  if (req.user.role !== "student") throw new ApiError(403, "Only students can join quiz battle");
  const rawRoomRef = String(req.params?.roomId || "").trim();
  if (!rawRoomRef) throw new ApiError(400, "Room id/code is required");
  const room = mongoose.Types.ObjectId.isValid(rawRoomRef)
    ? await HighSchoolQuizBattleRoom.findById(rawRoomRef)
    : await HighSchoolQuizBattleRoom.findOne({ roomCode: rawRoomRef.toUpperCase() });
  if (!room) throw new ApiError(404, "Quiz battle room not found");
  if (room.status === "completed") throw new ApiError(400, "This quiz battle is already completed");

  const existing = getRoomParticipant(room, req.user.id);
  if (!existing) {
    const user = await User.findById(req.user.id).select("name").lean();
    room.participants.push({
      userId: req.user.id,
      name: user?.name || "Student",
      score: 0
    });
  }
  if (room.status === "waiting" && (room.participants || []).length >= 2) {
    room.status = "live";
    room.questionStartedAt = new Date();
  }
  await room.save();

  res.json({
    message: existing ? "Already joined" : "Joined quiz battle",
    room: quizBattleRoomPayload(room, req.user.id)
  });
});

exports.getHighSchoolQuizBattleState = asyncHandler(async (req, res) => {
  const rawRoomRef = String(req.params?.roomId || "").trim();
  if (!rawRoomRef) throw new ApiError(400, "Room id/code is required");
  const room = mongoose.Types.ObjectId.isValid(rawRoomRef)
    ? await HighSchoolQuizBattleRoom.findById(rawRoomRef)
    : await HighSchoolQuizBattleRoom.findOne({ roomCode: rawRoomRef.toUpperCase() });
  if (!room) throw new ApiError(404, "Quiz battle room not found");
  const participant = getRoomParticipant(room, req.user.id);
  if (!participant) throw new ApiError(403, "Join the room first");

  const changed = maybeAdvanceQuizBattleRoom(room);
  if (changed) await room.save();

  res.json(quizBattleRoomPayload(room, req.user.id));
});

exports.submitHighSchoolQuizBattleAnswer = asyncHandler(async (req, res) => {
  const roomId = String(req.params?.roomId || "").trim();
  if (!mongoose.Types.ObjectId.isValid(roomId)) throw new ApiError(400, "Invalid room id");
  const selectedOption = String(req.body?.selectedOption || "").trim();
  if (!selectedOption) throw new ApiError(400, "selectedOption is required");

  const room = await HighSchoolQuizBattleRoom.findById(roomId);
  if (!room) throw new ApiError(404, "Quiz battle room not found");
  if (room.status !== "live") throw new ApiError(400, "Quiz battle is not active");

  const participant = getRoomParticipant(room, req.user.id);
  if (!participant) throw new ApiError(403, "Join the room first");
  const alreadyAnswered = (room.currentQuestionAnsweredUserIds || []).some((item) => String(item) === String(req.user.id));
  if (alreadyAnswered) throw new ApiError(400, "You already answered this question");

  const question = room.questions?.[room.currentQuestionIndex];
  if (!question) throw new ApiError(400, "No active question");
  const startedAt = room.questionStartedAt ? new Date(room.questionStartedAt).getTime() : Date.now();
  const elapsedSec = (Date.now() - startedAt) / 1000;
  const durationSec = Number(question.durationSec || QUIZ_BATTLE_DEFAULT_DURATION_SEC);
  if (elapsedSec > durationSec) {
    maybeAdvanceQuizBattleRoom(room);
    await room.save();
    throw new ApiError(400, "Time up for this question");
  }

  room.currentQuestionAnsweredUserIds.push(req.user.id);
  participant.lastAnsweredAt = new Date();

  const isCorrect = normalizeText(selectedOption) === normalizeText(question.correctOption);
  let awardedScore = 0;
  let reputation = null;
  if (isCorrect) {
    if (!room.currentQuestionFirstCorrectUserId) {
      room.currentQuestionFirstCorrectUserId = req.user.id;
      awardedScore = 10;
    } else {
      awardedScore = 6;
    }
    participant.score = Number(participant.score || 0) + awardedScore;
    reputation = await applyReputationDelta(req.user.id, { quizBattleXp: awardedScore });
  }

  const changed = maybeAdvanceQuizBattleRoom(room);
  await room.save();

  res.json({
    message: isCorrect ? "Correct answer submitted" : "Answer submitted",
    isCorrect,
    awardedScore,
    xpAwarded: awardedScore,
    reputationScore: reputation?.score || null,
    explanation: question.explanation || "",
    room: quizBattleRoomPayload(room, req.user.id),
    advanced: changed
  });
});

function isInstitutionTeacherProfile(profile = null) {
  return String(profile?.mentorOrgRole || "") === "institution_teacher";
}

async function getStudentIdentity(userId) {
  const [user, profile] = await Promise.all([
    User.findById(userId).select("name").lean(),
    StudentProfile.findOne({ userId }).select("institutionName collegeName className classLevel learnerStage").lean()
  ]);
  return {
    studentId: userId,
    studentName: user?.name || "Student",
    institutionName: String(profile?.institutionName || profile?.collegeName || "").trim(),
    className: String(profile?.className || profile?.classLevel || "").trim(),
    learnerStage: String(profile?.learnerStage || "").trim() || "after12"
  };
}

function canStudentJoinCompetition(competition, identity) {
  if (!competition || !identity) return false;
  if (identity.learnerStage !== "highschool") return false;
  if (competition.classLevelFilter?.length) {
    const normalizedClass = normalizeText(identity.className);
    const classAllowed = competition.classLevelFilter.some((item) => normalizeText(item) === normalizedClass);
    if (!classAllowed) return false;
  }
  if (competition.scopeType === "open_highschool") return true;
  const institutionName = normalizeText(identity.institutionName);
  if (!institutionName) return false;
  if (competition.scopeType === "institution_only") {
    return institutionName === normalizeText(competition.institutionName);
  }
  if (competition.scopeType === "multi_institution") {
    const allowed = (competition.allowedInstitutions || []).map((item) => normalizeText(item));
    if (!allowed.length) return false;
    return allowed.includes(institutionName);
  }
  return false;
}

function effectiveHighSchoolCompetitionStatus(competition, nowMs = Date.now()) {
  const storedStatus = String(competition?.status || "registration_open");
  if (storedStatus === "completed") return "completed";
  if (storedStatus === "level2_live") return "level2_live";
  if (storedStatus === "level1_closed") {
    const level2At = competition?.level2At ? new Date(competition.level2At).getTime() : 0;
    return level2At && nowMs >= level2At ? "level2_ready" : "level1_closed";
  }

  const registrationDeadline = competition?.registrationDeadline ? new Date(competition.registrationDeadline).getTime() : 0;
  const level1At = competition?.level1At ? new Date(competition.level1At).getTime() : 0;
  const level2At = competition?.level2At ? new Date(competition.level2At).getTime() : 0;

  if (registrationDeadline && nowMs <= registrationDeadline) return "registration_open";
  if (level1At && nowMs < level1At) return "registration_closed";
  if (level2At && nowMs >= level2At) return storedStatus === "level1_closed" ? "level2_ready" : "level1_closed";
  if (level1At && nowMs >= level1At) return "level1_live";
  return storedStatus;
}

function withCompetitionRuntimeFields(competition) {
  return {
    ...competition,
    status: effectiveHighSchoolCompetitionStatus(competition),
    storedStatus: competition.status
  };
}

function parseCompetitionQuestionSet(payload = [], defaultDurationSec = 30, fallbackPrefix = "Q") {
  const rows = Array.isArray(payload) ? payload : [];
  return rows
    .map((item, index) => {
      const text = String(item?.text || "").trim();
      const options = normalizeList(item?.options || []);
      const correctOption = String(item?.correctOption || "").trim();
      if (!text || options.length < 2 || !correctOption) return null;
      if (!options.some((opt) => normalizeText(opt) === normalizeText(correctOption))) return null;
      return {
        id: String(item?.id || `${fallbackPrefix}-${index + 1}`).trim(),
        text,
        options,
        correctOption,
        explanation: String(item?.explanation || "").trim(),
        durationSec: Math.max(5, Math.min(90, Number(item?.durationSec || defaultDurationSec || 30)))
      };
    })
    .filter(Boolean);
}

function gradeFromPercentage(percentage = 0) {
  if (percentage >= 90) return "A+";
  if (percentage >= 80) return "A";
  if (percentage >= 70) return "B+";
  if (percentage >= 60) return "B";
  if (percentage >= 50) return "C";
  return "D";
}

function buildCompetitionStudentReport(competition, attempt, overallRank, schoolRank) {
  return {
    competitionId: String(competition._id),
    title: competition.title,
    subject: competition.subject,
    chapter: competition.chapter || "",
    studentId: String(attempt.studentId),
    name: attempt.studentName || "Student",
    institutionName: attempt.institutionName || "",
    className: attempt.className || "",
    score: Number(attempt.score || 0),
    percentage: Number(attempt.percentage || 0),
    grade: attempt.grade || gradeFromPercentage(Number(attempt.percentage || 0)),
    strengths: normalizeList(attempt.strengths || []),
    weakAreas: normalizeList(attempt.weakAreas || []),
    recommendations: normalizeList(attempt.recommendations || []),
    rankContext: {
      overall: overallRank,
      school: schoolRank
    }
  };
}

function competitionLeaderboardRows(attempts = []) {
  const rows = attempts.map((item) => ({
    studentId: String(item.studentId),
    studentName: item.studentName || "Student",
    institutionName: item.institutionName || "",
    className: item.className || "",
    score: Number(item.score || 0),
    percentage: Number(item.percentage || 0),
    correctCount: Number(item.correctCount || 0),
    avgResponseMs:
      Number(item.totalTimeMs || 0) > 0 && Number(item.answers?.length || 0) > 0
        ? Math.round(Number(item.totalTimeMs || 0) / Number(item.answers?.length || 1))
        : 0,
    submittedAt: item.submittedAt ? new Date(item.submittedAt).toISOString() : null
  }));
  rows.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.avgResponseMs !== b.avgResponseMs) return a.avgResponseMs - b.avgResponseMs;
    return new Date(a.submittedAt || 0).getTime() - new Date(b.submittedAt || 0).getTime();
  });
  return rows.map((item, index) => ({ rank: index + 1, ...item }));
}

exports.createHighSchoolCompetition = asyncHandler(async (req, res) => {
  if (req.user.role !== "mentor") throw new ApiError(403, "Only institution teachers can create competitions");
  const mentorProfile = await MentorProfile.findOne({ userId: req.user.id }).select("mentorOrgRole institutionName").lean();
  if (!isInstitutionTeacherProfile(mentorProfile)) throw new ApiError(403, "Only institution teachers can create competitions");

  const title = String(req.body?.title || "").trim();
  const subject = String(req.body?.subject || "").trim();
  const registrationDeadline = req.body?.registrationDeadline ? new Date(req.body.registrationDeadline) : null;
  const level1At = req.body?.level1At ? new Date(req.body.level1At) : null;
  const level2At = req.body?.level2At ? new Date(req.body.level2At) : null;
  if (!title || !subject || !registrationDeadline || Number.isNaN(registrationDeadline.getTime()) || !level1At || Number.isNaN(level1At.getTime())) {
    throw new ApiError(400, "title, subject, registrationDeadline and level1At are required");
  }
  if (registrationDeadline.getTime() >= level1At.getTime()) {
    throw new ApiError(400, "Registration deadline must be before Level 1 start time");
  }
  if (level2At && !Number.isNaN(level2At.getTime()) && level2At.getTime() <= level1At.getTime()) {
    throw new ApiError(400, "Level 2 start time must be after Level 1 start time");
  }

  const scopeType = ["institution_only", "multi_institution", "open_highschool"].includes(String(req.body?.scopeType || ""))
    ? String(req.body.scopeType)
    : "institution_only";
  const allowedInstitutions = normalizeList(req.body?.allowedInstitutions || []);
  const classLevelFilter = normalizeList(req.body?.classLevelFilter || []);
  const level1TimeModeSec = [10, 30].includes(Number(req.body?.level1TimeModeSec)) ? Number(req.body.level1TimeModeSec) : 30;
  const level1QuestionCount = Math.max(5, Math.min(30, Number(req.body?.level1QuestionCount || 15)));
  const qualificationTopN = Math.max(1, Math.min(500, Number(req.body?.qualificationTopN || 20)));
  const creator = await User.findById(req.user.id).select("name").lean();

  const level1Questions = parseCompetitionQuestionSet(req.body?.level1Questions || [], level1TimeModeSec, "L1");
  const creatorInstitution = String(mentorProfile?.institutionName || "").trim();
  const selectedInstitutionName = String(req.body?.selectedInstitutionName || "").trim();
  const normalizedInstitutionName = selectedInstitutionName || creatorInstitution;
  if (scopeType === "institution_only" && !normalizedInstitutionName) {
    throw new ApiError(400, "Select an institution for institution-only competition");
  }
  if (scopeType === "multi_institution" && allowedInstitutions.length < 2) {
    throw new ApiError(400, "Inter-school competition requires at least two selected institutions");
  }

  const competition = await HighSchoolCompetition.create({
    title,
    description: String(req.body?.description || "").trim(),
    bannerImageUrl: String(req.body?.bannerImageUrl || "").trim(),
    subject,
    chapter: String(req.body?.chapter || "").trim(),
    topics: normalizeList(req.body?.topics || []),
    scopeType,
    allowedInstitutions,
    classLevelFilter,
    registrationDeadline,
    level1At,
    level2At: level2At && !Number.isNaN(level2At.getTime()) ? level2At : null,
    qualificationTopN,
    level1QuestionCount,
    level1TimeModeSec,
    level1Questions,
    status: "registration_open",
    createdBy: req.user.id,
    createdByName: creator?.name || "Teacher",
    institutionName: scopeType === "institution_only" ? normalizedInstitutionName : creatorInstitution
  });

  res.status(201).json({ message: "Competition created", competition });
});

exports.listHighSchoolCompetitions = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const role = req.user.role;
  let filter = { status: { $in: ["registration_open", "level1_live", "level1_closed", "level2_live", "completed"] } };
  if (role === "mentor") {
    const mentorProfile = await MentorProfile.findOne({ userId }).select("mentorOrgRole institutionName").lean();
    if (isInstitutionTeacherProfile(mentorProfile)) {
      filter = {
        $and: [
          filter,
          {
            $or: [
              { createdBy: userId },
              { scopeType: "open_highschool" },
              { scopeType: "multi_institution", allowedInstitutions: String(mentorProfile?.institutionName || "").trim() },
              { scopeType: "institution_only", institutionName: String(mentorProfile?.institutionName || "").trim() }
            ]
          }
        ]
      };
    }
  } else {
    const identity = await getStudentIdentity(userId);
    const all = await HighSchoolCompetition.find(filter).sort({ createdAt: -1 }).lean();
    const competitions = all
      .filter((item) => canStudentJoinCompetition(item, identity))
      .map((item) => {
        const registration = (item.registrations || []).find((reg) => String(reg.studentId) === String(userId));
        return {
          ...withCompetitionRuntimeFields(item),
          myRegistration: registration || null
        };
      });
    return res.json({ competitions });
  }

  const competitions = (await HighSchoolCompetition.find(filter).sort({ createdAt: -1 }).lean()).map(withCompetitionRuntimeFields);
  res.json({ competitions });
});

exports.deleteHighSchoolCompetition = asyncHandler(async (req, res) => {
  if (req.user.role !== "mentor") throw new ApiError(403, "Only teachers can delete competitions");
  const competitionId = String(req.params?.competitionId || "").trim();
  if (!mongoose.Types.ObjectId.isValid(competitionId)) throw new ApiError(400, "Invalid competition id");

  const competition = await HighSchoolCompetition.findById(competitionId);
  if (!competition) throw new ApiError(404, "Competition not found");
  if (String(competition.createdBy) !== String(req.user.id)) {
    throw new ApiError(403, "Only the teacher who created this championship can delete it");
  }

  await competition.deleteOne();
  res.json({ message: "Championship deleted" });
});

exports.updateHighSchoolCompetition = asyncHandler(async (req, res) => {
  if (req.user.role !== "mentor") throw new ApiError(403, "Only teachers can update competitions");
  const competitionId = String(req.params?.competitionId || "").trim();
  if (!mongoose.Types.ObjectId.isValid(competitionId)) throw new ApiError(400, "Invalid competition id");
  const competition = await HighSchoolCompetition.findById(competitionId);
  if (!competition) throw new ApiError(404, "Competition not found");
  if (String(competition.createdBy) !== String(req.user.id)) throw new ApiError(403, "Only creator teacher can update this championship");

  const registrationDeadline = req.body?.registrationDeadline ? new Date(req.body.registrationDeadline) : new Date(competition.registrationDeadline);
  const level1At = req.body?.level1At ? new Date(req.body.level1At) : new Date(competition.level1At);
  const level2At = req.body?.level2At ? new Date(req.body.level2At) : competition.level2At ? new Date(competition.level2At) : null;
  if (Number.isNaN(registrationDeadline.getTime()) || Number.isNaN(level1At.getTime()) || (level2At && Number.isNaN(level2At.getTime()))) {
    throw new ApiError(400, "Invalid schedule");
  }
  if (registrationDeadline.getTime() >= level1At.getTime()) {
    throw new ApiError(400, "Registration deadline must be before Level 1 start time");
  }
  if (level2At && level2At.getTime() <= level1At.getTime()) {
    throw new ApiError(400, "Level 2 start time must be after Level 1 start time");
  }

  competition.registrationDeadline = registrationDeadline;
  competition.level1At = level1At;
  competition.level2At = level2At;
  competition.title = String(req.body?.title || competition.title || "").trim() || competition.title;
  competition.subject = String(req.body?.subject || competition.subject || "").trim() || competition.subject;
  competition.chapter = String(req.body?.chapter || competition.chapter || "").trim();
  competition.description = String(req.body?.description || competition.description || "").trim();
  competition.bannerImageUrl = String(req.body?.bannerImageUrl || competition.bannerImageUrl || "").trim();
  competition.qualificationTopN = Math.max(1, Math.min(500, Number(req.body?.qualificationTopN || competition.qualificationTopN || 20)));
  competition.level1QuestionCount = Math.max(5, Math.min(30, Number(req.body?.level1QuestionCount || competition.level1QuestionCount || 15)));
  competition.level1TimeModeSec = [10, 30].includes(Number(req.body?.level1TimeModeSec))
    ? Number(req.body.level1TimeModeSec)
    : Number(competition.level1TimeModeSec || 30);
  await competition.save();

  res.json({ message: "Championship updated", competition: withCompetitionRuntimeFields(competition.toObject()) });
});

exports.updateHighSchoolCompetitionLevel1Questions = asyncHandler(async (req, res) => {
  if (req.user.role !== "mentor") throw new ApiError(403, "Only teachers can update questions");
  const competitionId = String(req.params?.competitionId || "").trim();
  if (!mongoose.Types.ObjectId.isValid(competitionId)) throw new ApiError(400, "Invalid competition id");

  const competition = await HighSchoolCompetition.findById(competitionId);
  if (!competition) throw new ApiError(404, "Competition not found");
  if (String(competition.createdBy) !== String(req.user.id)) {
    throw new ApiError(403, "Only creator teacher can update questions");
  }
  if ((competition.attempts || []).some((item) => Number(item.level) === 1)) {
    throw new ApiError(400, "Level 1 already has student attempts. Questions cannot be changed now.");
  }

  const questionSet = parseCompetitionQuestionSet(
    req.body?.questions || [],
    Number(competition.level1TimeModeSec || 30),
    "L1"
  );
  const expectedCount = Math.max(5, Number(competition.level1QuestionCount || 5));
  if (questionSet.length < expectedCount) {
    throw new ApiError(400, `Add ${expectedCount} valid Level 1 questions before saving.`);
  }

  competition.level1Questions = questionSet.slice(0, expectedCount);
  await competition.save();

  res.json({
    message: "Level 1 questions saved",
    questionCount: competition.level1Questions.length,
    competition: withCompetitionRuntimeFields(competition.toObject())
  });
});

exports.generateHighSchoolCompetitionQuestionDraft = asyncHandler(async (req, res) => {
  if (req.user.role !== "mentor") throw new ApiError(403, "Only teachers can generate question drafts");
  const mentorProfile = await MentorProfile.findOne({ userId: req.user.id }).select("mentorOrgRole").lean();
  if (!isInstitutionTeacherProfile(mentorProfile)) throw new ApiError(403, "Only institution teachers can generate drafts");
  const subject = String(req.body?.subject || "").trim();
  const topic = String(req.body?.topic || req.body?.chapter || "").trim();
  const level = String(req.body?.level || "L1").trim().toUpperCase();
  const questionCount = Math.max(5, Math.min(30, Number(req.body?.questionCount || 15)));
  const durationSec = [10, 30].includes(Number(req.body?.durationSec)) ? Number(req.body.durationSec) : 30;
  if (!subject) throw new ApiError(400, "subject is required");

  const generated = buildQuizBattleQuestionSet({ subject, topic })
    .slice(0, questionCount)
    .map((item, index) => ({
      id: `${level}-${index + 1}`,
      text: item.question,
      options: item.options,
      correctOption: item.correctOption || item.correct || item.options?.[0] || "",
      explanation: item.explanation || "",
      durationSec
    }));

  if (!generated.length) throw new ApiError(400, "Unable to generate draft questions");
  res.json({ questions: generated });
});

exports.registerHighSchoolCompetition = asyncHandler(async (req, res) => {
  if (req.user.role !== "student") throw new ApiError(403, "Only students can register");
  const competitionId = String(req.params?.competitionId || "").trim();
  if (!mongoose.Types.ObjectId.isValid(competitionId)) throw new ApiError(400, "Invalid competition id");
  const competition = await HighSchoolCompetition.findById(competitionId);
  if (!competition) throw new ApiError(404, "Competition not found");
  const nowMs = Date.now();
  if (effectiveHighSchoolCompetitionStatus(competition, nowMs) !== "registration_open") throw new ApiError(400, "Registration is closed");
  if (new Date(competition.registrationDeadline).getTime() < nowMs) throw new ApiError(400, "Registration deadline is over");

  const identity = await getStudentIdentity(req.user.id);
  if (!canStudentJoinCompetition(competition, identity)) throw new ApiError(403, "You are not eligible for this competition");
  const exists = (competition.registrations || []).some((item) => String(item.studentId) === String(req.user.id));
  if (exists) return res.json({ message: "Already registered" });

  competition.registrations.push({
    studentId: req.user.id,
    studentName: identity.studentName,
    institutionName: identity.institutionName,
    className: identity.className,
    status: "registered",
    qualifiedForLevel2: false,
    level2BatchIndex: -1
  });
  await competition.save();
  res.json({ message: "Registered successfully" });
});

exports.submitHighSchoolCompetitionLevel1 = asyncHandler(async (req, res) => {
  if (req.user.role !== "student") throw new ApiError(403, "Only students can submit Level 1");
  const competitionId = String(req.params?.competitionId || "").trim();
  if (!mongoose.Types.ObjectId.isValid(competitionId)) throw new ApiError(400, "Invalid competition id");
  const competition = await HighSchoolCompetition.findById(competitionId);
  if (!competition) throw new ApiError(404, "Competition not found");
  const nowMs = Date.now();
  const level1AtMs = new Date(competition.level1At).getTime();
  const level2AtMs = competition.level2At ? new Date(competition.level2At).getTime() : 0;
  if (Number.isFinite(level1AtMs) && nowMs < level1AtMs) {
    throw new ApiError(400, `Level 1 opens at ${new Date(competition.level1At).toLocaleString("en-IN")}`);
  }
  if (level2AtMs && nowMs >= level2AtMs) {
    throw new ApiError(400, "Level 1 window is closed");
  }
  const registration = (competition.registrations || []).find((item) => String(item.studentId) === String(req.user.id));
  if (!registration) throw new ApiError(400, "Register first");

  const questions = (competition.level1Questions || []).length
    ? competition.level1Questions
    : buildQuizBattleQuestionSet({ subject: competition.subject, topic: competition.chapter }).map((item) => ({
        ...item,
        durationSec: competition.level1TimeModeSec || 30
      }));
  if (!questions.length) throw new ApiError(400, "No Level 1 questions configured");

  const answers = Array.isArray(req.body?.answers) ? req.body.answers : [];
  const answerLogs = [];
  let score = 0;
  let correctCount = 0;
  let totalTimeMs = 0;
  const strengths = [];
  const weakAreas = [];

  questions.forEach((question, index) => {
    const given = answers[index] || {};
    const selectedOption = String(given?.selectedOption || "").trim();
    const responseMs = Math.max(0, Number(given?.responseMs || 0));
    totalTimeMs += responseMs;
    const isCorrect = normalizeText(selectedOption) === normalizeText(question.correctOption);
    if (isCorrect) {
      correctCount += 1;
      const secBudget = Number(question.durationSec || competition.level1TimeModeSec || 30);
      const speedBonus = responseMs > 0 ? Math.max(0, Math.round((secBudget * 1000 - responseMs) / 1000)) : 0;
      score += 10 + speedBonus;
      strengths.push(question.id || `Q${index + 1}`);
    } else {
      weakAreas.push(question.id || `Q${index + 1}`);
    }
    answerLogs.push({
      questionId: String(question.id || `Q${index + 1}`),
      selectedOption,
      isCorrect,
      responseMs
    });
  });

  const percentage = questions.length ? Math.round((correctCount / questions.length) * 100) : 0;
  const grade = gradeFromPercentage(percentage);
  const existingIdx = (competition.attempts || []).findIndex(
    (item) => String(item.studentId) === String(req.user.id) && Number(item.level) === 1
  );
  const payload = {
    studentId: req.user.id,
    studentName: registration.studentName,
    institutionName: registration.institutionName,
    className: registration.className,
    level: 1,
    batchIndex: -1,
    score,
    correctCount,
    totalTimeMs,
    percentage,
    grade,
    strengths: normalizeList(strengths.slice(0, 6)),
    weakAreas: normalizeList(weakAreas.slice(0, 6)),
    recommendations: [
      "Review weak topics and retry with timed practice.",
      "Attempt mentor-guided revision for low-speed questions.",
      "Focus on conceptual accuracy before speed."
    ],
    answers: answerLogs,
    submittedAt: new Date()
  };

  if (existingIdx >= 0) competition.attempts[existingIdx] = payload;
  else competition.attempts.push(payload);
  if (competition.status === "registration_open") competition.status = "level1_live";
  await competition.save();

  res.json({
    message: "Level 1 submitted",
    score,
    percentage,
    grade
  });
});

exports.finalizeHighSchoolCompetitionLevel1 = asyncHandler(async (req, res) => {
  if (req.user.role !== "mentor") throw new ApiError(403, "Only institution teachers can finalize");
  const mentorProfile = await MentorProfile.findOne({ userId: req.user.id }).select("mentorOrgRole").lean();
  if (!isInstitutionTeacherProfile(mentorProfile)) throw new ApiError(403, "Only institution teachers can finalize");
  const competitionId = String(req.params?.competitionId || "").trim();
  if (!mongoose.Types.ObjectId.isValid(competitionId)) throw new ApiError(400, "Invalid competition id");
  const competition = await HighSchoolCompetition.findById(competitionId);
  if (!competition) throw new ApiError(404, "Competition not found");
  if (String(competition.createdBy) !== String(req.user.id)) throw new ApiError(403, "Only creator teacher can finalize");

  const rows = competitionLeaderboardRows((competition.attempts || []).filter((item) => Number(item.level) === 1));
  const topN = Math.max(1, Number(competition.qualificationTopN || 20));
  const qualifiedIds = new Set(rows.slice(0, topN).map((item) => String(item.studentId)));

  competition.registrations = (competition.registrations || []).map((reg) => ({
    ...reg,
    qualifiedForLevel2: qualifiedIds.has(String(reg.studentId)),
    status: qualifiedIds.has(String(reg.studentId)) ? "qualified_level2" : "eliminated"
  }));
  competition.status = "level1_closed";
  await competition.save();
  res.json({ message: "Level 1 finalized", qualifiedCount: qualifiedIds.size, totalAttempted: rows.length });
});

exports.createHighSchoolCompetitionLevel2Batches = asyncHandler(async (req, res) => {
  if (req.user.role !== "mentor") throw new ApiError(403, "Only institution teachers can create batches");
  const mentorProfile = await MentorProfile.findOne({ userId: req.user.id }).select("mentorOrgRole").lean();
  if (!isInstitutionTeacherProfile(mentorProfile)) throw new ApiError(403, "Only institution teachers can create batches");
  const competitionId = String(req.params?.competitionId || "").trim();
  if (!mongoose.Types.ObjectId.isValid(competitionId)) throw new ApiError(400, "Invalid competition id");
  const competition = await HighSchoolCompetition.findById(competitionId);
  if (!competition) throw new ApiError(404, "Competition not found");
  const level2AtMs = competition.level2At ? new Date(competition.level2At).getTime() : 0;
  if (level2AtMs && Date.now() < level2AtMs) {
    throw new ApiError(400, `Level 2 opens at ${new Date(competition.level2At).toLocaleString("en-IN")}`);
  }
  if (String(competition.createdBy) !== String(req.user.id)) throw new ApiError(403, "Only creator teacher can create batches");

  const qualified = (competition.registrations || []).filter((item) => item.qualifiedForLevel2);
  if (!qualified.length) throw new ApiError(400, "No qualified students for Level 2");
  const questionSetsPayload = Array.isArray(req.body?.questionSets) ? req.body.questionSets : [];
  const questionSets = questionSetsPayload
    .map((set, setIndex) => parseCompetitionQuestionSet(set?.questions || [], 30, `L2-${setIndex + 1}`))
    .filter((set) => set.length > 0);
  if (!questionSets.length) throw new ApiError(400, "At least one Level 2 question set is required");

  const batches = [];
  for (let i = 0; i < qualified.length; i += 10) {
    const members = qualified.slice(i, i + 10);
    const set = questionSets[batches.length % questionSets.length];
    batches.push({
      index: batches.length,
      label: `Batch ${batches.length + 1}`,
      status: "waiting",
      participants: members.map((item) => ({
        studentId: item.studentId,
        studentName: item.studentName,
        institutionName: item.institutionName,
        className: item.className,
        score: 0,
        avgResponseMs: 0,
        totalResponseMs: 0,
        answeredCount: 0,
        lastAnsweredAt: null
      })),
      questionSet: set,
      currentQuestionIndex: 0,
      questionStartedAt: null,
      currentQuestionAnsweredUserIds: [],
      currentQuestionFirstCorrectUserId: null,
      winnerStudentId: null
    });
  }
  competition.level2Batches = batches;
  competition.registrations = (competition.registrations || []).map((reg) => {
    const batchIndex = batches.findIndex((batch) =>
      (batch.participants || []).some((member) => String(member.studentId) === String(reg.studentId))
    );
    return {
      ...reg,
      level2BatchIndex: batchIndex
    };
  });
  competition.status = "level2_live";
  await competition.save();
  res.json({ message: "Level 2 batches created", batchesCount: batches.length });
});

function competitionBatchPayload(competition, batchIndex, viewerId) {
  const batch = competition.level2Batches?.[batchIndex];
  if (!batch) return null;
  const question = batch.questionSet?.[batch.currentQuestionIndex] || null;
  const leaderboard = [...(batch.participants || [])]
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return Number(a.avgResponseMs || 0) - Number(b.avgResponseMs || 0);
    })
    .map((row, index) => ({
      rank: index + 1,
      studentId: String(row.studentId),
      studentName: row.studentName,
      institutionName: row.institutionName,
      className: row.className,
      score: Number(row.score || 0),
      avgResponseMs: Number(row.avgResponseMs || 0)
    }));
  return {
    competitionId: String(competition._id),
    title: competition.title,
    batchIndex,
    label: batch.label || `Batch ${batchIndex + 1}`,
    status: batch.status,
    questionIndex: Number(batch.currentQuestionIndex || 0),
    totalQuestions: (batch.questionSet || []).length,
    question: question
      ? {
          id: question.id,
          text: question.text,
          options: question.options,
          durationSec: question.durationSec,
          startedAt: batch.questionStartedAt
        }
      : null,
    leaderboard,
    me: leaderboard.find((row) => String(row.studentId) === String(viewerId)) || null
  };
}

function maybeAdvanceCompetitionBatch(batch) {
  if (!batch || batch.status !== "live") return false;
  const question = batch.questionSet?.[batch.currentQuestionIndex];
  if (!question) {
    batch.status = "completed";
    return true;
  }
  const durationSec = Number(question.durationSec || 30);
  const startedAt = batch.questionStartedAt ? new Date(batch.questionStartedAt).getTime() : 0;
  const elapsed = (Date.now() - startedAt) / 1000;
  const answeredCount = (batch.currentQuestionAnsweredUserIds || []).length;
  const participantsCount = (batch.participants || []).length;
  if (elapsed < durationSec && answeredCount < participantsCount) return false;
  batch.currentQuestionIndex += 1;
  batch.currentQuestionAnsweredUserIds = [];
  batch.currentQuestionFirstCorrectUserId = null;
  if (batch.currentQuestionIndex >= (batch.questionSet || []).length) {
    batch.status = "completed";
    const winner = [...(batch.participants || [])].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return Number(a.avgResponseMs || 0) - Number(b.avgResponseMs || 0);
    })[0];
    batch.winnerStudentId = winner?.studentId || null;
    return true;
  }
  batch.questionStartedAt = new Date();
  return true;
}

exports.joinHighSchoolCompetitionLevel2Batch = asyncHandler(async (req, res) => {
  if (req.user.role !== "student") throw new ApiError(403, "Only students can join Level 2 batch");
  const competitionId = String(req.params?.competitionId || "").trim();
  const batchIndex = Number(req.params?.batchIndex);
  if (!mongoose.Types.ObjectId.isValid(competitionId) || Number.isNaN(batchIndex)) throw new ApiError(400, "Invalid params");
  const competition = await HighSchoolCompetition.findById(competitionId);
  if (!competition) throw new ApiError(404, "Competition not found");
  const level2AtMs = competition.level2At ? new Date(competition.level2At).getTime() : 0;
  if (level2AtMs && Date.now() < level2AtMs) {
    throw new ApiError(400, `Level 2 opens at ${new Date(competition.level2At).toLocaleString("en-IN")}`);
  }
  const batch = competition.level2Batches?.[batchIndex];
  if (!batch) throw new ApiError(404, "Batch not found");
  const member = (batch.participants || []).find((item) => String(item.studentId) === String(req.user.id));
  if (!member) throw new ApiError(403, "You are not part of this batch");
  if (batch.status === "waiting") {
    batch.status = "live";
    if (!batch.questionStartedAt) batch.questionStartedAt = new Date();
    await competition.save();
  }
  res.json({ room: competitionBatchPayload(competition, batchIndex, req.user.id) });
});

exports.getHighSchoolCompetitionLevel2BatchState = asyncHandler(async (req, res) => {
  const competitionId = String(req.params?.competitionId || "").trim();
  const batchIndex = Number(req.params?.batchIndex);
  if (!mongoose.Types.ObjectId.isValid(competitionId) || Number.isNaN(batchIndex)) throw new ApiError(400, "Invalid params");
  const competition = await HighSchoolCompetition.findById(competitionId);
  if (!competition) throw new ApiError(404, "Competition not found");
  const level2AtMs = competition.level2At ? new Date(competition.level2At).getTime() : 0;
  if (level2AtMs && Date.now() < level2AtMs && req.user.role !== "mentor") {
    throw new ApiError(400, `Level 2 opens at ${new Date(competition.level2At).toLocaleString("en-IN")}`);
  }
  const batch = competition.level2Batches?.[batchIndex];
  if (!batch) throw new ApiError(404, "Batch not found");
  const member = (batch.participants || []).find((item) => String(item.studentId) === String(req.user.id));
  if (!member && req.user.role !== "mentor") throw new ApiError(403, "Not allowed");
  const changed = maybeAdvanceCompetitionBatch(batch);
  if (changed) await competition.save();
  res.json(competitionBatchPayload(competition, batchIndex, req.user.id));
});

exports.submitHighSchoolCompetitionLevel2BatchAnswer = asyncHandler(async (req, res) => {
  if (req.user.role !== "student") throw new ApiError(403, "Only students can answer");
  const competitionId = String(req.params?.competitionId || "").trim();
  const batchIndex = Number(req.params?.batchIndex);
  if (!mongoose.Types.ObjectId.isValid(competitionId) || Number.isNaN(batchIndex)) throw new ApiError(400, "Invalid params");
  const selectedOption = String(req.body?.selectedOption || "").trim();
  const responseMs = Math.max(0, Number(req.body?.responseMs || 0));
  if (!selectedOption) throw new ApiError(400, "selectedOption is required");

  const competition = await HighSchoolCompetition.findById(competitionId);
  if (!competition) throw new ApiError(404, "Competition not found");
  const level2AtMs = competition.level2At ? new Date(competition.level2At).getTime() : 0;
  if (level2AtMs && Date.now() < level2AtMs) {
    throw new ApiError(400, `Level 2 opens at ${new Date(competition.level2At).toLocaleString("en-IN")}`);
  }
  const batch = competition.level2Batches?.[batchIndex];
  if (!batch) throw new ApiError(404, "Batch not found");
  if (batch.status !== "live") throw new ApiError(400, "Batch is not live");
  const participant = (batch.participants || []).find((item) => String(item.studentId) === String(req.user.id));
  if (!participant) throw new ApiError(403, "You are not part of this batch");
  const question = batch.questionSet?.[batch.currentQuestionIndex];
  if (!question) throw new ApiError(400, "No active question");
  const alreadyAnswered = (batch.currentQuestionAnsweredUserIds || []).some((item) => String(item) === String(req.user.id));
  if (alreadyAnswered) throw new ApiError(400, "You already answered this question");

  batch.currentQuestionAnsweredUserIds.push(req.user.id);
  participant.answeredCount = Number(participant.answeredCount || 0) + 1;
  participant.totalResponseMs = Number(participant.totalResponseMs || 0) + responseMs;
  participant.avgResponseMs = Math.round(participant.totalResponseMs / Math.max(1, participant.answeredCount));
  participant.lastAnsweredAt = new Date();

  const isCorrect = normalizeText(selectedOption) === normalizeText(question.correctOption);
  let awardedScore = 0;
  if (isCorrect) {
    if (!batch.currentQuestionFirstCorrectUserId) {
      batch.currentQuestionFirstCorrectUserId = req.user.id;
      awardedScore = 10;
    } else {
      awardedScore = 6;
    }
    participant.score = Number(participant.score || 0) + awardedScore;
  }

  const changed = maybeAdvanceCompetitionBatch(batch);
  if (changed && batch.status === "completed") {
    const winner = (batch.participants || [])
      .slice()
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return Number(a.avgResponseMs || 0) - Number(b.avgResponseMs || 0);
      })[0];
    if (winner) {
      const reg = (competition.registrations || []).find((item) => String(item.studentId) === String(winner.studentId));
      if (reg) reg.status = "winner";
    }
  }
  await competition.save();

  res.json({
    isCorrect,
    awardedScore,
    explanation: question.explanation || "",
    room: competitionBatchPayload(competition, batchIndex, req.user.id)
  });
});

exports.getHighSchoolCompetitionReports = asyncHandler(async (req, res) => {
  if (req.user.role !== "mentor") throw new ApiError(403, "Only teachers can view reports");
  const mentorProfile = await MentorProfile.findOne({ userId: req.user.id }).select("mentorOrgRole").lean();
  if (!isInstitutionTeacherProfile(mentorProfile)) throw new ApiError(403, "Only institution teachers can view reports");
  const competitionId = String(req.params?.competitionId || "").trim();
  if (!mongoose.Types.ObjectId.isValid(competitionId)) throw new ApiError(400, "Invalid competition id");
  const competition = await HighSchoolCompetition.findById(competitionId).lean();
  if (!competition) throw new ApiError(404, "Competition not found");
  if (String(competition.createdBy) !== String(req.user.id)) throw new ApiError(403, "Only creator teacher can view reports");

  const level1Attempts = (competition.attempts || []).filter((item) => Number(item.level) === 1);
  const overallLeaderboard = competitionLeaderboardRows(level1Attempts);

  const institutionBuckets = new Map();
  overallLeaderboard.forEach((row) => {
    const key = row.institutionName || "Unknown Institution";
    if (!institutionBuckets.has(key)) institutionBuckets.set(key, []);
    institutionBuckets.get(key).push(row);
  });
  const institutionLeaderboard = [...institutionBuckets.entries()]
    .map(([institutionName, rows]) => {
      const totalScore = rows.reduce((sum, item) => sum + Number(item.score || 0), 0);
      const avgScore = rows.length ? Math.round(totalScore / rows.length) : 0;
      return {
        institutionName,
        participants: rows.length,
        totalScore,
        avgScore,
        topStudent: rows[0]?.studentName || ""
      };
    })
    .sort((a, b) => {
      if (b.avgScore !== a.avgScore) return b.avgScore - a.avgScore;
      return b.totalScore - a.totalScore;
    })
    .map((row, index) => ({ rank: index + 1, ...row }));

  const institutionBreakdown = institutionLeaderboard.map((inst) => {
    const rows = institutionBuckets.get(inst.institutionName) || [];
    return {
      institutionName: inst.institutionName,
      schoolRank: inst.rank,
      topPerformers: rows.slice(0, 5).map((item) => ({
        studentId: item.studentId,
        studentName: item.studentName,
        className: item.className,
        score: item.score,
        overallRank: item.rank
      })),
      subjectPerformance: {
        subject: competition.subject,
        avgScore: inst.avgScore,
        participants: rows.length
      },
      overallAnalysis: rows.length
        ? `Average score ${inst.avgScore}. ${rows.length} participants from ${inst.institutionName}.`
        : "No submissions yet."
    };
  });

  const schoolRankMap = new Map(institutionLeaderboard.map((item) => [item.institutionName, item.rank]));
  const studentReports = overallLeaderboard.map((row) => {
    const attempt = level1Attempts.find((item) => String(item.studentId) === String(row.studentId));
    return buildCompetitionStudentReport(
      competition,
      attempt || {
        studentId: row.studentId,
        studentName: row.studentName,
        institutionName: row.institutionName,
        className: row.className,
        score: row.score,
        percentage: row.percentage,
        grade: gradeFromPercentage(row.percentage),
        strengths: [],
        weakAreas: [],
        recommendations: []
      },
      row.rank,
      schoolRankMap.get(row.institutionName || "Unknown Institution") || null
    );
  });

  const qualifiedCount = (competition.registrations || []).filter((item) => item.qualifiedForLevel2).length;
  const winnersCount = (competition.registrations || []).filter((item) => item.status === "winner").length;

  res.json({
    competition: {
      id: String(competition._id),
      title: competition.title,
      subject: competition.subject,
      chapter: competition.chapter || "",
      scopeType: competition.scopeType
    },
    overallLeaderboard,
    institutionLeaderboard,
    institutionBreakdown,
    studentReports,
    qualificationFunnel: {
      registered: (competition.registrations || []).length,
      level1Attempted: level1Attempts.length,
      level2Qualified: qualifiedCount,
      winners: winnersCount
    }
  });
});

exports.getProjectIdeas = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const [profile, journeyState] = await Promise.all([
    StudentProfile.findOne({ userId }).select("careerGoals skills").lean(),
    getJourneyState(userId, req.user.role || "student")
  ]);
  const user = await User.findById(userId).select("goals primaryCategory").lean();
  const domainOverride = String(req.query.domain || "").trim();
  const levelOverride = String(req.query.level || "").trim();
  const ctx = resolveAiDomainContext({
    user,
    primaryCategory: req.query.primaryCategory || domainOverride || req.query.domain || journeyState?.goal?.domain,
    subCategory: req.query.subCategory || req.query.subDomain || journeyState?.goal?.subDomain,
    focus: req.query.focus || req.query.specialization || journeyState?.goal?.focus
  });
  const goal = String(
    req.query.goal || journeyState?.goal?.title || ctx.goalLabel || profile?.careerGoals || user?.goals || user?.primaryCategory || "Career Growth"
  );
  const difficulty =
    normalizeText(levelOverride || journeyState?.skillProfile?.level) === "beginner"
      ? "Easy"
      : normalizeText(levelOverride || journeyState?.skillProfile?.level) === "advanced"
        ? "Hard"
        : "Medium";
  const currentStep = getJourneyCurrentRoadmapStep(journeyState);
  const roadmapCtx = {
    primaryCategory: journeyState?.goal?.domain || ctx.primaryCategory,
    subCategory: journeyState?.goal?.subDomain || ctx.subCategory,
    focus: journeyState?.goal?.focus || ctx.focus
  };
  const roadmapGoal = String(journeyState?.goal?.title || profile?.careerGoals || user?.goals || goal).trim() || goal;
  const roadmapTemplate = getAiTemplate(roadmapCtx.primaryCategory, roadmapCtx.subCategory, roadmapCtx.focus);
  const domainTemplate = getAiTemplate(ctx.primaryCategory, ctx.subCategory, ctx.focus);
  const roadmapIdeas = getJourneyProjectIdeas({
    goal: roadmapGoal,
    ctx: roadmapCtx,
    journeyState,
    fallbackIdeas: roadmapTemplate?.projects?.length ? roadmapTemplate.projects : getProjectIdeasForGoal(roadmapGoal)
  });
  const domainIdeas = normalizeList(domainTemplate?.projects?.length ? domainTemplate.projects : getProjectIdeasForGoal(goal)).slice(0, 8);
  const projectItems = Array.isArray(journeyState?.projects?.items) ? journeyState.projects.items : [];
  const projectMap = new Map(projectItems.map((item) => [String(item?.key || "").trim(), item]));
  const roadmapFocusTokens = uniqueTokens([
    roadmapGoal,
    currentStep?.title,
    ...(journeyState?.skillProfile?.missingSkills || []),
    ...(journeyState?.recommendations?.feedTags || [])
  ]);
  const domainFocusTokens = uniqueTokens([
    goal,
    ctx.primaryCategory,
    ctx.subCategory,
    ctx.focus,
    ...(journeyState?.skillProfile?.knownSkills || []).slice(0, 4),
    ...(journeyState?.skillProfile?.missingSkills || []).slice(0, 4),
    ...(journeyState?.recommendations?.feedTags || [])
  ]);

  const roadmapCards = roadmapIdeas.map((title, index) =>
    buildProjectIdeaCard({
      title,
      index,
      difficulty,
      ctx: roadmapCtx,
      journeyState,
      projectMap,
      focusTokens: roadmapFocusTokens,
      stageLabel: currentStep?.title || "Current Roadmap Step",
      whyMatched: `Fits your current roadmap step in ${roadmapCtx.focus || roadmapCtx.subCategory || roadmapCtx.primaryCategory || roadmapGoal}`,
      whyFallback: `Good next build for your current roadmap path: ${roadmapGoal}`
    })
  );
  const domainCards = domainIdeas.map((title, index) =>
    buildProjectIdeaCard({
      title,
      index,
      difficulty,
      ctx,
      journeyState,
      projectMap,
      focusTokens: domainFocusTokens,
      stageLabel: ctx.focus || ctx.subCategory || ctx.primaryCategory || "Selected Domain",
      whyMatched: `Matches your selected domain: ${ctx.focus || ctx.subCategory || ctx.primaryCategory || goal}`,
      whyFallback: `Good domain-based idea for ${goal}`
    })
  );

  res.json({
    goal,
    domainContext: ctx,
    domain: domainOverride || journeyState?.goal?.domain || user?.primaryCategory || ctx.primaryCategory || "",
    level: levelOverride || journeyState?.skillProfile?.level || "",
    journey: {
      currentStep: currentStep?.title || "",
      readinessScore: Number(journeyState?.skillProfile?.readinessScore || 0),
      focusLabel: ctx.focus || ctx.subCategory || ctx.primaryCategory || goal,
      personalizationReason: currentStep?.title
        ? `Built for your current roadmap step: ${currentStep.title}`
        : `Built around your goal: ${goal}`
    },
    roadmapIdeas: roadmapCards,
    domainIdeas: domainCards,
    ideas: roadmapCards
  });
});

exports.startProjectIdea = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const projectKey = String(req.params?.projectKey || "").trim();
  const title = String(req.body?.title || "").trim();
  if (!projectKey || !title) throw new ApiError(400, "Project key and title are required");

  const state = await getJourneyState(userId, req.user.role);
  const ctx = {
    primaryCategory: state?.goal?.domain || "",
    subCategory: state?.goal?.subDomain || "",
    focus: state?.goal?.focus || ""
  };
  const items = Array.isArray(state?.projects?.items) ? [...state.projects.items] : [];
  const existingIndex = items.findIndex((item) => String(item?.key || "") === projectKey);
  const project = normalizeProjectIdeaState(items[existingIndex], title, buildProjectIdeaTasks(title, ctx, state));

  project.key = projectKey;
  project.title = title;
  project.status = project.completedAt ? "completed" : "active";
  project.updatedAt = new Date();

  if (existingIndex >= 0) items[existingIndex] = project;
  else items.push(project);

  state.projects = {
    ...state.projects?.toObject?.() || state.projects,
    items,
    activeProjectIds: normalizeList([...(state.projects?.activeProjectIds || []), projectKey]),
    currentProjectStage: project.tasks.find((task) => !task.done)?.title || "Execution",
    updatedAt: new Date()
  };
  await state.save();

  res.json({ message: "Project started", project });
});

exports.toggleProjectIdeaTask = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const projectKey = String(req.params?.projectKey || "").trim();
  const taskId = String(req.body?.taskId || "").trim();
  const title = String(req.body?.title || "").trim();
  if (!projectKey || !taskId || !title) throw new ApiError(400, "Project key, title, and task id are required");

  const state = await getJourneyState(userId, req.user.role);
  const ctx = {
    primaryCategory: state?.goal?.domain || "",
    subCategory: state?.goal?.subDomain || "",
    focus: state?.goal?.focus || ""
  };
  const items = Array.isArray(state?.projects?.items) ? [...state.projects.items] : [];
  const existingIndex = items.findIndex((item) => String(item?.key || "") === projectKey);
  const project = normalizeProjectIdeaState(items[existingIndex], title, buildProjectIdeaTasks(title, ctx, state));

  if (!project.tasks.some((task) => task.id === taskId)) throw new ApiError(404, "Project task not found");

  project.key = projectKey;
  project.title = title;
  project.tasks = project.tasks.map((task) => (task.id === taskId ? { ...task, done: !task.done } : task));
  project.status = project.tasks.some((task) => task.done) ? "active" : "not_started";
  if (project.completedAt && !project.tasks.every((task) => task.done)) {
    project.completedAt = null;
    project.proofStatus = "not_submitted";
    project.proofSubmittedAt = null;
  }
  project.updatedAt = new Date();

  if (existingIndex >= 0) items[existingIndex] = project;
  else items.push(project);

  state.projects = {
    ...state.projects?.toObject?.() || state.projects,
    items,
    activeProjectIds: normalizeList([
      ...(state.projects?.activeProjectIds || []),
      ...(project.tasks.some((task) => task.done) ? [projectKey] : [])
    ]),
    currentProjectStage: project.tasks.find((task) => !task.done)?.title || "Execution",
    updatedAt: new Date()
  };
  await state.save();

  res.json({
    message: "Project task updated",
    project,
    progressPercent: project.tasks.length ? Math.round((project.tasks.filter((task) => task.done).length / project.tasks.length) * 100) : 0
  });
});

exports.submitProjectIdeaProof = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const projectKey = String(req.params?.projectKey || "").trim();
  const title = String(req.body?.title || "").trim();
  const proofNote = String(req.body?.proofNote || "").trim();
  const proofLink = String(req.body?.proofLink || "").trim();
  const proofImageUrl = String(req.body?.proofImageUrl || "").trim();
  if (!projectKey || !title) throw new ApiError(400, "Project key and title are required");
  if (!proofNote && !proofLink && !proofImageUrl) throw new ApiError(400, "Add proof before submitting this project");

  const state = await getJourneyState(userId, req.user.role);
  const ctx = {
    primaryCategory: state?.goal?.domain || "",
    subCategory: state?.goal?.subDomain || "",
    focus: state?.goal?.focus || ""
  };
  const items = Array.isArray(state?.projects?.items) ? [...state.projects.items] : [];
  const existingIndex = items.findIndex((item) => String(item?.key || "") === projectKey);
  const project = normalizeProjectIdeaState(items[existingIndex], title, buildProjectIdeaTasks(title, ctx, state));

  if (!project.tasks.length || !project.tasks.every((task) => task.done)) {
    throw new ApiError(400, "Complete every project task before submitting proof");
  }

  const now = new Date();
  project.key = projectKey;
  project.title = title;
  project.status = "completed";
  project.proofStatus = "approved";
  project.proofNote = proofNote;
  project.proofLink = proofLink;
  project.proofImageUrl = proofImageUrl;
  project.proofSubmittedAt = now;
  project.completedAt = now;
  project.updatedAt = now;

  if (existingIndex >= 0) items[existingIndex] = project;
  else items.push(project);

  state.projects = {
    ...state.projects?.toObject?.() || state.projects,
    items,
    activeProjectIds: normalizeList((state.projects?.activeProjectIds || []).filter((item) => item !== projectKey)),
    completedProjectIds: normalizeList([...(state.projects?.completedProjectIds || []), projectKey]),
    currentProjectStage: "",
    updatedAt: now
  };
  await state.save();

  res.json({ message: "Project proof submitted successfully", project });
});

exports.getKnowledgeLibrary = asyncHandler(async (req, res) => {
  const queryDomain = String(req.query.domain || "").trim();
  const journeyState = await getJourneyState(req.user.id, req.user.role || "student");
  const currentStep = getJourneyCurrentRoadmapStep(journeyState);
  const derivedDomain = queryDomain || journeyState?.goal?.domain || "";
  const goal = String(journeyState?.goal?.title || journeyState?.goal?.domain || "Career Growth").trim();
  const roadmapRecommendationTokens = [
    goal,
    derivedDomain,
    journeyState?.goal?.subDomain,
    journeyState?.goal?.focus,
    currentStep?.title,
    ...(journeyState?.skillProfile?.missingSkills || []),
    ...(journeyState?.recommendations?.feedTags || [])
  ]
    .flatMap((item) => tokenize(item))
    .filter(Boolean);
  const domainRecommendationTokens = [
    goal,
    derivedDomain,
    journeyState?.goal?.subDomain,
    journeyState?.goal?.focus,
    ...(journeyState?.skillProfile?.knownSkills || []).slice(0, 4),
    ...(journeyState?.recommendations?.feedTags || [])
  ]
    .flatMap((item) => tokenize(item))
    .filter(Boolean);

  const domainRegexes = buildDomainMatchRegexes(derivedDomain);
  const baseQuery = {
    isActive: true,
    $or: [{ approvalStatus: { $exists: false } }, { approvalStatus: "approved" }]
  };

  const profileForInstitution = req.user.role === "mentor"
    ? await MentorProfile.findOne({ userId: req.user.id }).select("institutionName mentorOrgRole").lean()
    : await StudentProfile.findOne({ userId: req.user.id }).select("institutionName collegeName className learnerStage").lean();
  const institutionName = String(profileForInstitution?.institutionName || profileForInstitution?.collegeName || "").trim();
  const className = String(profileForInstitution?.className || "").trim();
  const resourceAudienceStageFilter = audienceStageVisibilityFilter(audienceStageForViewer(req.user.role, profileForInstitution), "submittedBy", req.user.id);
  const audienceQuery = {
    $or: [
      { scope: { $exists: false } },
      { scope: "global" },
      { scope: "", institutionName: "" },
      { scope: null, institutionName: "" }
    ]
  };
  if (institutionName) {
    audienceQuery.$or.push({ scope: "institution", institutionName });
    audienceQuery.$or.push({ scope: { $exists: false }, institutionName });
    if (className) {
      audienceQuery.$or.push({ scope: "class", institutionName, className });
    }
  }
  let institutionResources = [];
  const scopedQuery = derivedDomain
    ? {
        ...baseQuery,
        $and: [
          {
            $or: [
              { domain: { $in: ["", null] } },
              ...(domainRegexes.length ? [{ domain: { $in: domainRegexes } }] : [{ domain: derivedDomain }])
            ]
          },
          audienceQuery,
          resourceAudienceStageFilter
        ]
      }
    : {
        ...baseQuery,
        $and: [audienceQuery, resourceAudienceStageFilter]
      };

  let resources = await KnowledgeResource.find(scopedQuery)
    .populate("submittedBy", "name")
    .sort({ updatedAt: -1 })
    .limit(100)
    .lean();
  let institutionDocs = [];

  if (!resources.length) {
    resources = [
      ...buildJourneySeedResources({
        queryDomain: derivedDomain,
        goal,
        ctx: {
          primaryCategory: journeyState?.goal?.domain,
          subCategory: journeyState?.goal?.subDomain,
          focus: journeyState?.goal?.focus
        },
        journeyState
      }),
      ...buildDomainSeedResources({
        queryDomain: derivedDomain,
        goal,
        ctx: {
          primaryCategory: journeyState?.goal?.domain,
          subCategory: journeyState?.goal?.subDomain,
          focus: journeyState?.goal?.focus
        }
      })
    ];
  }

  if (institutionName) {
    institutionDocs = await KnowledgeResource.find({
      isActive: true,
      approvalStatus: "approved",
      $and: [
        {
          $or: [
            { scope: { $exists: false }, institutionName },
            { scope: "institution", institutionName },
            ...(className ? [{ scope: "class", institutionName, className }] : [])
          ]
        },
        resourceAudienceStageFilter
      ]
    })
      .populate("submittedBy", "name")
      .sort({ updatedAt: -1 })
      .limit(20)
      .lean();
  }

  const resourceIds = [...resources, ...institutionDocs]
    .map((item) => String(item?._id || ""))
    .filter((id) => mongoose.Types.ObjectId.isValid(id));
  const submissionRows =
    req.user.role === "student" && resourceIds.length
      ? await KnowledgeResourceSubmission.find({
          resourceId: { $in: resourceIds.map((id) => new mongoose.Types.ObjectId(id)) },
          studentId: req.user.id
        }).lean()
      : [];
  const submissionMap = new Map(
    submissionRows.map((item) => [
      String(item.resourceId),
      {
        id: item._id,
        status: item.status,
        proofText: item.proofText || "",
        proofLink: item.proofLink || "",
        proofFiles: item.proofFiles || [],
        submittedAt: item.submittedAt,
        mentorReview: {
          reviewedAt: item.mentorReview?.reviewedAt || null,
          notes: item.mentorReview?.notes || "",
          xpAwarded: Number(item.mentorReview?.xpAwarded || 0),
          certificateId: item.mentorReview?.certificateId || null
        }
      }
    ])
  );

  const roadmapResources = mapKnowledgeResources(resources, {
    journeyState,
    currentStep,
    recommendationTokens: roadmapRecommendationTokens,
    mode: "roadmap",
    reasonFallback: `Recommended for your current roadmap path in ${goal}`,
    submissionMap
  }).slice(0, 12);
  const domainResources = mapKnowledgeResources(resources, {
    journeyState,
    currentStep,
    recommendationTokens: domainRecommendationTokens,
    mode: "domain",
    reasonFallback: `Recommended for your selected domain: ${journeyState?.goal?.focus || journeyState?.goal?.subDomain || derivedDomain || goal}`,
    submissionMap
  }).slice(0, 12);

  if (institutionName) {
    institutionResources = mapKnowledgeResources(institutionDocs, {
      journeyState,
      currentStep,
      recommendationTokens: roadmapRecommendationTokens,
      mode: "roadmap",
      reasonFallback: `Recommended by mentors and contributors from ${institutionName}`,
      submissionMap
    }).slice(0, 12);
  }

  res.json({
    journey: {
      currentStep: currentStep?.title || "",
      focusLabel: journeyState?.goal?.focus || journeyState?.goal?.subDomain || derivedDomain || goal,
      personalizationReason: currentStep?.title
        ? `Resources for your current roadmap step: ${currentStep.title}`
        : `Resources for your selected domain: ${journeyState?.goal?.focus || journeyState?.goal?.subDomain || derivedDomain || goal}`
    },
    institutionName,
    institutionResources,
    roadmapResources,
    domainResources,
    items: roadmapResources
  });
});

exports.submitKnowledgeResource = asyncHandler(async (req, res) => {
  if (!["mentor", "student"].includes(req.user.role)) throw new ApiError(403, "Only students and mentors can submit resources");

  const title = String(req.body?.title || "").trim();
  const domain = String(req.body?.domain || "").trim();
  const description = String(req.body?.description || "").trim();
  const url = String(req.body?.url || "").trim();
  const documentUrl = String(req.body?.documentUrl || "").trim();
  const bannerImageUrl = String(req.body?.bannerImageUrl || "").trim();
  const type = String(req.body?.type || "other").trim();
  const format = String(req.body?.format || "").trim();
  const difficulty = String(req.body?.difficulty || "").trim();
  const estimatedMinutes = Number(req.body?.estimatedMinutes || 0);
  const thumbnailUrl = String(req.body?.thumbnailUrl || "").trim();
  const learningOutcome = String(req.body?.learningOutcome || "").trim();
  const tags = Array.isArray(req.body?.tags)
    ? req.body.tags.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 10)
    : [];

  if (!title) throw new ApiError(400, "title is required");

  const contributorProfile = req.user.role === "mentor"
    ? await MentorProfile.findOne({ userId: req.user.id }).select("institutionName mentorOrgRole").lean()
    : await StudentProfile.findOne({ userId: req.user.id }).select("institutionName collegeName className").lean();
  const institutionName = String(req.body?.institutionName || contributorProfile?.institutionName || contributorProfile?.collegeName || "").trim();
  const className = String(req.body?.className || contributorProfile?.className || "").trim();
  const scopeDetails = normalizeContentScope({
    requestedScope: req.body?.scope,
    role: req.user.role,
    institutionName,
    className
  });

  const doc = await KnowledgeResource.create({
    domain,
    scope: scopeDetails.scope,
    institutionName: scopeDetails.institutionName,
    className: scopeDetails.className,
    audienceStage: req.user.role === "mentor" ? audienceStageForMentorProfile(contributorProfile, req.body?.audienceStage) : normalizeAudienceStage(req.body?.audienceStage),
    type,
    title,
    description,
    url,
    documentUrl,
    bannerImageUrl,
    format,
    difficulty,
    estimatedMinutes: Number.isFinite(estimatedMinutes) ? estimatedMinutes : 0,
    thumbnailUrl,
    learningOutcome,
    tags,
    contributorRole: req.user.role,
    submittedBy: req.user.id,
    approvalStatus: "pending",
    isActive: false
  });

  res.status(201).json({ message: "Resource submitted for review", resource: { id: doc._id } });
});

exports.getMentorKnowledgeResources = asyncHandler(async (req, res) => {
  if (req.user.role !== "mentor") throw new ApiError(403, "Only mentors can view their managed resources");
  const rows = await KnowledgeResource.find({ submittedBy: req.user.id })
    .sort({ updatedAt: -1 })
    .limit(200)
    .lean();
  res.json(rows.map((item) => ({
    id: item._id,
    title: item.title,
    domain: item.domain || "",
    scope: item.scope || "global",
    institutionName: item.institutionName || "",
    className: item.className || "",
    audienceStage: item.audienceStage || "",
    approvalStatus: item.approvalStatus || "pending",
    isActive: item.isActive !== false,
    updatedAt: item.updatedAt
  })));
});

exports.submitKnowledgeResourceProof = asyncHandler(async (req, res) => {
  if (req.user.role !== "student") throw new ApiError(403, "Only students can submit resource proof");
  const { resourceId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(resourceId)) throw new ApiError(400, "Invalid resourceId");

  const resource = await KnowledgeResource.findOne({
    _id: resourceId,
    isActive: true,
    approvalStatus: "approved"
  })
    .populate("submittedBy", "name role")
    .lean();
  if (!resource) throw new ApiError(404, "Resource not found");
  if (!resource.submittedBy || resource.submittedBy.role !== "mentor") {
    throw new ApiError(400, "This resource does not accept mentor review yet");
  }

  const studentProfile = await StudentProfile.findOne({ userId: req.user.id })
    .select("institutionName collegeName className")
    .lean();
  const studentInstitutionName = String(studentProfile?.institutionName || studentProfile?.collegeName || "").trim();
  const studentClassName = String(studentProfile?.className || "").trim();
  const resourceScope = String(resource.scope || "global").trim() || "global";
  const resourceInstitutionName = String(resource.institutionName || "").trim();
  const resourceClassName = String(resource.className || "").trim();

  if (resourceScope === "institution") {
    if (!studentInstitutionName || normalizeText(studentInstitutionName) !== normalizeText(resourceInstitutionName)) {
      throw new ApiError(403, "You do not have access to this institution resource");
    }
  } else if (resourceScope === "class") {
    if (
      !studentInstitutionName ||
      !studentClassName ||
      normalizeText(studentInstitutionName) !== normalizeText(resourceInstitutionName) ||
      normalizeText(studentClassName) !== normalizeText(resourceClassName)
    ) {
      throw new ApiError(403, "You do not have access to this class resource");
    }
  } else if (resourceInstitutionName && studentInstitutionName) {
    if (normalizeText(studentInstitutionName) !== normalizeText(resourceInstitutionName)) {
      throw new ApiError(403, "You do not have access to this resource");
    }
  }

  const proofText = String(req.body?.proofText || "").trim();
  const proofLink = String(req.body?.proofLink || "").trim();
  const proofFiles = Array.isArray(req.body?.proofFiles)
    ? req.body.proofFiles.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 8)
    : [];

  if (!proofText && !proofLink && !proofFiles.length) {
    throw new ApiError(400, "Add a note, link, or proof file");
  }

  const submission = await KnowledgeResourceSubmission.findOneAndUpdate(
    { resourceId, studentId: req.user.id },
    {
      $set: {
        proofText,
        proofLink,
        proofFiles,
        status: "submitted",
        submittedAt: new Date()
      }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  res.status(201).json({
    message: "Resource proof submitted for mentor review",
    submission: {
      id: submission._id,
      status: submission.status
    }
  });
});

exports.getKnowledgeResourceSubmissionsForMentor = asyncHandler(async (req, res) => {
  if (req.user.role !== "mentor") throw new ApiError(403, "Only mentors can view resource reviews");
  const resourceIds = await KnowledgeResource.find({ submittedBy: req.user.id }).distinct("_id");
  if (!resourceIds.length) return res.json([]);

  const rows = await KnowledgeResourceSubmission.find({ resourceId: { $in: resourceIds } })
    .populate("studentId", "name email")
    .populate("resourceId", "title domain scope institutionName className")
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();

  res.json(
    rows.map((item) => ({
      id: item._id,
      resourceId: item.resourceId?._id || null,
      resourceTitle: item.resourceId?.title || "Resource",
      resourceDomain: item.resourceId?.domain || "",
      scope: item.resourceId?.scope || "global",
      institutionName: item.resourceId?.institutionName || "",
      className: item.resourceId?.className || "",
      status: item.status,
      proofText: item.proofText || "",
      proofLink: item.proofLink || "",
      proofFiles: item.proofFiles || [],
      submittedAt: item.submittedAt,
      student: {
        id: item.studentId?._id || null,
        name: item.studentId?.name || "Student",
        email: item.studentId?.email || ""
      },
      mentorReview: {
        reviewedAt: item.mentorReview?.reviewedAt || null,
        notes: item.mentorReview?.notes || "",
        xpAwarded: Number(item.mentorReview?.xpAwarded || 0),
        certificateId: item.mentorReview?.certificateId || null
      }
    }))
  );
});

exports.reviewKnowledgeResourceSubmission = asyncHandler(async (req, res) => {
  if (req.user.role !== "mentor") throw new ApiError(403, "Only mentors can review resource submissions");
  const { submissionId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(submissionId)) throw new ApiError(400, "Invalid submissionId");

  const submission = await KnowledgeResourceSubmission.findById(submissionId);
  if (!submission) throw new ApiError(404, "Submission not found");

  const resource = await KnowledgeResource.findById(submission.resourceId).lean();
  if (!resource || String(resource.submittedBy || "") !== String(req.user.id)) {
    throw new ApiError(403, "Not allowed to review this resource submission");
  }

  const status = String(req.body?.status || "").trim();
  if (!["accepted", "rejected", "reviewed"].includes(status)) throw new ApiError(400, "status must be accepted, rejected, or reviewed");
  const xpAwarded = Math.max(0, Number(req.body?.xpAwarded || 0));
  const notes = String(req.body?.notes || "").trim();
  const previousResourceXp = submission.status === "accepted" ? Number(submission.mentorReview?.xpAwarded || 0) : 0;

  submission.status = status;
  submission.mentorReview.reviewedAt = new Date();
  submission.mentorReview.reviewedBy = req.user.id;
  submission.mentorReview.notes = notes;
  submission.mentorReview.xpAwarded = status === "accepted" ? xpAwarded : 0;

  const resourceXpDelta = Number(submission.mentorReview.xpAwarded || 0) - previousResourceXp;
  if (resourceXpDelta !== 0) {
    await applyReputationDelta(submission.studentId, { resourceXp: resourceXpDelta });
  }

  if (status === "accepted" && req.body?.issueCertificate) {
    const studentUser = await User.findById(submission.studentId).select("name").lean();
    const { certificate } = await issueCertificate({
      userId: submission.studentId,
      userName: studentUser?.name || "Student",
      title: `${resource.title} Resource Completion`,
      type: "manual",
      issuedBy: req.user.name || "Institution Mentor",
      source: "Knowledge Resource",
      level: resource.scope === "class" ? "Class" : resource.scope === "institution" ? "Institution" : "Global",
      domain: String(resource.domain || "").trim(),
      referenceType: "resource",
      referenceId: `knowledge-resource:${String(resource._id)}`,
      metadata: {
        domain: String(resource.domain || "").trim(),
        level: resource.scope === "class" ? "Class" : resource.scope === "institution" ? "Institution" : "Global",
        score: xpAwarded || 0,
        goal: resource.title
      }
    });
    submission.mentorReview.certificateId = certificate?._id || null;
  }

  await submission.save();

  res.json({
    message: "Resource submission reviewed",
    submission: {
      id: submission._id,
      status: submission.status,
      mentorReview: submission.mentorReview
    }
  });
});

exports.getMentorCertificateTemplates = asyncHandler(async (req, res) => {
  if (req.user.role !== "mentor") throw new ApiError(403, "Only mentors can view their templates");
  const rows = await CertificateTemplate.find({
    $or: [{ createdBy: req.user.id }, { issuerType: "mentor", createdBy: req.user.id }]
  })
    .sort({ updatedAt: -1 })
    .limit(200)
    .lean();
  res.json(rows.map((item) => ({
    id: item._id,
    title: item.title,
    templateKey: String(item.templateKey || "").replace(new RegExp(`^mentor:${String(req.user.id)}:`), ""),
    description: item.description || "",
    certificateType: item.certificateType || "manual",
    xpReward: Number(item.xpReward || 0),
    scope: item.scope || "global",
    institutionName: item.institutionName || "",
    className: item.className || "",
    isActive: item.isActive !== false
  })));
});

exports.createMentorCertificateTemplate = asyncHandler(async (req, res) => {
  if (req.user.role !== "mentor") throw new ApiError(403, "Only mentors can create templates");
  const mentorProfile = await MentorProfile.findOne({ userId: req.user.id }).select("institutionName").lean();
  const mentorInstitutionName = String(req.body?.institutionName || mentorProfile?.institutionName || "").trim();
  const title = String(req.body?.title || "").trim();
  const templateKey = String(req.body?.templateKey || title.toLowerCase().replace(/[^a-z0-9]+/g, "-")).trim();
  const storedTemplateKey = `mentor:${String(req.user.id)}:${templateKey}`;
  const className = String(req.body?.className || "").trim();
  const scopeDetails = normalizeContentScope({
    requestedScope: req.body?.scope,
    role: req.user.role,
    institutionName: mentorInstitutionName,
    className
  });
  if (!title) throw new ApiError(400, "title is required");
  if (!templateKey) throw new ApiError(400, "templateKey is required");

  const doc = await CertificateTemplate.findOneAndUpdate(
    { templateKey: storedTemplateKey, createdBy: req.user.id },
    {
      $set: {
        title,
        templateKey: storedTemplateKey,
        issuerType: "mentor",
        description: String(req.body?.description || "").trim(),
        bodyText: String(req.body?.bodyText || "").trim(),
        xpReward: Number(req.body?.xpReward || 0),
        certificateType: String(req.body?.certificateType || "manual").trim(),
        bannerImageUrl: String(req.body?.bannerImageUrl || "").trim(),
        scope: scopeDetails.scope,
        institutionName: scopeDetails.institutionName,
        className: scopeDetails.className,
        isActive: req.body?.isActive !== false,
        createdBy: req.user.id
      }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  res.status(201).json({ message: "Certificate template saved", template: doc });
});

exports.createMentorGroup = asyncHandler(async (req, res) => {
  if (req.user.role !== "mentor") throw new ApiError(403, "Only mentors can create groups");
  const mentor = await User.findById(req.user.id).select("approvalStatus role isDeleted").lean();
  if (!mentor || mentor.isDeleted) throw new ApiError(404, "Mentor not found");
  if (mentor.approvalStatus !== "approved") throw new ApiError(403, "Mentor not approved yet");

  const name = String(req.body?.name || "").trim();
  const domain = String(req.body?.domain || "").trim();
  const description = String(req.body?.description || "").trim();
  const avatarUrl = String(req.body?.avatarUrl || "").trim();
  const rules = String(req.body?.rules || "").trim();
  const schedule = String(req.body?.schedule || "Weekly sessions").trim();
  const maxStudents = Number(req.body?.maxStudents || 50);
  const topicTags = Array.isArray(req.body?.topicTags)
    ? req.body.topicTags.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 8)
    : [];

  if (!name) throw new ApiError(400, "name is required");

  const doc = await MentorGroup.create({
    mentorId: req.user.id,
    name,
    domain,
    description,
    avatarUrl,
    rules,
    schedule,
    maxStudents: Number.isFinite(maxStudents) ? Math.max(1, Math.min(500, maxStudents)) : 50,
    memberIds: [],
    pendingRequestIds: [],
    topicTags,
    settings: {
      joinApproval: req.body?.settings?.joinApproval !== false,
      allowMemberMessages: req.body?.settings?.allowMemberMessages !== false,
      allowMemberMedia: req.body?.settings?.allowMemberMedia !== false,
      allowReactions: req.body?.settings?.allowReactions !== false
    },
    isActive: true
  });

  res.status(201).json({ message: "Mentor group created", group: { id: doc._id } });
});

exports.getReputationSummary = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const [rep, globalSnapshot] = await Promise.all([
    ensureReputation(userId),
    LeaderboardSnapshot.findOne({ dateKey: toDateKey(), scope: "global", collegeName: "" }).lean()
  ]);
  const total = (globalSnapshot?.entries || []).length || 1;
  const myRank = (globalSnapshot?.entries || []).find((item) => String(item.userId) === String(userId))?.rank || total;
  const percentile = Math.max(1, Math.round((myRank / total) * 100));

  res.json({
    score: rep.score,
    levelTag: rep.levelTag,
    topPercent: percentile,
    breakdown: reputationBreakdownPayload(rep)
  });
});
