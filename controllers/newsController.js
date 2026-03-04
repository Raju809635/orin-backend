const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { newsApiBaseUrl, newsApiKey, newsTranslateApiUrl, newsTranslateApiKey } = require("../config/env");

const NEWS_CACHE_TTL_MS = 10 * 60 * 1000;
const MIN_NATIVE_ARTICLES = 4;
const HTTP_TIMEOUT_MS = 12000;
const newsCache = new Map();

const SUPPORTED_LANGUAGES = {
  en: "English",
  hi: "Hindi",
  te: "Telugu",
  ta: "Tamil",
  ml: "Malayalam",
  kn: "Kannada"
};

const NEWSAPI_NATIVE_LANGUAGES = new Set(["en"]);

const CATEGORY_QUERIES = {
  tech: { endpoint: "everything", q: "technology", sortBy: "publishedAt", label: "Tech News" },
  edtech: { endpoint: "everything", q: "education technology", sortBy: "publishedAt", label: "EdTech News" },
  exams: { endpoint: "everything", q: "government exams india", sortBy: "publishedAt", label: "Government Exam Updates" },
  scholarships: { endpoint: "everything", q: "student scholarships", sortBy: "publishedAt", label: "Scholarship Alerts" },
  opportunities: { endpoint: "everything", q: "student internships", sortBy: "publishedAt", label: "Internship Opportunities" }
};

function getSafeLimit(limit) {
  return Math.min(Math.max(Number(limit) || 8, 5), 10);
}

function getLanguageOrDefault(language) {
  const normalized = String(language || "en").toLowerCase();
  return SUPPORTED_LANGUAGES[normalized] ? normalized : "en";
}

function buildNewsUrl(categoryKey, language = "en", pageSize = 8) {
  const query = CATEGORY_QUERIES[categoryKey];
  if (!query) {
    throw new ApiError(400, "Unsupported news category");
  }

  const url = new URL(`${newsApiBaseUrl}/${query.endpoint}`);
  url.searchParams.set("q", query.q);
  url.searchParams.set("language", language);
  url.searchParams.set("pageSize", String(getSafeLimit(pageSize)));
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

async function fetchWithTimeout(url, options = {}, timeoutMs = HTTP_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchRawArticles(categoryKey, language, pageSize) {
  const response = await fetchWithTimeout(buildNewsUrl(categoryKey, language, pageSize));
  if (!response.ok) {
    throw new ApiError(response.status, "Failed to fetch news");
  }
  const payload = await response.json();
  return Array.isArray(payload?.articles) ? payload.articles.map(normalizeArticle) : [];
}

async function translateText(text, targetLanguage) {
  if (!text) return "";

  try {
    // Prefer custom translation gateway when configured.
    if (newsTranslateApiUrl) {
      const body = {
        q: text,
        source: "en",
        target: targetLanguage,
        format: "text"
      };
      if (newsTranslateApiKey) {
        body.api_key = newsTranslateApiKey;
      }

      const response = await fetchWithTimeout(newsTranslateApiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      });

      if (!response.ok) return text;
      const result = await response.json();
      return result?.translatedText || text;
    }

    // Fallback: Google Translate endpoint using API key only.
    if (newsTranslateApiKey) {
      const url = new URL("https://translation.googleapis.com/language/translate/v2");
      url.searchParams.set("key", newsTranslateApiKey);
      const response = await fetchWithTimeout(url.toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          q: text,
          target: targetLanguage,
          format: "text"
        })
      });
      if (!response.ok) return text;
      const result = await response.json();
      return result?.data?.translations?.[0]?.translatedText || text;
    }

    return text;
  } catch {
    return text;
  }
}

async function translateArticles(articles, targetLanguage) {
  if (targetLanguage === "en") return articles;

  const translated = await Promise.all(
    articles.map(async (item) => {
      const [title, description] = await Promise.all([
        translateText(item.title, targetLanguage),
        translateText(item.description, targetLanguage)
      ]);
      return {
        ...item,
        title,
        description
      };
    })
  );
  return translated;
}

async function fetchCategoryNews(categoryKey, language, pageSize) {
  const safeLanguage = getLanguageOrDefault(language);
  const safeLimit = getSafeLimit(pageSize);
  const cacheKey = `${categoryKey}:${safeLanguage}:${safeLimit}`;
  const now = Date.now();
  const cached = newsCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.data;
  }

  if (!newsApiKey) {
    throw new ApiError(500, "NEWS_API_KEY is not configured");
  }

  const nativeLanguageSupported = NEWSAPI_NATIVE_LANGUAGES.has(safeLanguage);
  let articles = await fetchRawArticles(categoryKey, nativeLanguageSupported ? safeLanguage : "en", safeLimit);
  let translatedFromEnglish = false;

  if (safeLanguage !== "en") {
    if (!nativeLanguageSupported || articles.length < MIN_NATIVE_ARTICLES) {
      const englishArticles = await fetchRawArticles(categoryKey, "en", safeLimit);
      articles = newsTranslateApiUrl || newsTranslateApiKey
        ? await translateArticles(englishArticles, safeLanguage)
        : englishArticles;
      translatedFromEnglish = Boolean(newsTranslateApiUrl || newsTranslateApiKey);
    } else if (newsTranslateApiUrl || newsTranslateApiKey) {
      articles = await translateArticles(articles, safeLanguage);
      translatedFromEnglish = true;
    }
  }

  const data = {
    category: categoryKey,
    categoryLabel: CATEGORY_QUERIES[categoryKey]?.label || categoryKey,
    language: safeLanguage,
    languageLabel: SUPPORTED_LANGUAGES[safeLanguage],
    translatedFromEnglish,
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
    categories: Object.entries(CATEGORY_QUERIES).map(([key, value]) => ({
      key,
      label: value.label
    })),
    languages: Object.entries(SUPPORTED_LANGUAGES).map(([code, label]) => ({
      code,
      label
    }))
  });
});

exports.getNewsByCategory = asyncHandler(async (req, res) => {
  const category = String(req.params.category || "").toLowerCase();
  const pageSize = Number(req.query.limit || 8);
  const language = String(req.query.language || "en");
  const data = await fetchCategoryNews(category, language, pageSize);
  res.json(data);
});

exports.getNewsBundle = asyncHandler(async (req, res) => {
  const language = getLanguageOrDefault(req.query.language);
  const limit = getSafeLimit(req.query.limit || 6);
  const categoryKeys = Object.keys(CATEGORY_QUERIES);

  const results = await Promise.all(
    categoryKeys.map(async (categoryKey) => {
      const data = await fetchCategoryNews(categoryKey, language, limit);
      return [categoryKey, data];
    })
  );

  res.json({
    language,
    languageLabel: SUPPORTED_LANGUAGES[language],
    categories: Object.fromEntries(results)
  });
});
