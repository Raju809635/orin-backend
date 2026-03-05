const mongoose = require("mongoose");

const quizStreakSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true
    },
    currentStreak: {
      type: Number,
      default: 0
    },
    lastQuizDate: {
      type: String,
      default: ""
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("QuizStreak", quizStreakSchema);
