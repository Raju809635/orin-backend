const mongoose = require("mongoose");

const feedCommentSchema = new mongoose.Schema(
  {
    postId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FeedPost",
      required: true,
      index: true
    },
    authorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    content: {
      type: String,
      required: true,
      maxlength: 1000
    }
  },
  { timestamps: true }
);

feedCommentSchema.index({ postId: 1, createdAt: -1 });

module.exports = mongoose.model("FeedComment", feedCommentSchema);
