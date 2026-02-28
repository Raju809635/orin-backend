const { openaiApiKey, openaiModel } = require("../config/env");
const ApiError = require("../utils/ApiError");

function buildSystemPrompt(role) {
  return [
    "You are ORIN Assistant, an education and mentorship copilot.",
    `Current user role: ${role}.`,
    "Be concise, practical, and safe.",
    "Never invent platform data or claim actions were completed.",
    "If unsure, say what is missing and suggest next steps.",
    "Avoid legal/medical/financial definitive advice.",
    "Return plain text only."
  ].join(" ");
}

async function requestAiResponse({ role, message, context }) {
  if (typeof fetch !== "function") {
    throw new ApiError(500, "Server runtime does not support fetch for AI requests");
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiApiKey}`
    },
    body: JSON.stringify({
      model: openaiModel,
      temperature: 0.2,
      messages: [
        { role: "system", content: buildSystemPrompt(role) },
        {
          role: "user",
          content: `Context: ${JSON.stringify(context || {})}\n\nQuestion: ${message}`
        }
      ]
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const reason = data?.error?.message || "Failed to get AI response";
    throw new ApiError(response.status || 500, reason);
  }

  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!text) {
    throw new ApiError(502, "AI returned an empty response");
  }

  return text;
}

module.exports = {
  requestAiResponse
};
