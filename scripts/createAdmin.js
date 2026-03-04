require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const RefreshToken = require("../models/RefreshToken");

async function run() {
  const email = (process.env.ADMIN_EMAIL || "rbomma074@gmail.com").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || "Raju@809635";
  const name = process.env.ADMIN_NAME || "ORIN Admin";

  if (!process.env.MONGO_URI) {
    throw new Error("Missing MONGO_URI");
  }

  if (!password || password.length < 8) {
    throw new Error("ADMIN_PASSWORD must be at least 8 characters.");
  }

  await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 15000,
    socketTimeoutMS: 45000,
    maxPoolSize: 5
  });

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.findOneAndUpdate(
    { email, isDeleted: { $ne: true } },
    {
      $set: {
        name,
        email,
        password: passwordHash,
        role: "admin",
        isAdmin: true,
        approvalStatus: "approved",
        isEmailVerified: true,
        emailVerifiedAt: new Date()
      }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
  ).select("_id email role isAdmin");

  await RefreshToken.updateMany(
    { user: user._id, revokedAt: null },
    { $set: { revokedAt: new Date() } }
  );

  console.log(`ADMIN_READY email=${user.email} id=${user._id} role=${user.role} isAdmin=${user.isAdmin}`);
  await mongoose.disconnect();
}

run()
  .then(() => process.exit(0))
  .catch(async (error) => {
    console.error("ADMIN_CREATE_FAILED", error?.message || error);
    try {
      await mongoose.disconnect();
    } catch (_) {
      // ignore disconnect errors
    }
    process.exit(1);
  });
