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
    startsAt: { type: Date, required: true, index: true },
    endsAt: { type: Date, default: null },
    meetingLink: { type: String, default: "" },
    domainTags: { type: [String], default: [] },
    isPublic: { type: Boolean, default: true },
    isCancelled: { type: Boolean, default: false }
  },
  { timestamps: true }
);

mentorLiveSessionSchema.index({ isPublic: 1, isCancelled: 1, startsAt: 1 });

module.exports = mongoose.model("MentorLiveSession", mentorLiveSessionSchema);
