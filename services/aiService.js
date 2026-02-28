const { openaiApiKey, openaiModel, geminiApiKey, geminiModel } = require("../config/env");
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

  if (geminiApiKey) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiApiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: `${buildSystemPrompt(role)}\n\nContext: ${JSON.stringify(context || {})}\n\nQuestion: ${message}`
                }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.2
          }
        })
      }
    );

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const reason = data?.error?.message || "Failed to get AI response from Gemini";
      throw new ApiError(response.status || 500, reason);
    }

    const text = data?.candidates?.[0]?.content?.parts?.map((part) => part?.text || "").join("").trim();
    if (!text) {
      throw new ApiError(502, "Gemini returned an empty response");
    }

    return text;
  }

  if (openaiApiKey) {
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
      const reason = data?.error?.message || "Failed to get AI response from OpenAI";
      throw new ApiError(response.status || 500, reason);
    }

    const text = data?.choices?.[0]?.message?.content?.trim();
    if (!text) {
      throw new ApiError(502, "OpenAI returned an empty response");
    }

    return text;
  }

  throw new ApiError(500, "No AI provider configured. Set GEMINI_API_KEY or OPENAI_API_KEY.");
}

module.exports = {
  requestAiResponse
};
