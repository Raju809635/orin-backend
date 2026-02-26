const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true,
    unique: true
  },
  password: {
    type: String,
    required: true,
    select: false
  },
  role: {
    type: String,
    enum: ["student", "mentor", "admin"],
    default: "student"
  },
  status: {
    type: String,
    enum: ["pending", "approved"],
    default: "pending"
  },
  domain: {
    type: String
  },
  bio: {
    type: String,
    maxlength: 500,
    default: ""
  },
  expertise: {
    type: [String],
    default: []
  }
}, { timestamps: true });

module.exports = mongoose.model("User", userSchema);
