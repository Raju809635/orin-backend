const mongoose = require("mongoose");

const skillEndorsementSchema = new mongoose.Schema(
  {
    endorsedUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    endorsedByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    skill: {
      type: String,
      required: true,
      maxlength: 120,
      trim: true
    }
  },
  { timestamps: true }
);

skillEndorsementSchema.index(
  { endorsedUserId: 1, endorsedByUserId: 1, skill: 1 },
  { unique: true }
);

module.exports = mongoose.model("SkillEndorsement", skillEndorsementSchema);
