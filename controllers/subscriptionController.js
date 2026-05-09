const UserSubscription = require("../models/UserSubscription");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { createAuditLog } = require("../services/auditService");
const {
  PREMIUM_PRODUCT_ID,
  SUBSCRIPTION_PLANS,
  getSubscriptionEntitlement,
  normalizePlanId
} = require("../services/subscriptionService");
const { verifyGooglePlaySubscriptionPurchase } = require("../services/googlePlayService");

exports.getSubscriptionPlans = asyncHandler(async (_req, res) => {
  res.status(200).json({
    productId: PREMIUM_PRODUCT_ID,
    plans: SUBSCRIPTION_PLANS,
    policy: {
      androidBilling: "google_play",
      note: "Android subscriptions for digital ORIN features must be completed through Google Play Billing."
    }
  });
});

exports.getMySubscription = asyncHandler(async (req, res) => {
  const entitlement = await getSubscriptionEntitlement(req.user.id);
  const latest = await UserSubscription.findOne({ userId: req.user.id })
    .sort({ updatedAt: -1 })
    .select("planId productId basePlanId status source expiresAt autoRenewing verificationStatus verificationMessage updatedAt")
    .lean();

  res.status(200).json({
    entitlement,
    latestSubscription: latest || null
  });
});

exports.recordGooglePlayPurchase = asyncHandler(async (req, res) => {
  const productId = String(req.body?.productId || PREMIUM_PRODUCT_ID).trim();
  const basePlanId = String(req.body?.basePlanId || "").trim();
  const purchaseToken = String(req.body?.purchaseToken || "").trim();
  const orderId = String(req.body?.orderId || "").trim();

  if (productId !== PREMIUM_PRODUCT_ID) {
    throw new ApiError(400, "Unsupported subscription product");
  }
  if (!purchaseToken) {
    throw new ApiError(400, "Google Play purchase token is required");
  }

  const planId = normalizePlanId(req.body?.planId, basePlanId);
  const verification = await verifyGooglePlaySubscriptionPurchase(purchaseToken);
  const productMatches = !verification.configured || !verification.productId || verification.productId === productId;
  if (verification.configured && verification.isActive && !productMatches) {
    verification.isActive = false;
    verification.message = `Google Play purchase product mismatch: expected ${productId}`;
  }
  const verifiedBasePlanId = verification.basePlanId || basePlanId || planId;
  const verifiedPlanId = normalizePlanId(planId, verifiedBasePlanId);
  const nextStatus = verification.configured
    ? verification.isActive
      ? "active"
      : "rejected"
    : "pending_verification";
  const verificationStatus = verification.configured
    ? verification.isActive
      ? "verified"
      : "failed"
    : "pending";

  const subscription = await UserSubscription.findOneAndUpdate(
    { userId: req.user.id, productId, purchaseToken },
    {
      $set: {
        planId: verifiedPlanId,
        productId,
        basePlanId: verifiedBasePlanId,
        source: "google_play",
        orderId: verification.latestOrderId || orderId,
        status: nextStatus,
        startsAt: verification.raw?.startTime ? new Date(verification.raw.startTime) : new Date(),
        expiresAt: verification.expiresAt || null,
        autoRenewing: Boolean(verification.autoRenewing),
        verificationStatus,
        verificationMessage: verification.message || "Purchase token captured",
        rawProviderPayload: {
          packageName: req.body?.packageName || "",
          transactionDate: req.body?.transactionDate || "",
          acknowledged: Boolean(req.body?.acknowledged),
          googlePlay: verification.raw || null,
          googlePlayState: verification.state || "",
          googlePlayRegionCode: verification.regionCode || "",
          googlePlayAcknowledgementState: verification.acknowledgementState || ""
        }
      }
    },
    { upsert: true, new: true, runValidators: true }
  ).select("planId productId basePlanId status source expiresAt verificationStatus verificationMessage");

  await createAuditLog({
    req,
    actorId: req.user.id,
    action: "subscription.google_play_purchase.record",
    entityType: "UserSubscription",
    entityId: subscription._id
  });

  res.status(verification.isActive ? 200 : 202).json({
    message: verification.isActive ? "Purchase verified and Premium is active" : "Purchase recorded for verification",
    subscription,
    entitlement: await getSubscriptionEntitlement(req.user.id)
  });
});
