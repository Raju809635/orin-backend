const mongoose = require("mongoose");

const mentorGroupSchema = new mongoose.Schema(
  {
    mentorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    name: { type: String, required: true, trim: true },
    domain: { type: String, default: "", trim: true },
    description: { type: String, default: "" },
    avatarUrl: { type: String, default: "" },
    rules: { type: String, default: "" },
    maxStudents: { type: Number, default: 50 },
    memberIds: { type: [mongoose.Schema.Types.ObjectId], ref: "User", default: [] },
    pendingRequestIds: { type: [mongoose.Schema.Types.ObjectId], ref: "User", default: [] },
    topicTags: { type: [String], default: [] },
    schedule: { type: String, default: "Weekly sessions" },
    settings: {
      joinApproval: { type: Boolean, default: true },
      allowMemberMessages: { type: Boolean, default: true },
      allowMemberMedia: { type: Boolean, default: true },
      allowReactions: { type: Boolean, default: true }
    },
    isActive: { type: Boolean, default: true, index: true }
  },
  { timestamps: true }
);

mentorGroupSchema.index({ isActive: 1, updatedAt: -1 });

module.exports = mongoose.model("MentorGroup", mentorGroupSchema);
