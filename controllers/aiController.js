const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const AiChatLog = require("../models/AiChatLog");
const { aiChatDailyLimit } = require("../config/env");
const { requestAiResponse } = require("../services/aiService");
const User = require("../models/User");
const StudentProfile = require("../models/StudentProfile");
const { updateJourneyGoal } = require("../services/journeyStateService");
const mongoose = require("mongoose");

const HIGH_SCHOOL_SUBJECTS = ["Mathematics", "Science", "English"];
const FALLBACK_SUBJECT_GAP_QUESTIONS = [
  {
    id: "math-fractions-1",
    subject: "Mathematics",
    topic: "Fractions",
    question: "What is 1/2 + 1/4?",
    options: ["2/6", "3/4", "1/8", "1/6"],
    correct: "3/4",
    explanation: "Convert 1/2 to 2/4, then add 2/4 + 1/4 = 3/4."
  },
  {
    id: "math-algebra-1",
    subject: "Mathematics",
    topic: "Algebra",
    question: "If x + 7 = 12, what is x?",
    options: ["3", "4", "5", "6"],
    correct: "5",
    explanation: "Subtract 7 from both sides: x = 12 - 7 = 5."
  },
  {
    id: "math-geometry-1",
    subject: "Mathematics",
    topic: "Geometry",
    question: "How many degrees are in a right angle?",
    options: ["45", "60", "90", "180"],
    correct: "90",
    explanation: "A right angle measures exactly 90 degrees."
  },
  {
    id: "science-electricity-1",
    subject: "Science",
    topic: "Electricity",
    question: "Which material is a good conductor of electricity?",
    options: ["Rubber", "Plastic", "Copper", "Wood"],
    correct: "Copper",
    explanation: "Copper lets electric current pass through it easily."
  },
  {
    id: "science-plants-1",
    subject: "Science",
    topic: "Plants",
    question: "Which part of a plant absorbs water from soil?",
    options: ["Leaf", "Root", "Flower", "Fruit"],
    correct: "Root",
    explanation: "Roots absorb water and minerals from the soil."
  },
  {
    id: "science-forces-1",
    subject: "Science",
    topic: "Forces",
    question: "A push or pull on an object is called a...",
    options: ["Force", "Light", "Sound", "Heat"],
    correct: "Force",
    explanation: "Force is a push or pull that can change motion."
  },
  {
    id: "english-grammar-1",
    subject: "English",
    topic: "Grammar",
    question: "Choose the correct sentence.",
    options: ["She go to school.", "She goes to school.", "She going school.", "She gone school."],
    correct: "She goes to school.",
    explanation: "For he/she/it in simple present tense, we usually add s or es to the verb."
  },
  {
    id: "english-reading-1",
    subject: "English",
    topic: "Reading",
    question: "What is the main idea of a paragraph?",
    options: ["A small spelling mistake", "The central point", "Only the last word", "A punctuation mark"],
    correct: "The central point",
    explanation: "The main idea is the central point the paragraph is about."
  },
  {
    id: "english-vocabulary-1",
    subject: "English",
    topic: "Vocabulary",
    question: "Which word means the opposite of 'brave'?",
    options: ["Fearful", "Strong", "Happy", "Fast"],
    correct: "Fearful",
    explanation: "Fearful is close to the opposite of brave."
  }
];

function clampNumber(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function safeJsonParse(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (_) {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch (_) {
      return null;
    }
  }
}

function normalizeSubject(value) {
  const text = String(value || "").trim();
  return HIGH_SCHOOL_SUBJECTS.find((item) => item.toLowerCase() === text.toLowerCase()) || "Mathematics";
}

function normalizeGapQuestion(item, index) {
  const subject = normalizeSubject(item?.subject);
  const options = Array.isArray(item?.options)
    ? item.options.map((option) => String(option || "").trim()).filter(Boolean).slice(0, 4)
    : [];
  const correct = String(item?.correct || "").trim();
  if (options.length !== 4 || !correct || !options.includes(correct)) return null;

  return {
    id: String(item?.id || `${subject.toLowerCase()}-${index + 1}`).trim().slice(0, 80),
    subject,
    topic: String(item?.topic || "Core Concept").trim().slice(0, 80),
    question: String(item?.question || "").trim().slice(0, 500),
    options,
    correct,
    explanation: String(item?.explanation || "Review this concept and try one similar practice question.").trim().slice(0, 500)
  };
}

function buildSubjectGapFallbackQuiz({ subjects = HIGH_SCHOOL_SUBJECTS, questionCount = 9, focusTopic = "" }) {
  const allowed = new Set(subjects.map(normalizeSubject));
  const topic = String(focusTopic || "").trim().toLowerCase();
  const filtered = FALLBACK_SUBJECT_GAP_QUESTIONS.filter((item) => {
    const subjectMatch = allowed.has(item.subject);
    const topicMatch = !topic || item.topic.toLowerCase() === topic;
    return subjectMatch && topicMatch;
  });
  const source = filtered.length ? filtered : FALLBACK_SUBJECT_GAP_QUESTIONS;
  return source.slice(0, questionCount).map((item, index) => ({ ...item, id: `${item.id}-${index}` }));
}

function scoreHighSchoolSubjectGap(questions = [], answers = {}) {
  const bySubject = new Map();
  const byTopic = new Map();
  let correctCount = 0;

  questions.forEach((question) => {
    const subject = normalizeSubject(question.subject);
    const topic = String(question.topic || "Core Concept").trim() || "Core Concept";
    const isCorrect = String(answers?.[question.id] || "") === String(question.correct || "");
    if (isCorrect) correctCount += 1;

    const subjectRow = bySubject.get(subject) || { key: subject, label: subject, correct: 0, total: 0 };
    subjectRow.total += 1;
    if (isCorrect) subjectRow.correct += 1;
    bySubject.set(subject, subjectRow);

    const topicKey = `${subject}:${topic}`;
    const topicRow = byTopic.get(topicKey) || { key: topicKey, label: topic, subject, correct: 0, total: 0 };
    topicRow.total += 1;
    if (isCorrect) topicRow.correct += 1;
    byTopic.set(topicKey, topicRow);
  });

  const withPercent = (row) => ({
    ...row,
    percent: row.total ? Math.round((row.correct / row.total) * 100) : 0
  });
  const subjectRows = Array.from(bySubject.values()).map(withPercent);
  const topicRows = Array.from(byTopic.values()).map(withPercent);
  const weakRows = topicRows.filter((row) => row.percent < 60).sort((a, b) => a.percent - b.percent);
  const averageRows = topicRows.filter((row) => row.percent >= 60 && row.percent < 80).sort((a, b) => a.percent - b.percent);
  const strengthRows = topicRows.filter((row) => row.percent >= 80).sort((a, b) => b.percent - a.percent);
  const focusRows = weakRows.length ? weakRows.slice(0, 2) : averageRows.slice(0, 2);
  const overallScore = questions.length ? Math.round((correctCount / questions.length) * 100) : 0;

  return {
    overallScore,
    completedQuestions: questions.length,
    totalCorrect: correctCount,
    subjectRows,
    topicRows,
    weakRows,
    averageRows,
    strengthRows,
    focusRows
  };
}

function buildFallbackFocusPlan(score) {
  const focusRows = score.focusRows.length ? score.focusRows : score.topicRows.slice(0, 2);
  const topics = focusRows.map((item) => item.label);
  const label = topics.join(" and ") || "your next weak topic";
  return {
    title: "Your Focus Plan",
    topics,
    description: `Focus on ${label} this week. Practice 5-10 questions daily and aim to improve by 10%.`,
    dailyPractice: "Practice 5-10 short questions daily.",
    improvementTarget: "Improve by 10% in the next report.",
    steps: [
      `Revise ${topics[0] || "one weak topic"} for 15 minutes.`,
      "Attempt a short practice quiz.",
      "Review every wrong answer and retry similar questions."
    ]
  };
}

function extractGoalFromMessage(message = "") {
  const text = String(message || "").trim();
  if (!text) return "";

  const patterns = [
    /want to become\s+(.+?)(?:[.!?]|$)/i,
    /become\s+(.+?)(?:[.!?]|$)/i,
    /goal is\s+(.+?)(?:[.!?]|$)/i,
    /prepare for\s+(.+?)(?:[.!?]|$)/i,
    /learn\s+(.+?)(?:[.!?]|$)/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return String(match[1]).trim().replace(/^an?\s+/i, "").slice(0, 120);
    }
  }

  if (/\b(ai engineer|data scientist|web developer|upsc|lawyer|backend developer|frontend developer|machine learning engineer)\b/i.test(text)) {
    const matched = text.match(/\b(ai engineer|data scientist|web developer|upsc|lawyer|backend developer|frontend developer|machine learning engineer)\b/i);
    return String(matched?.[1] || "").trim();
  }

  return "";
}

function toConversationTitle(prompt = "") {
  const clean = String(prompt || "").trim().replace(/\s+/g, " ");
  if (!clean) return "New chat";
  return clean.length > 60 ? `${clean.slice(0, 60)}...` : clean;
}

async function ensureConversationAccess(userId, conversationId) {
  const exists = await AiChatLog.exists({ userId, conversationId });
  if (!exists) throw new ApiError(404, "Conversation not found");
}

async function buildConversationSummaries(userId) {
  const rows = await AiChatLog.find({ userId })
    .select("conversationId conversationTitle assistantMode pinned prompt response createdAt")
    .sort({ createdAt: -1 })
    .limit(250)
    .lean();

  const map = new Map();
  for (const row of rows) {
    const key = String(row.conversationId || "");
    if (!key) continue;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        conversationId: key,
        title: String(row.conversationTitle || "").trim() || toConversationTitle(row.prompt),
        assistantMode: row.assistantMode || "general",
        pinned: Boolean(row.pinned),
        lastPrompt: row.prompt || "",
        lastResponsePreview: String(row.response || "").trim().slice(0, 180),
        lastMessageAt: row.createdAt,
        createdAt: row.createdAt,
        messageCount: 1
      });
      continue;
    }

    existing.messageCount += 1;
    if (new Date(row.createdAt).getTime() < new Date(existing.createdAt).getTime()) {
      existing.createdAt = row.createdAt;
    }
    if (!existing.pinned && row.pinned) existing.pinned = true;
    if (!existing.title && row.conversationTitle) existing.title = row.conversationTitle;
  }

  return Array.from(map.values()).sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime();
  });
}

exports.chatWithAi = asyncHandler(async (req, res) => {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const usedToday = await AiChatLog.countDocuments({
    userId: req.user.id,
    createdAt: { $gte: startOfDay }
  });

  if (usedToday >= aiChatDailyLimit) {
    throw new ApiError(429, `Daily AI limit reached (${aiChatDailyLimit}). Try again tomorrow.`);
  }

  const assistantMode = req.body?.context?.assistantMode === "personalized" ? "personalized" : "general";
  const conversationId = String(req.body?.conversationId || new mongoose.Types.ObjectId().toString()).trim();
  if (!conversationId) throw new ApiError(400, "conversationId is required");

  let existingConversation = null;
  if (req.body?.conversationId) {
    existingConversation = await AiChatLog.findOne({ userId: req.user.id, conversationId }).select("conversationTitle pinned").lean();
    if (!existingConversation) throw new ApiError(404, "Conversation not found");
  }

  const { answer, provider, model } = await requestAiResponse({
    role: req.user.role,
    message: req.body.message,
    context: req.body.context || {}
  });

  await AiChatLog.create({
    userId: req.user.id,
    role: req.user.role,
    conversationId,
    conversationTitle: String(existingConversation?.conversationTitle || "").trim() || toConversationTitle(req.body.message),
    assistantMode,
    pinned: Boolean(existingConversation?.pinned),
    provider,
    model,
    prompt: req.body.message,
    response: answer,
    context: req.body.context || {}
  });

  const extractedGoal = extractGoalFromMessage(req.body.message);
  if (req.user.role === "student" && extractedGoal) {
    const [user, profile] = await Promise.all([
      User.findById(req.user.id).select("primaryCategory subCategory").lean(),
      StudentProfile.findOne({ userId: req.user.id }).select("careerGoals").lean()
    ]);

    await updateJourneyGoal(
      req.user.id,
      {
        title: extractedGoal,
        domain: user?.primaryCategory || "",
        subDomain: user?.subCategory || "",
        source: "assistant"
      },
      req.user.role
    );

    if (!String(profile?.careerGoals || "").trim()) {
      await StudentProfile.findOneAndUpdate(
        { userId: req.user.id },
        { $set: { careerGoals: extractedGoal } },
        { upsert: true, new: false }
      );
    }
  }

  res.status(200).json({
    answer,
    conversationId,
    meta: {
      provider,
      model,
      remainingToday: Math.max(aiChatDailyLimit - usedToday - 1, 0)
    }
  });
});

exports.generateHighSchoolSubjectGapQuiz = asyncHandler(async (req, res) => {
  const profile = await StudentProfile.findOne({ userId: req.user.id })
    .select("learnerStage classLevel institutionName className")
    .lean();
  if (profile?.learnerStage && profile.learnerStage !== "highschool") {
    throw new ApiError(403, "Subject Gap Analyzer is available for high school learners.");
  }

  const requestedSubjects = Array.isArray(req.body?.subjects) && req.body.subjects.length
    ? req.body.subjects.map(normalizeSubject)
    : HIGH_SCHOOL_SUBJECTS;
  const subjects = Array.from(new Set(requestedSubjects)).slice(0, 3);
  const questionCount = clampNumber(req.body?.questionCount, 5, 15, 9);
  const classLevel = String(req.body?.classLevel || profile?.classLevel || profile?.className || "High School").trim().slice(0, 40);
  const focusTopic = String(req.body?.focusTopic || "").trim().slice(0, 80);

  const fallbackQuestions = buildSubjectGapFallbackQuiz({ subjects, questionCount, focusTopic });
  let source = "fallback";
  let provider = "local";
  let model = "deterministic";
  let questions = fallbackQuestions;

  try {
    const prompt = [
      "Create a high-school Subject Gap Analyzer quiz.",
      "Return JSON only with this shape:",
      '{"questions":[{"id":"short-id","subject":"Mathematics|Science|English","topic":"topic name","question":"question text","options":["A","B","C","D"],"correct":"exact option text","explanation":"short explanation"}]}',
      `Class level: ${classLevel}.`,
      `Subjects: ${subjects.join(", ")}.`,
      focusTopic ? `Focus topic: ${focusTopic}.` : "Mix foundational topics across the selected subjects.",
      `Create exactly ${questionCount} questions.`,
      "Rules: school-safe content, no adult career/marketplace content, each correct value must exactly match one option, concise explanations."
    ].join("\n");

    const ai = await requestAiResponse({
      role: "student",
      message: prompt,
      context: {
        assistantMode: "general",
        feature: "highschool_subject_gap_quiz",
        expectedFormat: "json",
        learnerStage: "highschool"
      }
    });
    const parsed = safeJsonParse(ai.answer);
    const normalized = Array.isArray(parsed?.questions)
      ? parsed.questions.map(normalizeGapQuestion).filter(Boolean).slice(0, questionCount)
      : [];

    if (normalized.length >= Math.min(5, questionCount)) {
      questions = normalized;
      source = "ai";
      provider = ai.provider;
      model = ai.model;
    }
  } catch (error) {
    source = "fallback";
  }

  res.status(200).json({
    source,
    quiz: {
      title: focusTopic ? `${focusTopic} Practice` : "Subject Gap Analyzer",
      classLevel,
      subjects,
      questions
    },
    meta: { provider, model }
  });
});

exports.analyzeHighSchoolSubjectGap = asyncHandler(async (req, res) => {
  const questions = Array.isArray(req.body?.questions)
    ? req.body.questions.map(normalizeGapQuestion).filter(Boolean).slice(0, 20)
    : [];
  if (!questions.length) throw new ApiError(400, "questions are required");

  const answers = req.body?.answers && typeof req.body.answers === "object" ? req.body.answers : {};
  const score = scoreHighSchoolSubjectGap(questions, answers);
  let focusPlan = buildFallbackFocusPlan(score);
  let source = "fallback";
  let provider = "local";
  let model = "deterministic";

  try {
    const prompt = [
      "Create a personalized high-school subject gap focus plan from this real quiz performance data.",
      "Do not change scores. Use only the supplied weak/average/strong topic data.",
      "Return JSON only with this shape:",
      '{"praise":"short encouraging sentence","focusPlan":{"title":"Your Focus Plan","topics":["topic"],"description":"short plan","dailyPractice":"short daily task","improvementTarget":"target","steps":["step 1","step 2","step 3"]}}',
      JSON.stringify({
        overallScore: score.overallScore,
        subjectRows: score.subjectRows,
        weakRows: score.weakRows,
        averageRows: score.averageRows,
        strengthRows: score.strengthRows
      })
    ].join("\n");

    const ai = await requestAiResponse({
      role: "student",
      message: prompt,
      context: {
        assistantMode: "general",
        feature: "highschool_subject_gap_report",
        expectedFormat: "json",
        learnerStage: "highschool"
      }
    });
    const parsed = safeJsonParse(ai.answer);
    if (parsed?.focusPlan?.description) {
      focusPlan = {
        title: String(parsed.focusPlan.title || "Your Focus Plan").slice(0, 80),
        topics: Array.isArray(parsed.focusPlan.topics)
          ? parsed.focusPlan.topics.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 3)
          : focusPlan.topics,
        description: String(parsed.focusPlan.description || focusPlan.description).slice(0, 300),
        dailyPractice: String(parsed.focusPlan.dailyPractice || focusPlan.dailyPractice).slice(0, 180),
        improvementTarget: String(parsed.focusPlan.improvementTarget || focusPlan.improvementTarget).slice(0, 160),
        steps: Array.isArray(parsed.focusPlan.steps)
          ? parsed.focusPlan.steps.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 4)
          : focusPlan.steps
      };
      source = "ai";
      provider = ai.provider;
      model = ai.model;
    }
  } catch (error) {
    source = "fallback";
  }

  res.status(200).json({
    source,
    report: {
      ...score,
      praise:
        score.overallScore >= 85
          ? "Excellent work. Keep it up."
          : score.overallScore >= 70
            ? "Great effort. You are on track."
            : score.overallScore >= 55
              ? "Good start. Your focus plan will help."
              : "Good attempt. Let us strengthen the basics.",
      focusPlan
    },
    meta: { provider, model }
  });
});

exports.getMyAiHistory = asyncHandler(async (req, res) => {
  const summaries = await buildConversationSummaries(req.user.id);
  res.status(200).json(summaries);
});

exports.getAiConversationMessages = asyncHandler(async (req, res) => {
  const { conversationId } = req.params;
  await ensureConversationAccess(req.user.id, conversationId);

  const logs = await AiChatLog.find({ userId: req.user.id, conversationId })
    .select("conversationId conversationTitle assistantMode pinned prompt response provider model createdAt")
    .sort({ createdAt: 1 })
    .lean();

  res.status(200).json({
    conversationId,
    messages: logs.map((item) => ({
      id: item._id,
      prompt: item.prompt,
      response: item.response,
      createdAt: item.createdAt
    }))
  });
});

exports.updateAiConversation = asyncHandler(async (req, res) => {
  const { conversationId } = req.params;
  await ensureConversationAccess(req.user.id, conversationId);

  const update = {};
  if (Object.prototype.hasOwnProperty.call(req.body, "title")) {
    update.conversationTitle = String(req.body.title || "").trim().slice(0, 120);
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "pinned")) {
    update.pinned = Boolean(req.body.pinned);
  }

  await AiChatLog.updateMany({ userId: req.user.id, conversationId }, { $set: update });
  const summaries = await buildConversationSummaries(req.user.id);
  const summary = summaries.find((item) => item.conversationId === conversationId) || null;

  res.status(200).json({
    message: "Conversation updated",
    conversation: summary
  });
});

exports.deleteAiConversation = asyncHandler(async (req, res) => {
  const { conversationId } = req.params;
  await ensureConversationAccess(req.user.id, conversationId);
  await AiChatLog.deleteMany({ userId: req.user.id, conversationId });
  res.status(200).json({ message: "Conversation deleted" });
});
