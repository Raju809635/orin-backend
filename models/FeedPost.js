const mongoose = require("mongoose");

const reactionEnum = ["like", "love", "care", "haha", "wow", "sad", "angry"];

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
    reactions: {
      type: [
        {
          userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
          },
          type: {
            type: String,
            enum: reactionEnum,
            default: "like"
          }
        }
      ],
      default: []
    },
    reactionCounts: {
      like: { type: Number, default: 0 },
      love: { type: Number, default: 0 },
      care: { type: Number, default: 0 },
      haha: { type: Number, default: 0 },
      wow: { type: Number, default: 0 },
      sad: { type: Number, default: 0 },
      angry: { type: Number, default: 0 }
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
