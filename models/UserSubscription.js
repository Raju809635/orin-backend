const mongoose = require("mongoose");

const userSubscriptionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    planId: {
      type: String,
      enum: ["free", "monthly_49", "annual_499", "institution_access"],
      required: true,
      index: true
    },
    productId: {
      type: String,
      default: "orin_premium",
      index: true
    },
    basePlanId: {
      type: String,
      default: ""
    },
    status: {
      type: String,
      enum: ["active", "expired", "pending_verification", "cancelled", "rejected"],
      default: "pending_verification",
      index: true
    },
    source: {
      type: String,
      enum: ["google_play", "institution", "admin"],
      default: "google_play"
    },
    purchaseToken: {
      type: String,
      default: "",
      index: true
    },
    orderId: {
      type: String,
      default: ""
    },
    startsAt: {
      type: Date,
      default: Date.now
    },
    expiresAt: {
      type: Date,
      default: null,
      index: true
    },
    autoRenewing: {
      type: Boolean,
      default: false
    },
    verificationStatus: {
      type: String,
      enum: ["not_required", "pending", "verified", "failed"],
      default: "pending"
    },
    verificationMessage: {
      type: String,
      default: ""
    },
    rawProviderPayload: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  { timestamps: true }
);

userSubscriptionSchema.index({ userId: 1, status: 1, expiresAt: -1 });
userSubscriptionSchema.index(
  { userId: 1, productId: 1, purchaseToken: 1 },
  { unique: true, partialFilterExpression: { purchaseToken: { $gt: "" } } }
);

module.exports = mongoose.model("UserSubscription", userSubscriptionSchema);
