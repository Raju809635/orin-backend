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

module.exports = mongoose.model("Notification", notificationSchema);
