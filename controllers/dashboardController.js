const Session = require("../models/Session");
const StudentProfile = require("../models/StudentProfile");
const MentorProfile = require("../models/MentorProfile");
const User = require("../models/User");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");

function getGrowthLevel(growthScore) {
  if (growthScore >= 85) return "Advanced";
  if (growthScore >= 60) return "Intermediate";
  if (growthScore >= 30) return "Developing";
  return "Beginner";
}

function formatCountdown(targetDate) {
  const diffMs = targetDate.getTime() - Date.now();
  if (diffMs <= 0) return "Started or elapsed";

  const totalMinutes = Math.floor(diffMs / (1000 * 60));
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  return `${hours}h ${minutes}m`;
}

exports.getStudentDashboard = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const user = await User.findOne({ _id: userId, role: "student", isDeleted: false }).select("name email");
  if (!user) throw new ApiError(404, "Student not found");

  const profile = await StudentProfile.findOne({ userId }).lean();

  const upcomingSession = await Session.findOne({
    studentId: userId,
    status: { $in: ["pending", "approved"] },
    scheduledStart: { $gt: new Date() }
  })
    .sort({ scheduledStart: 1 })
    .populate("mentorId", "name email domain")
    .lean();

  const completedSessions = await Session.find({
    studentId: userId,
    status: "completed"
  })
    .sort({ scheduledStart: -1 })
    .lean();

  let assignedMentor = null;
  if (profile?.assignedMentorId) {
    assignedMentor = await User.findById(profile.assignedMentorId).select("name email domain");
  }

  const tasks = [];
  if (!profile || (profile.profileCompleteness || 0) < 80) {
    tasks.push("Complete your profile to at least 80%");
  }
  if (!upcomingSession) {
    tasks.push("Book your next mentorship session");
  }
  if ((completedSessions.length || 0) < 3) {
    tasks.push("Complete 3 sessions to unlock advanced growth insights");
  }

  const feedbackWithText = completedSessions.filter((s) => (s.feedback || "").trim().length > 0);

  res.status(200).json({
    student: {
      id: userId,
      name: user.name,
      email: user.email
    },
    growthLevel: getGrowthLevel(profile?.growthScore || 0),
    upcomingSessionCountdown: upcomingSession
      ? {
          sessionId: upcomingSession._id,
          scheduledStart: upcomingSession.scheduledStart,
          countdown: formatCountdown(new Date(upcomingSession.scheduledStart)),
          mentor: upcomingSession.mentorId
        }
      : null,
    assignedMentorSnapshot: assignedMentor
      ? {
          id: assignedMentor._id,
          name: assignedMentor.name,
          email: assignedMentor.email,
          domain: assignedMentor.domain || null
        }
      : null,
    progressScore: profile?.profileCompleteness || 0,
    tasks,
    feedbackSummary: {
      totalCompletedSessions: completedSessions.length,
      totalFeedbacks: feedbackWithText.length,
      latestFeedback: feedbackWithText[0]?.feedback || null
    }
  });
});

exports.getMentorDashboard = asyncHandler(async (req, res) => {
  const mentorId = req.user.id;
  const user = await User.findOne({ _id: mentorId, role: "mentor", isDeleted: false }).select("name email");
  if (!user) throw new ApiError(404, "Mentor not found");

  const mentorProfile = await MentorProfile.findOne({ userId: mentorId }).lean();

  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  const [todaySessions, pendingRequests, monthlySessionCount, distinctStudents] = await Promise.all([
    Session.find({
      mentorId,
      scheduledStart: { $gte: startOfToday, $lte: endOfToday },
      status: { $in: ["pending", "approved", "completed"] }
    })
      .populate("studentId", "name email")
      .sort({ scheduledStart: 1 })
      .lean(),
    Session.countDocuments({ mentorId, status: "pending" }),
    Session.countDocuments({
      mentorId,
      scheduledStart: { $gte: startOfMonth, $lte: endOfMonth },
      status: { $in: ["approved", "completed"] }
    }),
    Session.distinct("studentId", { mentorId })
  ]);

  const completedThisMonth = await Session.countDocuments({
    mentorId,
    scheduledStart: { $gte: startOfMonth, $lte: endOfMonth },
    status: "completed"
  });
  const earnings = completedThisMonth * (mentorProfile?.sessionPrice || 0);

  res.status(200).json({
    mentor: {
      id: mentorId,
      name: user.name,
      email: user.email
    },
    todaySessions,
    pendingRequests,
    totalStudents: distinctStudents.length,
    monthlySessionCount,
    ratings: {
      average: mentorProfile?.rating || 0,
      testimonialsCount: (mentorProfile?.testimonials || []).length
    },
    earnings: {
      amount: earnings,
      currency: "INR",
      note: "Computed from completed sessions and session price"
    }
  });
});
