const mongoose = require("mongoose");

const dailyTaskProgressSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    taskKey: {
      type: String,
      required: true
    },
    dateKey: {
      type: String,
      required: true
    },
    status: {
      type: String,
      enum: ["pending", "completed"],
      default: "completed"
    },
    xpEarned: {
      type: Number,
      default: 20
    }
  },
  { timestamps: true }
);

dailyTaskProgressSchema.index({ userId: 1, taskKey: 1, dateKey: 1 }, { unique: true });
dailyTaskProgressSchema.index({ dateKey: 1, xpEarned: -1 });

module.exports = mongoose.model("DailyTaskProgress", dailyTaskProgressSchema);
