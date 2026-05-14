const mongoose = require("mongoose");

const mentorGroupMessageSchema = new mongoose.Schema(
  {
    groupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MentorGroup",
      required: true,
      index: true
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    text: {
      type: String,
      default: "",
      maxlength: 2000
    },
    attachments: {
      type: [
        {
          type: { type: String, enum: ["image", "file"], default: "file" },
          url: { type: String, default: "" },
          name: { type: String, default: "" },
          mimeType: { type: String, default: "" }
        }
      ],
      default: []
    },
    reactions: {
      type: [
        {
          emoji: { type: String, required: true },
          userIds: { type: [mongoose.Schema.Types.ObjectId], ref: "User", default: [] }
        }
      ],
      default: []
    },
    editedAt: {
      type: Date,
      default: null
    },
    deletedAt: {
      type: Date,
      default: null
    }
  },
  { timestamps: true }
);

mentorGroupMessageSchema.index({ groupId: 1, createdAt: -1 });

module.exports = mongoose.model("MentorGroupMessage", mentorGroupMessageSchema);
