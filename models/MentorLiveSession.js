const mongoose = require("mongoose");

const mentorLiveSessionSchema = new mongoose.Schema(
  {
    mentorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    title: { type: String, required: true, trim: true },
    topic: { type: String, default: "", trim: true },
    description: { type: String, default: "" },
    posterImageUrl: { type: String, default: "" },
    startsAt: { type: Date, required: true, index: true },
    endsAt: { type: Date, default: null },
    durationMinutes: { type: Number, default: 60, min: 15, max: 480 },
    meetingProvider: {
      type: String,
      enum: ["manual", "jitsi"],
      default: "manual"
    },
    meetingLink: { type: String, default: "" },
    meetingMeta: {
      roomName: { type: String, default: "" },
      createdAt: { type: Date, default: null },
      createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null
      }
    },
    domainTags: { type: [String], default: [] },
    sessionMode: {
      type: String,
      enum: ["free", "paid"],
      default: "free",
      index: true
    },
    price: { type: Number, default: 0, min: 0 },
    currency: { type: String, default: "INR", trim: true },
    maxParticipants: { type: Number, default: 50, min: 1, max: 1000 },
    interestedUserIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
      default: []
    },
    isPublic: { type: Boolean, default: true },
    isCancelled: { type: Boolean, default: false },
    approvalStatus: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true
    },
    adminReviewNote: { type: String, default: "" },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    reviewedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

mentorLiveSessionSchema.index({ isPublic: 1, isCancelled: 1, startsAt: 1 });
mentorLiveSessionSchema.index({ mentorId: 1, approvalStatus: 1, startsAt: -1 });

module.exports = mongoose.model("MentorLiveSession", mentorLiveSessionSchema);
