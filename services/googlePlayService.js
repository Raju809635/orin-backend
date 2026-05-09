const jwt = require("jsonwebtoken");
const {
  googlePlayPackageName,
  googlePlayServiceAccountEmail,
  googlePlayServiceAccountPrivateKey,
  googlePlaySubscriptionProductId
} = require("../config/env");

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const ANDROID_PUBLISHER_SCOPE = "https://www.googleapis.com/auth/androidpublisher";

let cachedAccessToken = null;
let cachedAccessTokenExpiresAt = 0;

function normalizePrivateKey(value) {
  return String(value || "").replace(/\\n/g, "\n").trim();
}

function isGooglePlayVerificationConfigured() {
  return Boolean(googlePlayPackageName && googlePlayServiceAccountEmail && normalizePrivateKey(googlePlayServiceAccountPrivateKey));
}

async function getGoogleAccessToken() {
  if (cachedAccessToken && cachedAccessTokenExpiresAt > Date.now() + 60_000) {
    return cachedAccessToken;
  }

  const privateKey = normalizePrivateKey(googlePlayServiceAccountPrivateKey);
  if (!googlePlayServiceAccountEmail || !privateKey) {
    throw new Error("Google Play service account credentials are not configured");
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const assertion = jwt.sign(
    {
      iss: googlePlayServiceAccountEmail,
      scope: ANDROID_PUBLISHER_SCOPE,
      aud: GOOGLE_TOKEN_URL,
      iat: nowSeconds,
      exp: nowSeconds + 3600
    },
    privateKey,
    { algorithm: "RS256" }
  );

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    }).toString()
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error_description || payload?.error || "Google OAuth token request failed");
  }

  cachedAccessToken = payload.access_token;
  cachedAccessTokenExpiresAt = Date.now() + Math.max(Number(payload.expires_in || 3600) - 120, 60) * 1000;
  return cachedAccessToken;
}

function deriveEntitlementFromSubscription(subscription) {
  const state = String(subscription?.subscriptionState || "");
  const lineItem = Array.isArray(subscription?.lineItems) ? subscription.lineItems[0] : null;
  const expiryTime = lineItem?.expiryTime ? new Date(lineItem.expiryTime) : null;
  const expiresInFuture = expiryTime ? expiryTime.getTime() > Date.now() : false;
  const stillEntitledStates = new Set([
    "SUBSCRIPTION_STATE_ACTIVE",
    "SUBSCRIPTION_STATE_IN_GRACE_PERIOD",
    "SUBSCRIPTION_STATE_CANCELED"
  ]);

  return {
    isActive: stillEntitledStates.has(state) && (!expiryTime || expiresInFuture),
    state,
    productId: lineItem?.productId || googlePlaySubscriptionProductId,
    basePlanId: lineItem?.offerDetails?.basePlanId || "",
    latestOrderId: lineItem?.latestSuccessfulOrderId || subscription?.latestOrderId || "",
    expiresAt: expiryTime,
    autoRenewing: Boolean(lineItem?.autoRenewingPlan?.autoRenewEnabled),
    acknowledgementState: subscription?.acknowledgementState || "",
    regionCode: subscription?.regionCode || "",
    raw: subscription || {}
  };
}

async function verifyGooglePlaySubscriptionPurchase(purchaseToken) {
  if (!isGooglePlayVerificationConfigured()) {
    return {
      configured: false,
      isActive: false,
      message: "Google Play verification credentials are not configured"
    };
  }

  const accessToken = await getGoogleAccessToken();
  const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(
    googlePlayPackageName
  )}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json"
    }
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      configured: true,
      isActive: false,
      state: "verification_failed",
      message: payload?.error?.message || payload?.error_description || "Google Play subscription verification failed",
      raw: payload
    };
  }

  return {
    configured: true,
    message: "Google Play subscription verified",
    ...deriveEntitlementFromSubscription(payload)
  };
}

module.exports = {
  isGooglePlayVerificationConfigured,
  verifyGooglePlaySubscriptionPurchase
};
