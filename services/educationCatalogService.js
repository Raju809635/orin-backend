const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "..", "..");
const LOCAL_CATALOG_PATH = path.join(ROOT_DIR, "data", "institutionCatalog.json");
const TS_MASTER_PATH = path.join(ROOT_DIR, "education", "Telangana_Education_Data", "master", "ts_educational_master.json");
const INDIA_ENGINEERING_PATH = path.join(ROOT_DIR, "education", "India_Engineering_Data", "master", "india_engineering_master.json");

let catalogCache = null;

function normalizeText(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalInstitutionType(category = "") {
  const normalized = normalizeText(category);
  if (!normalized) return "Institution";
  if (normalized.includes("school")) return "School";
  if (normalized.includes("intermediate") || normalized.includes("junior")) return "Junior College";
  if (normalized.includes("degree")) return "Degree College";
  if (normalized.includes("engineering") || normalized === "iit" || normalized === "iiit" || normalized === "nit") return "Engineering College";
  if (normalized.includes("university")) return "University";
  if (normalized.includes("law")) return "Law College";
  if (normalized.includes("health") || normalized.includes("medical")) return "Health College";
  if (normalized.includes("diploma")) return "Diploma College";
  return category;
}

function normalizeStateName(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw
    .replace(/\s+/g, " ")
    .split(" ")
    .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase() : ""))
    .join(" ")
    .trim();
}

function safeReadJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function pushUnique(rows, seen, item) {
  const key = normalizeText([item.name, item.state, item.district, item.institutionType].filter(Boolean).join("|"));
  if (!key || seen.has(key)) return;
  seen.add(key);
  rows.push(item);
}

function buildCatalog() {
  const localCatalog = safeReadJson(LOCAL_CATALOG_PATH, null);
  if (Array.isArray(localCatalog) && localCatalog.length > 0) {
    return localCatalog;
  }

  const seen = new Set();
  const rows = [];

  const tsMaster = safeReadJson(TS_MASTER_PATH, []);
  if (Array.isArray(tsMaster)) {
    tsMaster.forEach((item) => {
      const name = String(item?.name || item?.Institution_Name || "").trim();
      if (!name) return;
      pushUnique(rows, seen, {
        id: String(item?.id || item?.College_Code || item?.UDISECode || name),
        name,
        institutionType: canonicalInstitutionType(String(item?.category || item?.type || item?.Category || "Institution")),
        district: String(item?.district || item?.District || "").trim(),
        state: "Telangana",
        source: String(item?.source || "Telangana Education").trim()
      });
    });
  }

  const indiaEngineering = safeReadJson(INDIA_ENGINEERING_PATH, {});
  if (indiaEngineering && typeof indiaEngineering === "object") {
    Object.entries(indiaEngineering).forEach(([stateName, items]) => {
      if (!Array.isArray(items)) return;
      items.forEach((item) => {
        const name = String(item?.n || item?.name || "").trim();
        if (!name) return;
        pushUnique(rows, seen, {
          id: String(item?.i || item?.id || name),
          name,
          institutionType: canonicalInstitutionType(String(item?.t || "Engineering")),
          district: String(item?.c || item?.district || "").trim(),
          state: normalizeStateName(stateName),
          source: "India Engineering Master"
        });
      });
    });
  }

  return rows;
}

function getCatalog() {
  if (!catalogCache) {
    catalogCache = buildCatalog();
  }
  return catalogCache;
}

function searchInstitutions({ q = "", institutionType = "", state = "", limit = 12 } = {}) {
  const query = normalizeText(q);
  const typeFilter = normalizeText(institutionType);
  const stateFilter = normalizeText(state);
  if (!query || query.length < 2) return [];

  const results = [];

  for (const item of getCatalog()) {
    const haystack = normalizeText([item.name, item.district, item.state, item.institutionType].filter(Boolean).join(" "));
    if (!haystack.includes(query)) continue;
    if (typeFilter && normalizeText(item.institutionType) !== typeFilter) continue;
    if (stateFilter && normalizeText(item.state) !== stateFilter) continue;

    let score = 0;
    const normalizedName = normalizeText(item.name);
    if (normalizedName.startsWith(query)) score += 120;
    else if (normalizedName.includes(query)) score += 80;
    if (normalizeText(item.district).includes(query)) score += 30;
    if (normalizeText(item.state).includes(query)) score += 15;
    if (normalizeText(item.institutionType).includes(query)) score += 10;
    score -= normalizedName.length / 200;

    results.push({ ...item, score });
  }

  return results
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, Math.max(1, Math.min(Number(limit || 12), 20)))
    .map(({ score, ...item }) => item);
}

module.exports = {
  getCatalog,
  searchInstitutions,
  canonicalInstitutionType,
  normalizeStateName
};
