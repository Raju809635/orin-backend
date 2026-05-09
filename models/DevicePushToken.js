const mongoose = require("mongoose");

const devicePushTokenSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    expoPushToken: {
      type: String,
      required: true,
      index: true
    },
    platform: {
      type: String,
      enum: ["android", "ios", "web", "unknown"],
      default: "unknown"
    },
    deviceId: {
      type: String,
      default: ""
    },
    appVersion: {
      type: String,
      default: ""
    },
    enabled: {
      type: Boolean,
      default: true,
      index: true
    },
    lastSeenAt: {
      type: Date,
      default: Date.now
    },
    disabledAt: {
      type: Date,
      default: null
    },
    failureCount: {
      type: Number,
      default: 0
    },
    lastError: {
      type: String,
      default: ""
    }
  },
  { timestamps: true }
);

devicePushTokenSchema.index({ userId: 1, expoPushToken: 1 }, { unique: true });
devicePushTokenSchema.index({ expoPushToken: 1, enabled: 1 });

module.exports = mongoose.model("DevicePushToken", devicePushTokenSchema);
