const mongoose = require("mongoose");

const competitionQuestionSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    text: { type: String, required: true },
    options: { type: [String], default: [] },
    correctOption: { type: String, required: true },
    explanation: { type: String, default: "" },
    durationSec: { type: Number, default: 30 }
  },
  { _id: false }
);

const competitionRegistrationSchema = new mongoose.Schema(
  {
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    studentName: { type: String, required: true },
    institutionName: { type: String, default: "", index: true },
    className: { type: String, default: "" },
    status: { type: String, enum: ["registered", "qualified_level2", "eliminated", "winner"], default: "registered" },
    qualifiedForLevel2: { type: Boolean, default: false },
    level2BatchIndex: { type: Number, default: -1 },
    registeredAt: { type: Date, default: Date.now }
  },
  { _id: false }
);

const competitionAnswerLogSchema = new mongoose.Schema(
  {
    questionId: { type: String, required: true },
    selectedOption: { type: String, default: "" },
    isCorrect: { type: Boolean, default: false },
    responseMs: { type: Number, default: 0 }
  },
  { _id: false }
);

const competitionLevelAttemptSchema = new mongoose.Schema(
  {
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    studentName: { type: String, default: "" },
    institutionName: { type: String, default: "" },
    className: { type: String, default: "" },
    level: { type: Number, enum: [1, 2], required: true },
    batchIndex: { type: Number, default: -1 },
    score: { type: Number, default: 0 },
    correctCount: { type: Number, default: 0 },
    totalTimeMs: { type: Number, default: 0 },
    percentage: { type: Number, default: 0 },
    grade: { type: String, default: "" },
    strengths: { type: [String], default: [] },
    weakAreas: { type: [String], default: [] },
    recommendations: { type: [String], default: [] },
    answers: { type: [competitionAnswerLogSchema], default: [] },
    submittedAt: { type: Date, default: Date.now }
  },
  { _id: false }
);

const competitionBatchParticipantSchema = new mongoose.Schema(
  {
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    studentName: { type: String, required: true },
    institutionName: { type: String, default: "" },
    className: { type: String, default: "" },
    score: { type: Number, default: 0 },
    avgResponseMs: { type: Number, default: 0 },
    totalResponseMs: { type: Number, default: 0 },
    answeredCount: { type: Number, default: 0 },
    lastAnsweredAt: { type: Date, default: null }
  },
  { _id: false }
);

const competitionLevel2BatchSchema = new mongoose.Schema(
  {
    index: { type: Number, required: true },
    label: { type: String, default: "" },
    status: { type: String, enum: ["waiting", "live", "completed"], default: "waiting" },
    participants: { type: [competitionBatchParticipantSchema], default: [] },
    questionSet: { type: [competitionQuestionSchema], default: [] },
    currentQuestionIndex: { type: Number, default: 0 },
    questionStartedAt: { type: Date, default: null },
    currentQuestionAnsweredUserIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    currentQuestionFirstCorrectUserId: { type: mongoose.Schema.Types.ObjectId, default: null },
    winnerStudentId: { type: mongoose.Schema.Types.ObjectId, default: null }
  },
  { _id: false }
);

const highSchoolCompetitionSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    bannerImageUrl: { type: String, default: "" },
    subject: { type: String, required: true, trim: true },
    chapter: { type: String, default: "", trim: true },
    topics: { type: [String], default: [] },
    scopeType: { type: String, enum: ["institution_only", "multi_institution", "open_highschool"], default: "institution_only", index: true },
    allowedInstitutions: { type: [String], default: [] },
    classLevelFilter: { type: [String], default: [] },
    registrationDeadline: { type: Date, required: true },
    level1At: { type: Date, required: true },
    level2At: { type: Date, default: null },
    qualificationTopN: { type: Number, default: 20 },
    level1QuestionCount: { type: Number, default: 15 },
    level1TimeModeSec: { type: Number, enum: [10, 30], default: 30 },
    level1Questions: { type: [competitionQuestionSchema], default: [] },
    level2Batches: { type: [competitionLevel2BatchSchema], default: [] },
    registrations: { type: [competitionRegistrationSchema], default: [] },
    attempts: { type: [competitionLevelAttemptSchema], default: [] },
    winnerStudentId: { type: mongoose.Schema.Types.ObjectId, default: null },
    winnerStudentName: { type: String, default: "" },
    winnerInstitutionName: { type: String, default: "" },
    status: {
      type: String,
      enum: ["draft", "registration_open", "level1_live", "level1_closed", "level2_live", "completed"],
      default: "draft",
      index: true
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    createdByName: { type: String, default: "" },
    institutionName: { type: String, default: "", trim: true, index: true }
  },
  { timestamps: true }
);

highSchoolCompetitionSchema.index({ status: 1, registrationDeadline: 1 });
highSchoolCompetitionSchema.index({ subject: 1, scopeType: 1, createdAt: -1 });

module.exports =
  mongoose.models.HighSchoolCompetition ||
  mongoose.model("HighSchoolCompetition", highSchoolCompetitionSchema);
