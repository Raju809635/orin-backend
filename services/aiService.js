const {
  groqApiKey,
  groqModel,
  openaiApiKey,
  openaiModel,
  geminiApiKey,
  geminiModel
} = require("../config/env");
const { buildOrinAssistantContext } = require("../config/orinAssistantContext");
const ApiError = require("../utils/ApiError");
const AI_PROVIDER_TIMEOUT_MS = 9000;

async function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_PROVIDER_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new ApiError(504, "AI provider timed out");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function buildSystemPrompt(role, mode = "personalized") {
  const roleGuide =
    role === "student"
      ? "Tailor guidance to a student with practical study and session preparation steps."
      : "Tailor guidance to a mentor with practical mentoring and session planning steps.";

  if (mode === "general") {
    return [
      "You are ORIN Assistant, a general-purpose learning and career helper inside ORIN.",
      `Current user role: ${role}.`,
      roleGuide,
      "Answer the user's question directly and clearly.",
      "If it is a simple factual or educational question, answer in plain language first.",
      "If useful, add 2-4 short bullet points after the direct answer.",
      "Do not force roadmap or action-plan formatting for general questions.",
      "If unsure, say you are not fully sure and suggest how to verify.",
      "Return plain text only."
    ].join(" ");
  }

  if (mode === "highschool_json") {
    return [
      "You are ORIN Assistant for high-school students inside ORIN.",
      `Current user role: ${role}.`,
      "Return valid JSON only.",
      "Do not wrap the JSON in markdown or extra text.",
      "Use clear, age-appropriate school language.",
      "Answer only from the student's provided subject, class level, goal, and question.",
      "Do not invent platform data, completed actions, personal records, marks, or fake progress.",
      "If the request is unclear, still return the requested JSON shape with safe, generic study guidance.",
      "Never return jokes, random content, unrelated careers, unrelated subjects, or placeholder options."
    ].join(" ");
  }

  return [
    "You are ORIN Assistant, an education and mentorship copilot.",
    `Current user role: ${role}.`,
    roleGuide,
    buildOrinAssistantContext(role),
    "Answer like a friendly ChatGPT-style tutor: direct, clear, and helpful.",
    "Use markdown headings, bullets, tables, and step-by-step formatting when they make the answer easier to read.",
    "If academic syllabus context is provided, use it as the main source for chapter/topic-specific answers.",
    "If the user asks for a study plan or roadmap, merge them into one practical plan with phases, daily tasks, revision, and checks.",
    "For CBSE Class 10 demo questions, prefer the provided syllabus context when available.",
    "Be concise when the question is simple, but give complete explanations when the user asks a learning question.",
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
    const response = await fetchWithTimeout("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${groqApiKey}`
      },
      body: JSON.stringify({
        model: groqModel,
        temperature: 0.2,
        messages: [
          { role: "system", content: buildSystemPrompt(role, context?.assistantMode) },
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
      const response = await fetchWithTimeout(
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
                    text: `${buildSystemPrompt(role, context?.assistantMode)}\n\nContext: ${JSON.stringify(context || {})}\n\nQuestion: ${message}`
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
    const response = await fetchWithTimeout("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiApiKey}`
      },
      body: JSON.stringify({
        model: openaiModel,
        temperature: 0.2,
        messages: [
          { role: "system", content: buildSystemPrompt(role, context?.assistantMode) },
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
