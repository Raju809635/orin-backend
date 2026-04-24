const mongoose = require("mongoose");

const institutionRoadmapSubmissionSchema = new mongoose.Schema(
  {
    roadmapId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "InstitutionRoadmap",
      required: true,
      index: true
    },
    weekId: {
      type: String,
      required: true,
      index: true
    },
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    proofText: { type: String, default: "", trim: true, maxlength: 3000 },
    proofLink: { type: String, default: "", trim: true, maxlength: 1200 },
    proofImageUrl: { type: String, default: "", trim: true, maxlength: 2000 },
    status: {
      type: String,
      enum: ["submitted", "accepted", "rejected"],
      default: "submitted",
      index: true
    },
    submittedAt: { type: Date, default: Date.now },
    mentorReview: {
      reviewedAt: { type: Date, default: null },
      notes: { type: String, default: "", trim: true, maxlength: 2000 },
      xpAwarded: { type: Number, default: 0 },
      certificateId: { type: mongoose.Schema.Types.ObjectId, ref: "OrinCertification", default: null }
    }
  },
  { timestamps: true }
);

institutionRoadmapSubmissionSchema.index({ roadmapId: 1, studentId: 1, weekId: 1 }, { unique: true });

module.exports = mongoose.model("InstitutionRoadmapSubmission", institutionRoadmapSubmissionSchema);
