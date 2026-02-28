const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const AiChatLog = require("../models/AiChatLog");
const { aiChatDailyLimit } = require("../config/env");
const { requestAiResponse } = require("../services/aiService");

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
