const DevicePushToken = require("../models/DevicePushToken");
const User = require("../models/User");

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

function isExpoPushToken(token) {
  return /^ExponentPushToken\[[^\]]+\]$/.test(String(token || "")) || /^ExpoPushToken\[[^\]]+\]$/.test(String(token || ""));
}

function buildAudienceQuery({ recipientUserId, targetRole }) {
  if (recipientUserId) return { _id: recipientUserId, isDeleted: { $ne: true } };
  if (!targetRole || targetRole === "all") return { isDeleted: { $ne: true } };
  return { role: targetRole, isDeleted: { $ne: true } };
}

async function getPushTokensForAudience({ recipientUserId, targetRole }) {
  const users = await User.find(buildAudienceQuery({ recipientUserId, targetRole }))
    .select("_id notificationPreferences")
    .lean();
  const allowedUserIds = users
    .filter((user) => user.notificationPreferences?.push !== false)
    .map((user) => user._id);

  if (!allowedUserIds.length) return [];

  return DevicePushToken.find({
    userId: { $in: allowedUserIds },
    enabled: true
  })
    .select("_id expoPushToken")
    .lean();
}

async function sendExpoPushMessages(messages) {
  if (!messages.length) return [];

  const response = await fetch(EXPO_PUSH_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Accept-Encoding": "gzip, deflate",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(messages)
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.errors?.[0]?.message || payload?.message || "Expo push request failed");
  }
  return Array.isArray(payload?.data) ? payload.data : [];
}

async function markPushResults(tokens, results) {
  await Promise.all(
    tokens.map((token, index) => {
      const result = results[index] || {};
      if (result.status === "ok") {
        return DevicePushToken.updateOne(
          { _id: token._id },
          { $set: { lastSeenAt: new Date(), lastError: "", failureCount: 0 } }
        );
      }

      const errorMessage = result?.details?.error || result?.message || "push_failed";
      const update = {
        $set: { lastError: errorMessage },
        $inc: { failureCount: 1 }
      };

      if (errorMessage === "DeviceNotRegistered") {
        update.$set.enabled = false;
        update.$set.disabledAt = new Date();
      }

      return DevicePushToken.updateOne({ _id: token._id }, update);
    })
  );
}

async function dispatchPushNotification({ title, message, type = "announcement", targetRole = "all", recipientUserId = null, notificationId = null }) {
  const tokens = (await getPushTokensForAudience({ recipientUserId, targetRole })).filter((token) =>
    isExpoPushToken(token.expoPushToken)
  );

  if (!tokens.length) {
    return { attempted: 0, sent: 0 };
  }

  const messages = tokens.map((token) => ({
    to: token.expoPushToken,
    sound: "default",
    title,
    body: message,
    data: {
      notificationId: notificationId ? String(notificationId) : "",
      type,
      targetRole
    }
  }));

  const results = await sendExpoPushMessages(messages);
  await markPushResults(tokens, results);

  return {
    attempted: tokens.length,
    sent: results.filter((result) => result.status === "ok").length
  };
}

module.exports = {
  dispatchPushNotification,
  isExpoPushToken
};
