const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { newsApiBaseUrl, newsApiKey } = require("../config/env");

const NEWS_CACHE_TTL_MS = 10 * 60 * 1000;
const newsCache = new Map();

const CATEGORY_QUERIES = {
  tech: { endpoint: "everything", q: "technology India", sortBy: "publishedAt" },
  edtech: { endpoint: "everything", q: "edtech India students", sortBy: "publishedAt" },
  exams: { endpoint: "everything", q: "government exams india", sortBy: "publishedAt" },
  scholarships: { endpoint: "everything", q: "scholarship students india", sortBy: "publishedAt" },
  opportunities: { endpoint: "everything", q: "internship opportunities students india", sortBy: "publishedAt" }
};

function buildNewsUrl(categoryKey, pageSize = 8) {
  const query = CATEGORY_QUERIES[categoryKey];
  if (!query) {
    throw new ApiError(400, "Unsupported news category");
  }

  const url = new URL(`${newsApiBaseUrl}/${query.endpoint}`);
  url.searchParams.set("q", query.q);
  url.searchParams.set("language", "en");
  url.searchParams.set("pageSize", String(Math.min(Math.max(Number(pageSize) || 8, 5), 10)));
  if (query.sortBy) {
    url.searchParams.set("sortBy", query.sortBy);
  }
  url.searchParams.set("apiKey", newsApiKey);
  return url.toString();
}

function normalizeArticle(article) {
  return {
    title: article?.title || "Untitled",
    description: article?.description || "",
    imageUrl: article?.urlToImage || "",
    source: article?.source?.name || "Unknown",
    url: article?.url || "",
    publishedAt: article?.publishedAt || ""
  };
}

async function fetchCategoryNews(categoryKey, pageSize) {
  const cacheKey = `${categoryKey}:${pageSize || 8}`;
  const now = Date.now();
  const cached = newsCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.data;
  }

  if (!newsApiKey) {
    throw new ApiError(500, "NEWS_API_KEY is not configured");
  }

  const response = await fetch(buildNewsUrl(categoryKey, pageSize));
  if (!response.ok) {
    throw new ApiError(response.status, "Failed to fetch news");
  }

  const payload = await response.json();
  const articles = Array.isArray(payload?.articles) ? payload.articles.map(normalizeArticle) : [];
  const data = {
    category: categoryKey,
    articles
  };

  newsCache.set(cacheKey, {
    expiresAt: now + NEWS_CACHE_TTL_MS,
    data
  });

  return data;
}

exports.getNewsCategories = asyncHandler(async (_req, res) => {
  res.json({
    categories: [
      { key: "tech", label: "Technology News" },
      { key: "edtech", label: "EdTech News" },
      { key: "exams", label: "Government Exam Updates" },
      { key: "scholarships", label: "Scholarship Alerts" },
      { key: "opportunities", label: "Internship Opportunities" }
    ]
  });
});

exports.getNewsByCategory = asyncHandler(async (req, res) => {
  const category = String(req.params.category || "").toLowerCase();
  const pageSize = Number(req.query.limit || 8);
  const data = await fetchCategoryNews(category, pageSize);
  res.json(data);
});
