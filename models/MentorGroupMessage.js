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
      required: true,
      maxlength: 2000
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
