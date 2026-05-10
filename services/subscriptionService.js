const UserSubscription = require("../models/UserSubscription");
const { aiChatDailyLimit } = require("../config/env");

const PREMIUM_PRODUCT_ID = "orin_premium";
const SUBSCRIPTION_ENFORCEMENT_ENABLED = false;

const SUBSCRIPTION_PLANS = [
  {
    id: "monthly_49",
    productId: PREMIUM_PRODUCT_ID,
    basePlanId: "monthly_49",
    title: "ORIN Premium Monthly",
    priceLabel: "₹49/month",
    billingPeriod: "P1M",
    recommended: false,
    features: [
      "Full AI study tools",
      "Higher Ask ORIN daily limit",
      "Premium community challenges",
      "Certificates and advanced learning resources"
    ]
  },
  {
    id: "annual_499",
    productId: PREMIUM_PRODUCT_ID,
    basePlanId: "annual_499",
    title: "ORIN Premium Annual",
    priceLabel: "₹499/year",
    billingPeriod: "P1Y",
    recommended: true,
    badge: "Best Value",
    features: [
      "Full academic year support",
      "2 months free compared with monthly",
      "Summer Bridge AI preparation",
      "Premium AI and community tools"
    ]
  }
];

function sanitizePlanText(value = "") {
  const text = String(value || "");
  const blockedTerms = ["mission vishnu", "mv-internal", "team target"];
  let safeText = text;
  blockedTerms.forEach((term) => {
    safeText = safeText.replace(new RegExp(term, "ig"), "ORIN");
  });
  return safeText.trim();
}

const SAFE_SUBSCRIPTION_PLANS = SUBSCRIPTION_PLANS.map((plan) => ({
  ...plan,
  title: sanitizePlanText(plan.title),
  badge: sanitizePlanText(plan.badge || ""),
  features: Array.isArray(plan.features) ? plan.features.map((item) => sanitizePlanText(item)) : []
}));

function isSubscriptionActive(subscription, now = new Date()) {
  if (!subscription || subscription.status !== "active") return false;
  if (!subscription.expiresAt) return true;
  return new Date(subscription.expiresAt).getTime() > now.getTime();
}

async function getActiveSubscription(userId) {
  const subscriptions = await UserSubscription.find({
    userId,
    status: "active",
    $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }]
  })
    .sort({ expiresAt: -1, updatedAt: -1 })
    .lean();

  return subscriptions.find((subscription) => isSubscriptionActive(subscription)) || null;
}

async function getSubscriptionEntitlement(userId) {
  const activeSubscription = await getActiveSubscription(userId);
  const isPremium = Boolean(activeSubscription);
  return {
    isPremium,
    enforcementEnabled: SUBSCRIPTION_ENFORCEMENT_ENABLED,
    planId: activeSubscription?.planId || "free",
    productId: activeSubscription?.productId || "",
    basePlanId: activeSubscription?.basePlanId || "",
    source: activeSubscription?.source || "free",
    expiresAt: activeSubscription?.expiresAt || null,
    aiChatDailyLimit: getAiChatDailyLimit({ isPremium })
  };
}

function getAiChatDailyLimit(entitlement) {
  if (!SUBSCRIPTION_ENFORCEMENT_ENABLED) return Math.max(Number(aiChatDailyLimit || 40), 120);
  return entitlement?.isPremium ? Math.max(Number(aiChatDailyLimit || 40), 120) : Number(aiChatDailyLimit || 40);
}

function normalizePlanId(planId, basePlanId) {
  const candidate = String(planId || basePlanId || "").trim();
  if (candidate === "annual_499") return "annual_499";
  if (candidate === "monthly_49") return "monthly_49";
  if (candidate === "institution_access") return "institution_access";
  return "monthly_49";
}

module.exports = {
  PREMIUM_PRODUCT_ID,
  SUBSCRIPTION_ENFORCEMENT_ENABLED,
  SUBSCRIPTION_PLANS: SAFE_SUBSCRIPTION_PLANS,
  getActiveSubscription,
  getSubscriptionEntitlement,
  getAiChatDailyLimit,
  isSubscriptionActive,
  normalizePlanId
};
