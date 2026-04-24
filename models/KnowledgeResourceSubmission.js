const mongoose = require("mongoose");

const knowledgeResourceSubmissionSchema = new mongoose.Schema(
  {
    resourceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "KnowledgeResource",
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
    proofFiles: { type: [String], default: [] },
    status: {
      type: String,
      enum: ["submitted", "reviewed", "accepted", "rejected"],
      default: "submitted",
      index: true
    },
    submittedAt: { type: Date, default: Date.now },
    mentorReview: {
      reviewedAt: { type: Date, default: null },
      notes: { type: String, default: "", trim: true, maxlength: 2000 },
      xpAwarded: { type: Number, default: 0 },
      reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
      certificateId: { type: mongoose.Schema.Types.ObjectId, ref: "OrinCertification", default: null }
    }
  },
  { timestamps: true }
);

knowledgeResourceSubmissionSchema.index({ resourceId: 1, studentId: 1 }, { unique: true });

module.exports = mongoose.model("KnowledgeResourceSubmission", knowledgeResourceSubmissionSchema);
