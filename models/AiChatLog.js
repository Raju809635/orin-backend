const mongoose = require("mongoose");

const aiChatLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    role: {
      type: String,
      enum: ["student", "mentor"],
      required: true
    },
    provider: {
      type: String,
      enum: ["groq", "gemini", "openai"],
      required: true
    },
    model: {
      type: String,
      required: true
    },
    prompt: {
      type: String,
      required: true,
      maxlength: 4000
    },
    response: {
      type: String,
      required: true,
      maxlength: 12000
    },
    context: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  { timestamps: true }
);

aiChatLogSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model("AiChatLog", aiChatLogSchema);
