const AppMetricEvent = require("../models/AppMetricEvent");
const asyncHandler = require("../utils/asyncHandler");

const DAY_MS = 24 * 60 * 60 * 1000;

function cleanText(value = "", max = 120) {
  return String(value || "").trim().slice(0, max);
}

function normalizeEventName(value = "") {
  const key = cleanText(value, 40).toLowerCase();
  return ["app_open", "login", "admin_app_open", "admin_login", "error"].includes(key) ? key : "app_open";
}

function normalizeAppName(value = "") {
  return cleanText(value, 40).toLowerCase() === "orin_admin" ? "orin_admin" : "orin";
}

function dateDaysAgo(days) {
  return new Date(Date.now() - days * DAY_MS);
}

function periodMatch(days = 30) {
  return { occurredAt: { $gte: dateDaysAgo(days) } };
}

function getHeaderCountry(req) {
  return cleanText(
    req.headers["cf-ipcountry"] ||
      req.headers["x-vercel-ip-country"] ||
      req.headers["x-country-code"] ||
      "",
    16
  ).toUpperCase();
}

exports.recordAppMetricEvent = asyncHandler(async (req, res) => {
  const installationId = cleanText(req.body?.installationId, 120);
  if (!installationId) {
    return res.status(202).json({ recorded: false, message: "Missing installation id" });
  }

  await AppMetricEvent.create({
    installationId,
    eventName: normalizeEventName(req.body?.eventName),
    appName: normalizeAppName(req.body?.appName),
    appVersion: cleanText(req.body?.appVersion, 40),
    buildNumber: cleanText(req.body?.buildNumber, 40),
    platform: cleanText(req.body?.platform, 40).toLowerCase(),
    osVersion: cleanText(req.body?.osVersion, 60),
    deviceBrand: cleanText(req.body?.deviceBrand, 80),
    deviceModel: cleanText(req.body?.deviceModel, 100),
    country: cleanText(req.body?.country, 80) || getHeaderCountry(req),
    region: cleanText(req.body?.region, 80),
    role: cleanText(req.body?.role, 40),
    learnerStage: cleanText(req.body?.learnerStage, 40),
    metadata: typeof req.body?.metadata === "object" && req.body.metadata !== null ? req.body.metadata : {},
    ipCountry: getHeaderCountry(req),
    source: "client"
  });

  res.status(202).json({ recorded: true });
});

async function distinctCount(match, field) {
  const values = await AppMetricEvent.distinct(field, match);
  return values.filter(Boolean).length;
}

async function groupTop(match, field, limit = 12) {
  return AppMetricEvent.aggregate([
    { $match: match },
    { $group: { _id: `$${field}`, count: { $sum: 1 }, devices: { $addToSet: "$installationId" } } },
    { $project: { _id: 1, count: 1, deviceCount: { $size: "$devices" } } },
    { $sort: { deviceCount: -1, count: -1 } },
    { $limit: limit }
  ]);
}

async function dailyActivity(days = 14) {
  return AppMetricEvent.aggregate([
    { $match: periodMatch(days) },
    {
      $group: {
        _id: {
          day: { $dateToString: { format: "%Y-%m-%d", date: "$occurredAt" } },
          appName: "$appName"
        },
        events: { $sum: 1 },
        devices: { $addToSet: "$installationId" }
      }
    },
    {
      $project: {
        _id: 0,
        date: "$_id.day",
        appName: "$_id.appName",
        events: 1,
        activeDevices: { $size: "$devices" }
      }
    },
    { $sort: { date: 1, appName: 1 } }
  ]);
}

exports.getAppMetricsSummary = asyncHandler(async (_req, res) => {
  const [totalObservedDevices, activeToday, active7d, active30d, eventCount30d, latestEvents, versions, countries, devices] =
    await Promise.all([
      distinctCount({}, "installationId"),
      distinctCount(periodMatch(1), "installationId"),
      distinctCount(periodMatch(7), "installationId"),
      distinctCount(periodMatch(30), "installationId"),
      AppMetricEvent.countDocuments(periodMatch(30)),
      AppMetricEvent.find().sort({ occurredAt: -1 }).limit(8).lean(),
      groupTop(periodMatch(30), "appVersion", 8),
      groupTop(periodMatch(30), "country", 8),
      groupTop(periodMatch(30), "deviceModel", 8)
    ]);

  res.json({
    source: "backend_observed",
    sourceLabel: "ORIN observed devices and activity",
    officialPlayConsoleConnected: false,
    totalObservedDevices,
    activeToday,
    active7d,
    active30d,
    eventCount30d,
    latestVersion: versions.find((item) => item._id)?._id || "",
    topCountry: countries.find((item) => item._id)?._id || "",
    topDevice: devices.find((item) => item._id)?._id || "",
    latestEvents
  });
});

exports.getAppMetricsCountries = asyncHandler(async (_req, res) => {
  const rows = await groupTop(periodMatch(90), "country", 30);
  res.json(rows.map((item) => ({ name: item._id || "Unknown", events: item.count, devices: item.deviceCount })));
});

exports.getAppMetricsDevices = asyncHandler(async (_req, res) => {
  const [models, brands, platforms] = await Promise.all([
    groupTop(periodMatch(90), "deviceModel", 30),
    groupTop(periodMatch(90), "deviceBrand", 20),
    groupTop(periodMatch(90), "platform", 10)
  ]);
  res.json({
    models: models.map((item) => ({ name: item._id || "Unknown", events: item.count, devices: item.deviceCount })),
    brands: brands.map((item) => ({ name: item._id || "Unknown", events: item.count, devices: item.deviceCount })),
    platforms: platforms.map((item) => ({ name: item._id || "Unknown", events: item.count, devices: item.deviceCount }))
  });
});

exports.getAppMetricsVersions = asyncHandler(async (_req, res) => {
  const rows = await groupTop(periodMatch(90), "appVersion", 30);
  res.json(rows.map((item) => ({ version: item._id || "Unknown", events: item.count, devices: item.deviceCount })));
});

exports.getAppMetricsActivity = asyncHandler(async (_req, res) => {
  res.json(await dailyActivity(30));
});
