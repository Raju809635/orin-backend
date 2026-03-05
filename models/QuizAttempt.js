const mongoose = require("mongoose");

const quizAttemptSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    dateKey: {
      type: String,
      required: true
    },
    domain: {
      type: String,
      required: true
    },
    score: {
      type: Number,
      default: 0
    },
    totalQuestions: {
      type: Number,
      default: 5
    },
    xpAwarded: {
      type: Number,
      default: 0
    },
    streakAfter: {
      type: Number,
      default: 0
    },
    answers: {
      type: [
        {
          questionId: { type: String, default: "" },
          skillName: { type: String, default: "" },
          difficulty: { type: String, enum: ["easy", "medium", "hard"], default: "medium" },
          selectedOption: { type: String, default: "" },
          correctOption: { type: String, default: "" },
          isCorrect: { type: Boolean, default: false }
        }
      ],
      default: []
    }
  },
  { timestamps: true }
);

quizAttemptSchema.index({ userId: 1, dateKey: 1 }, { unique: true });

module.exports = mongoose.model("QuizAttempt", quizAttemptSchema);
