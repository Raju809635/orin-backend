const mongoose = require("mongoose");

const chatMessageSchema = new mongoose.Schema(
  {
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    text: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000
    },
    readAt: {
      type: Date,
      default: null
    }
  },
  { timestamps: true }
);

chatMessageSchema.index({ sender: 1, recipient: 1, createdAt: -1 });
chatMessageSchema.index({ recipient: 1, readAt: 1, createdAt: -1 });

module.exports = mongoose.model("ChatMessage", chatMessageSchema);
