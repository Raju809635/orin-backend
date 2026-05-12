const { orinAiEngineEnabled, orinAiEngineTimeoutMs, orinAiEngineUrl } = require("../config/env");

function buildRetrievePayload({ query, board, classLevel, subject, chapter, limit = 8 }) {
  return {
    query: String(query || "").trim().slice(0, 500),
    board: String(board || "SSC").trim().toUpperCase(),
    classLevel: String(classLevel || "10").trim(),
    subject: String(subject || "").trim(),
    chapter: String(chapter || "").trim(),
    topK: Number(limit) || 8
  };
}

function normalizeRetrieveResults(data) {
  const list = Array.isArray(data?.results) ? data.results : Array.isArray(data?.chunks) ? data.chunks : [];
  return list
    .map((item) => {
      const text = String(item?.text || item?.content || "").trim();
      if (!text) return null;
      const metadata = item?.metadata && typeof item.metadata === "object" ? item.metadata : {};
      return {
        text: text.slice(0, 1200),
        chapter: String(metadata.chapter || metadata.chapter_name || "").trim(),
        topic: String(metadata.topic || metadata.topic_name || "").trim(),
        subject: String(metadata.subject || "").trim(),
        score: Number.isFinite(Number(item?.score)) ? Number(item.score) : undefined
      };
    })
    .filter(Boolean)
    .slice(0, 12);
}

async function retrieveAcademicContext({ query, board, classLevel, subject, chapter, limit = 8 }) {
  if (!orinAiEngineEnabled || !String(orinAiEngineUrl || "").trim()) {
    return { ok: false, reason: "engine_disabled", results: [] };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(1000, Number(orinAiEngineTimeoutMs || 12000)));
  try {
    const response = await fetch(`${orinAiEngineUrl.replace(/\/+$/, "")}/retrieve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildRetrievePayload({ query, board, classLevel, subject, chapter, limit })),
      signal: controller.signal
    });

    if (!response.ok) {
      return { ok: false, reason: `http_${response.status}`, results: [] };
    }

    const data = await response.json();
    return {
      ok: true,
      reason: "ok",
      results: normalizeRetrieveResults(data)
    };
  } catch (error) {
    return {
      ok: false,
      reason: error?.name === "AbortError" ? "timeout" : "request_failed",
      results: []
    };
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  retrieveAcademicContext
};

