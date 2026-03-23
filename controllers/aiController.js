const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const AiChatLog = require("../models/AiChatLog");
const { aiChatDailyLimit } = require("../config/env");
const { requestAiResponse } = require("../services/aiService");
const User = require("../models/User");
const StudentProfile = require("../models/StudentProfile");
const { updateJourneyGoal } = require("../services/journeyStateService");

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

  const { answer, provider, model } = await requestAiResponse({
    role: req.user.role,
    message: req.body.message,
    context: req.body.context || {}
  });

  await AiChatLog.create({
    userId: req.user.id,
    role: req.user.role,
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
    meta: {
      provider,
      model,
      remainingToday: Math.max(aiChatDailyLimit - usedToday - 1, 0)
    }
  });
});

exports.getMyAiHistory = asyncHandler(async (req, res) => {
  const logs = await AiChatLog.find({ userId: req.user.id })
    .select("prompt response provider model createdAt")
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  res.status(200).json(logs);
});
