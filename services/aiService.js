const {
  groqApiKey,
  groqModel,
  openaiApiKey,
  openaiModel,
  geminiApiKey,
  geminiModel
} = require("../config/env");
const ApiError = require("../utils/ApiError");

function buildSystemPrompt(role) {
  const roleGuide =
    role === "student"
      ? "Tailor guidance to a student with practical study and session preparation steps."
      : "Tailor guidance to a mentor with practical mentoring and session planning steps.";

  return [
    "You are ORIN Assistant, an education and mentorship copilot.",
    `Current user role: ${role}.`,
    roleGuide,
    "Be concise, practical, and safe.",
    "Never invent platform data or claim actions were completed.",
    "If unsure, say what is missing and suggest next steps.",
    "Avoid legal/medical/financial definitive advice.",
    "Response format rules:",
    "Summary: one short line.",
    "Next actions: 3-5 bullets prefixed with '-'.",
    "Watchouts: 1-3 bullets prefixed with '-'.",
    "Return plain text only."
  ].join(" ");
}

function normalizeGeminiModelName(name) {
  if (!name) return "";
  return name.startsWith("models/") ? name.replace("models/", "") : name;
}

function looksLikeMissingGeminiModelError(responseStatus, reason) {
  return responseStatus === 404 || /not found|not supported for generateContent/i.test(reason || "");
}

async function requestAiResponse({ role, message, context }) {
  if (typeof fetch !== "function") {
    throw new ApiError(500, "Server runtime does not support fetch for AI requests");
  }

  if (groqApiKey) {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${groqApiKey}`
      },
      body: JSON.stringify({
        model: groqModel,
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
      const reason = data?.error?.message || "Failed to get AI response from Groq";
      throw new ApiError(response.status || 500, reason);
    }

    const text = data?.choices?.[0]?.message?.content?.trim();
    if (!text) {
      throw new ApiError(502, "Groq returned an empty response");
    }

    return {
      answer: text,
      provider: "groq",
      model: groqModel
    };
  }

  if (geminiApiKey) {
    const candidates = [
      normalizeGeminiModelName(geminiModel),
      "gemini-2.0-flash",
      "gemini-1.5-flash",
      "gemini-1.5-pro"
    ].filter(Boolean);

    let lastReason = "Failed to get AI response from Gemini";
    for (const modelName of candidates) {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${geminiApiKey}`,
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
      if (response.ok) {
        const text = data?.candidates?.[0]?.content?.parts?.map((part) => part?.text || "").join("").trim();
        if (!text) {
          throw new ApiError(502, "Gemini returned an empty response");
        }
        return {
          answer: text,
          provider: "gemini",
          model: modelName
        };
      }

      const reason = data?.error?.message || "Failed to get AI response from Gemini";
      lastReason = reason;
      if (!looksLikeMissingGeminiModelError(response.status, reason)) {
        throw new ApiError(response.status || 500, reason);
      }
    }

    throw new ApiError(500, lastReason);
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

    return {
      answer: text,
      provider: "openai",
      model: openaiModel
    };
  }

  throw new ApiError(
    500,
    "No AI provider configured. Set GROQ_API_KEY, GEMINI_API_KEY, or OPENAI_API_KEY."
  );
}

module.exports = {
  requestAiResponse
};
