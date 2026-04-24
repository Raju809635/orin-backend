const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const AiChatLog = require("../models/AiChatLog");
const { aiChatDailyLimit } = require("../config/env");
const { requestAiResponse } = require("../services/aiService");
const User = require("../models/User");
const StudentProfile = require("../models/StudentProfile");
const { updateJourneyGoal } = require("../services/journeyStateService");
const mongoose = require("mongoose");

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
