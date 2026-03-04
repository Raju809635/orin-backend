const mongoose = require("mongoose");

const feedPostSchema = new mongoose.Schema(
  {
    authorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    content: {
      type: String,
      required: true,
      maxlength: 2000
    },
    postType: {
      type: String,
      enum: ["project_update", "achievement", "internship_update", "learning_progress", "question"],
      default: "learning_progress"
    },
    mediaUrls: {
      type: [String],
      default: []
    },
    domainTags: {
      type: [String],
      default: []
    },
    collegeTag: {
      type: String,
      default: ""
    },
    visibility: {
      type: String,
      enum: ["public", "connections", "private"],
      default: "public"
    },
    likeCount: {
      type: Number,
      default: 0
    },
    commentCount: {
      type: Number,
      default: 0
    },
    shareCount: {
      type: Number,
      default: 0
    },
    saveCount: {
      type: Number,
      default: 0
    },
    likedBy: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "User",
      default: []
    },
    savedBy: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "User",
      default: []
    },
    sharedBy: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "User",
      default: []
    }
  },
  { timestamps: true }
);

feedPostSchema.index({ createdAt: -1 });
feedPostSchema.index({ authorId: 1, createdAt: -1 });
feedPostSchema.index({ domainTags: 1 });

module.exports = mongoose.model("FeedPost", feedPostSchema);
