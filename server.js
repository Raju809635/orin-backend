require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const { port, mongoUri } = require("./config/env");
const corsOptions = require("./config/cors");

const authRoutes = require("./routes/authRoutes");
const adminRoutes = require("./routes/adminRoutes");
const mentorRoutes = require("./routes/mentorRoutes");
const bookingRoutes = require("./routes/bookingRoutes");
const availabilityRoutes = require("./routes/availabilityRoutes");
const sessionRoutes = require("./routes/sessionRoutes");
const profileRoutes = require("./routes/profileRoutes");
const settingsRoutes = require("./routes/settingsRoutes");
const accountRoutes = require("./routes/accountRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const messageRoutes = require("./routes/messageRoutes");
const collaborateRoutes = require("./routes/collaborateRoutes");
const chatRoutes = require("./routes/chatRoutes");
const complaintRoutes = require("./routes/complaintRoutes");
const aiRoutes = require("./routes/aiRoutes");
const { notFound, errorHandler } = require("./middleware/errorMiddleware");

const app = express();

mongoose.set("bufferCommands", false);
mongoose.set("strictQuery", true);

app.use(cors(corsOptions));
app.use(express.json());

app.get("/", (req, res) => {
  res.send("ORIN Backend Running");
});

app.get("/health", (req, res) => {
  const dbState = mongoose.connection.readyState;
  const dbConnected = dbState === 1;

  res.status(dbConnected ? 200 : 503).json({
    ok: dbConnected,
    dbState
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/mentors", mentorRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/availability", availabilityRoutes);
app.use("/api/sessions", sessionRoutes);
app.use("/api/profiles", profileRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/account", accountRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/collaborate", collaborateRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/complaints", complaintRoutes);
app.use("/api/ai", aiRoutes);

app.use(notFound);
app.use(errorHandler);

async function connectToDatabase() {
  mongoose.connection.on("connected", () => {
    console.log("[DB] Connected to MongoDB Atlas");
  });

  mongoose.connection.on("error", (error) => {
    console.error("[DB] Connection error:", error);
  });

  mongoose.connection.on("disconnected", () => {
    console.warn("[DB] Disconnected from MongoDB");
  });

  await mongoose.connect(mongoUri, {
    serverSelectionTimeoutMS: 15000,
    socketTimeoutMS: 45000,
    maxPoolSize: 10
  });
}

async function startServer() {
  try {
    await connectToDatabase();

    app.listen(port, () => {
      console.log(`Server running on port ${port}`);
    });
  } catch (error) {
    console.error("[BOOT] Failed to start server:", error);
    process.exit(1);
  }
}

process.on("unhandledRejection", (reason) => {
  console.error("[PROCESS] Unhandled rejection:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("[PROCESS] Uncaught exception:", error);
  process.exit(1);
});

startServer();
