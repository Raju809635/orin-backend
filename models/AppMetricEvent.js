const mongoose = require("mongoose");

const appMetricEventSchema = new mongoose.Schema(
  {
    installationId: { type: String, required: true, trim: true, index: true },
    eventName: {
      type: String,
      enum: ["app_open", "login", "admin_app_open", "admin_login", "error"],
      required: true,
      index: true
    },
    appName: { type: String, enum: ["orin", "orin_admin"], default: "orin", index: true },
    appVersion: { type: String, default: "", trim: true, index: true },
    buildNumber: { type: String, default: "", trim: true },
    platform: { type: String, default: "", trim: true, index: true },
    osVersion: { type: String, default: "", trim: true },
    deviceBrand: { type: String, default: "", trim: true, index: true },
    deviceModel: { type: String, default: "", trim: true, index: true },
    country: { type: String, default: "", trim: true, index: true },
    region: { type: String, default: "", trim: true, index: true },
    role: { type: String, default: "", trim: true, index: true },
    learnerStage: { type: String, default: "", trim: true, index: true },
    source: { type: String, default: "client", trim: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    occurredAt: { type: Date, default: Date.now, index: true },
    ipCountry: { type: String, default: "", trim: true }
  },
  { timestamps: true }
);

appMetricEventSchema.index({ appName: 1, occurredAt: -1 });
appMetricEventSchema.index({ appName: 1, installationId: 1, occurredAt: -1 });

module.exports = mongoose.model("AppMetricEvent", appMetricEventSchema);
