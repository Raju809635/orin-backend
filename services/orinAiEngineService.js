const { orinAiEngineEnabled, orinAiEngineTimeoutMs, orinAiEngineUrl } = require("../config/env");

function engineBaseUrl() {
  return String(orinAiEngineUrl || "").trim().replace(/\/+$/, "");
}

function logAiEngineStatus(status, details = {}) {
  const suffix = Object.keys(details).length ? ` ${JSON.stringify(details)}` : "";
  console.info(`[orin-ai-engine] ${status}${suffix}`);
}

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
  const baseUrl = engineBaseUrl();
  if (!orinAiEngineEnabled || !baseUrl) {
    logAiEngineStatus("fallback_academic_json", { reason: "engine_disabled" });
    return { ok: false, reason: "engine_disabled", results: [] };
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    Math.min(Math.max(1500, Number(orinAiEngineTimeoutMs || 12000)), 4500)
  );
  try {
    const response = await fetch(`${baseUrl}/retrieve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildRetrievePayload({ query, board, classLevel, subject, chapter, limit })),
      signal: controller.signal
    });

    if (!response.ok) {
      logAiEngineStatus("ai_engine_unavailable", { reason: `http_${response.status}` });
      return { ok: false, reason: `http_${response.status}`, results: [] };
    }

    const data = await response.json();
    const results = normalizeRetrieveResults(data);
    logAiEngineStatus("ai_engine_ready", { hits: results.length });
    return {
      ok: true,
      reason: "ok",
      results
    };
  } catch (error) {
    const reason = error?.name === "AbortError" ? "timeout" : "request_failed";
    logAiEngineStatus("ai_engine_unavailable", { reason });
    return {
      ok: false,
      reason,
      results: []
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function getAiEngineHealth() {
  const baseUrl = engineBaseUrl();
  if (!orinAiEngineEnabled || !baseUrl) {
    return {
      ok: false,
      status: "disabled",
      reason: "Set ORIN_AI_ENGINE_URL to enable retrieval.",
      urlConfigured: Boolean(baseUrl)
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    Math.min(Math.max(1000, Number(orinAiEngineTimeoutMs || 12000)), 3000)
  );
  try {
    const response = await fetch(`${baseUrl}/health`, { method: "GET", signal: controller.signal });
    const data = await response.json().catch(() => ({}));
    return {
      ok: response.ok && data?.status === "ok",
      status: data?.status || (response.ok ? "ok" : "unavailable"),
      reason: response.ok ? "ok" : `http_${response.status}`,
      urlConfigured: true,
      engine: data
    };
  } catch (error) {
    return {
      ok: false,
      status: "unavailable",
      reason: error?.name === "AbortError" ? "timeout" : "request_failed",
      urlConfigured: true
    };
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  getAiEngineHealth,
  retrieveAcademicContext
};
