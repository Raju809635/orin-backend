const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      maxlength: 120
    },
    message: {
      type: String,
      required: true,
      maxlength: 1000
    },
    type: {
      type: String,
      enum: ["announcement", "system", "booking", "approval", "direct"],
      default: "announcement"
    },
    sentBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    targetRole: {
      type: String,
      enum: ["student", "mentor", "admin", "all"],
      default: "all"
    },
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },
    readByRecipient: {
      type: Boolean,
      default: false
    }
  },
  { timestamps: true }
);

notificationSchema.index({ createdAt: -1 });
notificationSchema.index({ targetRole: 1, createdAt: -1 });

function dispatchNotificationPush(doc) {
  if (!doc) return;
  const notification = typeof doc.toObject === "function" ? doc.toObject() : doc;
  setImmediate(() => {
    try {
      const { dispatchPushNotification } = require("../services/pushNotificationService");
      dispatchPushNotification({
        title: notification.title,
        message: notification.message,
        type: notification.type,
        targetRole: notification.targetRole,
        recipientUserId: notification.recipient || null,
        notificationId: notification._id
      }).catch(() => null);
    } catch {
      // Notification writes should never fail because push delivery is unavailable.
    }
  });
}

notificationSchema.post("save", function notifyAfterSave(doc) {
  dispatchNotificationPush(doc);
});

notificationSchema.post("insertMany", function notifyAfterInsertMany(docs) {
  (Array.isArray(docs) ? docs : []).forEach(dispatchNotificationPush);
});

module.exports = mongoose.model("Notification", notificationSchema);
