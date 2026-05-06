const mongoose = require("mongoose");

const battleQuestionSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    text: { type: String, required: true },
    options: { type: [String], default: [] },
    correctOption: { type: String, required: true },
    explanation: { type: String, default: "" },
    durationSec: { type: Number, default: 25 }
  },
  { _id: false }
);

const battleParticipantSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, default: "Student" },
    score: { type: Number, default: 0 },
    joinedAt: { type: Date, default: Date.now },
    lastAnsweredAt: { type: Date, default: null }
  },
  { _id: false }
);

const highSchoolQuizBattleRoomSchema = new mongoose.Schema(
  {
    roomCode: { type: String, required: true, unique: true, index: true },
    subject: { type: String, default: "General Studies" },
    topic: { type: String, default: "" },
    status: { type: String, enum: ["waiting", "live", "completed"], default: "waiting" },
    hostId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    participants: { type: [battleParticipantSchema], default: [] },
    questions: { type: [battleQuestionSchema], default: [] },
    currentQuestionIndex: { type: Number, default: 0 },
    questionStartedAt: { type: Date, default: null },
    currentQuestionAnsweredUserIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    currentQuestionFirstCorrectUserId: { type: mongoose.Schema.Types.ObjectId, default: null },
    expiresAt: { type: Date, default: () => new Date(Date.now() + 1000 * 60 * 60 * 8), index: { expires: 0 } }
  },
  { timestamps: true }
);

module.exports = mongoose.models.HighSchoolQuizBattleRoom || mongoose.model("HighSchoolQuizBattleRoom", highSchoolQuizBattleRoomSchema);
