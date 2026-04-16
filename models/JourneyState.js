const mongoose = require("mongoose");

const roadmapStepSchema = new mongoose.Schema(
  {
    id: { type: String, default: "" },
    title: { type: String, default: "" },
    status: {
      type: String,
      enum: ["locked", "active", "completed"],
      default: "locked"
    },
    priority: { type: Number, default: 0 },
    xpReward: { type: Number, default: 0 },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    unlockedAt: { type: Date, default: null },
    proofStatus: {
      type: String,
      enum: ["not_submitted", "submitted", "approved"],
      default: "not_submitted"
    },
    proofText: { type: String, default: "" },
    proofLink: { type: String, default: "" },
    proofImageUrl: { type: String, default: "" },
    proofSubmittedAt: { type: Date, default: null }
  },
  { _id: false }
);

const projectIdeaTaskSchema = new mongoose.Schema(
  {
    id: { type: String, default: "" },
    title: { type: String, default: "" },
    done: { type: Boolean, default: false }
  },
  { _id: false }
);

const projectIdeaStateSchema = new mongoose.Schema(
  {
    key: { type: String, default: "" },
    title: { type: String, default: "" },
    status: {
      type: String,
      enum: ["not_started", "active", "completed"],
      default: "not_started"
    },
    tasks: { type: [projectIdeaTaskSchema], default: [] },
    proofStatus: {
      type: String,
      enum: ["not_submitted", "submitted", "approved"],
      default: "not_submitted"
    },
    proofNote: { type: String, default: "" },
    proofLink: { type: String, default: "" },
    proofImageUrl: { type: String, default: "" },
    proofSubmittedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    updatedAt: { type: Date, default: null }
  },
  { _id: false }
);

const journeyStateSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true
    },
    role: {
      type: String,
      enum: ["student", "mentor", "admin"],
      default: "student"
    },
    goal: {
      title: { type: String, default: "" },
      domain: { type: String, default: "" },
      subDomain: { type: String, default: "" },
      focus: { type: String, default: "" },
      source: {
        type: String,
        enum: ["assistant", "manual", "profile", ""],
        default: ""
      },
      updatedAt: { type: Date, default: null }
    },
    skillProfile: {
      level: {
        type: String,
        enum: ["beginner", "intermediate", "advanced", ""],
        default: ""
      },
      knownSkills: { type: [String], default: [] },
      missingSkills: { type: [String], default: [] },
      readinessScore: { type: Number, default: 0 },
      updatedAt: { type: Date, default: null }
    },
    roadmap: {
      roadmapId: { type: String, default: "" },
      steps: { type: [roadmapStepSchema], default: [] },
      progressPercent: { type: Number, default: 0 },
      currentStepId: { type: String, default: "" },
      updatedAt: { type: Date, default: null }
    },
    projects: {
      activeProjectIds: { type: [String], default: [] },
      completedProjectIds: { type: [String], default: [] },
      currentProjectStage: { type: String, default: "" },
      items: { type: [projectIdeaStateSchema], default: [] },
      updatedAt: { type: Date, default: null }
    },
    challenges: {
      joinedChallengeIds: { type: [String], default: [] },
      completedChallengeIds: { type: [String], default: [] },
      unlockedChallengeIds: { type: [String], default: [] },
      updatedAt: { type: Date, default: null }
    },
    internships: {
      readinessScore: { type: Number, default: 0 },
      unlocked: { type: Boolean, default: false },
      reasons: { type: [String], default: [] },
      updatedAt: { type: Date, default: null }
    },
    certificates: {
      earnedCertificateIds: { type: [String], default: [] },
      pendingCertificateIds: { type: [String], default: [] },
      updatedAt: { type: Date, default: null }
    },
    recommendations: {
      libraryResourceIds: { type: [String], default: [] },
      projectIdeaIds: { type: [String], default: [] },
      mentorIds: { type: [String], default: [] },
      internshipIds: { type: [String], default: [] },
      feedTags: { type: [String], default: [] },
      updatedAt: { type: Date, default: null }
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("JourneyState", journeyStateSchema);
