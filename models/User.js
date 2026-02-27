const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true,
    unique: true
  },
  password: {
    type: String,
    required: true,
    select: false
  },
  role: {
    type: String,
    enum: ["student", "mentor", "admin"],
    default: "student"
  },
  status: {
    type: String,
    enum: ["pending", "approved"],
    default: "pending"
  },
  domain: {
    type: String
  },
  bio: {
    type: String,
    maxlength: 500,
    default: ""
  },
  expertise: {
    type: [String],
    default: []
  },
  notificationPreferences: {
    email: { type: Boolean, default: true },
    push: { type: Boolean, default: true },
    sms: { type: Boolean, default: false }
  },
  privacySettings: {
    profileVisibility: {
      type: String,
      enum: ["public", "private"],
      default: "public"
    },
    showEmail: { type: Boolean, default: false },
    showSessionHistory: { type: Boolean, default: true }
  },
  isDeleted: {
    type: Boolean,
    default: false,
    index: true
  },
  deletedAt: {
    type: Date,
    default: null
  }
}, { timestamps: true });

module.exports = mongoose.model("User", userSchema);
