const mongoose = require("mongoose");

const sprintScheduleItemSchema = new mongoose.Schema(
  {
    label: { type: String, default: "", trim: true },
    startsAt: { type: Date, default: null },
    durationMinutes: { type: Number, default: 60, min: 15, max: 480 }
  },
  { _id: false }
);

const mentorSprintSchema = new mongoose.Schema(
  {
    mentorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    title: { type: String, required: true, trim: true },
    domain: { type: String, default: "", trim: true, index: true },
    description: { type: String, default: "" },
    posterImageUrl: { type: String, default: "" },
    curriculumDocumentUrl: { type: String, default: "" },
    curriculumFileType: { type: String, default: "", trim: true },
    startDate: { type: Date, required: true, index: true },
    endDate: { type: Date, required: true },
    durationWeeks: { type: Number, default: 1, min: 1, max: 52 },
    totalLiveSessions: { type: Number, default: 1, min: 1, max: 100 },
    sessionSchedule: { type: [sprintScheduleItemSchema], default: [] },
    weeklyPlan: { type: [String], default: [] },
    outcomes: { type: [String], default: [] },
    tools: { type: [String], default: [] },
    meetingLink: { type: String, default: "" },
    sessionMode: {
      type: String,
      enum: ["free", "paid"],
      default: "free",
      index: true
    },
    price: { type: Number, default: 0, min: 0 },
    currency: { type: String, default: "INR", trim: true },
    minParticipants: { type: Number, default: 1, min: 1, max: 1000 },
    maxParticipants: { type: Number, default: 20, min: 1, max: 1000 },
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

mentorSprintSchema.index({ isPublic: 1, isCancelled: 1, approvalStatus: 1, startDate: 1 });
mentorSprintSchema.index({ mentorId: 1, approvalStatus: 1, startDate: -1 });

module.exports = mongoose.model("MentorSprint", mentorSprintSchema);
