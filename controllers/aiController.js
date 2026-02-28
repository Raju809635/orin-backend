const asyncHandler = require("../utils/asyncHandler");
const { requestAiResponse } = require("../services/aiService");

exports.chatWithAi = asyncHandler(async (req, res) => {
  const answer = await requestAiResponse({
    role: req.user.role,
    message: req.body.message,
    context: req.body.context || {}
  });

  res.status(200).json({
    answer
  });
});
