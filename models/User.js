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
    enum: ["student", "mentor"],
    default: "student"
  },
  isAdmin: {
    type: Boolean,
    default: false,
    index: true
  },
  approvalStatus: {
    type: String,
    enum: ["pending", "approved", "rejected"],
    default: "approved"
  },
  primaryCategory: {
    type: String,
    default: ""
  },
  subCategory: {
    type: String,
    default: ""
  },
  specializations: {
    type: [String],
    default: []
  },
  sessionPrice: {
    type: Number,
    default: 0
  },
  availability: {
    type: [
      {
        day: { type: String, default: "" },
        slots: { type: [String], default: [] }
      }
    ],
    default: []
  },
  educationLevel: {
    type: String,
    default: ""
  },
  targetExam: {
    type: String,
    default: ""
  },
  interestedCategories: {
    type: [String],
    default: []
  },
  preferredLanguage: {
    type: String,
    default: ""
  },
  goals: {
    type: String,
    default: ""
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
