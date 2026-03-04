const mongoose = require("mongoose");
const Connection = require("../models/Connection");
const UserFollow = require("../models/UserFollow");
const FeedPost = require("../models/FeedPost");
const FeedComment = require("../models/FeedComment");
const SkillEndorsement = require("../models/SkillEndorsement");
const ReputationScore = require("../models/ReputationScore");
const DailyTaskProgress = require("../models/DailyTaskProgress");
const LeaderboardSnapshot = require("../models/LeaderboardSnapshot");
const StudentProfile = require("../models/StudentProfile");
const MentorProfile = require("../models/MentorProfile");
const Session = require("../models/Session");
const MentorReview = require("../models/MentorReview");
const CareerOpportunity = require("../models/CareerOpportunity");
const MentorLiveSession = require("../models/MentorLiveSession");
const User = require("../models/User");
const Notification = require("../models/Notification");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");

const DAILY_TASKS = [
  { key: "coding_problem", title: "Solve 1 coding problem", xp: 20 },
  { key: "career_tip", title: "Read 1 career tip", xp: 15 },
  { key: "resume_bullet", title: "Update 1 resume bullet", xp: 20 },
  { key: "domain_concept", title: "Explore 1 domain concept", xp: 15 }
];
const REACTION_TYPES = ["like", "love", "care", "haha", "wow", "sad", "angry"];

function toDateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function computeLevelTag(score) {
  if (score >= 1200) return "Top 5% Career Builders";
  if (score >= 900) return "Top 10% AI Learners";
  if (score >= 600) return "High Momentum";
  if (score >= 300) return "Consistent Builder";
  return "Starter";
}

function normalizeText(value = "") {
  return String(value || "")
    .toLowerCase()
    .trim();
}

function tokenize(value = "") {
  return normalizeText(value)
    .split(/[^a-z0-9+#.]+/i)
    .map((item) => item.trim())
    .filter(Boolean);
}

function uniqueTokens(values = []) {
  const set = new Set();
  values.forEach((value) => {
    tokenize(value).forEach((token) => set.add(token));
  });
  return set;
}

function getRoadmapForGoal(goal = "") {
  const normalized = normalizeText(goal);

  if (/(ai|ml|machine learning|data scientist|deep learning)/i.test(normalized)) {
    return [
      "Python Basics",
      "Data Structures and Algorithms",
      "Statistics and Linear Algebra",
      "Machine Learning Fundamentals",
      "Deep Learning and Model Deployment"
    ];
  }
  if (/(web|frontend|backend|full stack|react|node)/i.test(normalized)) {
    return [
      "HTML, CSS, JavaScript Foundations",
      "React and State Management",
      "Node.js and REST APIs",
      "Databases and Authentication",
      "System Design and Deployment"
    ];
  }
  if (/(cyber|security|ethical hacking|soc)/i.test(normalized)) {
    return [
      "Networking and Linux Basics",
      "Security Fundamentals",
      "Web and API Security",
      "Vulnerability Assessment",
      "Incident Response and Security Operations"
    ];
  }
  if (/(upsc|civil services)/i.test(normalized)) {
    return [
      "NCERT Foundation",
      "Polity, Economy and Geography Core",
      "Current Affairs Revision Plan",
      "Mains Answer Writing",
      "Interview Preparation"
    ];
  }

  return [
    "Foundation Skills",
    "Core Domain Concepts",
    "Hands-on Projects",
    "Interview and Communication Practice",
    "Portfolio and Application Strategy"
  ];
}

function toFeedResponse(post, userId, comments = []) {
  const myReaction = (post.reactions || []).find((entry) => String(entry.userId) === String(userId))?.type || null;
  const reactionCounts = post.reactionCounts || {};
  return {
    ...post,
    isLiked: (post.likedBy || []).some((id) => String(id) === String(userId)),
    isSaved: (post.savedBy || []).some((id) => String(id) === String(userId)),
    isShared: (post.sharedBy || []).some((id) => String(id) === String(userId)),
    userReaction: myReaction,
    reactionCounts: {
      like: reactionCounts.like || 0,
      love: reactionCounts.love || 0,
      care: reactionCounts.care || 0,
      haha: reactionCounts.haha || 0,
      wow: reactionCounts.wow || 0,
      sad: reactionCounts.sad || 0,
      angry: reactionCounts.angry || 0
    },
    comments
  };
}

async function ensureReputation(userId) {
  let rep = await ReputationScore.findOne({ userId });
  if (!rep) {
    rep = await ReputationScore.create({ userId, score: 0, levelTag: "Starter" });
  }
  return rep;
}

async function applyReputationDelta(userId, updates = {}) {
  const rep = await ensureReputation(userId);

  rep.breakdown.projectUploads += updates.projectUploads || 0;
  rep.breakdown.skillEndorsements += updates.skillEndorsements || 0;
  rep.breakdown.dailyChallenges += updates.dailyChallenges || 0;
  rep.breakdown.mentorReviews += updates.mentorReviews || 0;
  rep.breakdown.activityPosts += updates.activityPosts || 0;

  rep.score =
    rep.breakdown.projectUploads * 40 +
    rep.breakdown.skillEndorsements * 25 +
    rep.breakdown.dailyChallenges * 20 +
    rep.breakdown.mentorReviews * 30 +
    rep.breakdown.activityPosts * 15;
  rep.levelTag = computeLevelTag(rep.score);
  await rep.save();
  return rep;
}

async function upsertLeaderboardForToday({ collegeName = "" } = {}) {
  const dateKey = toDateKey();
  const allReps = await ReputationScore.find({})
    .populate("userId", "name role")
    .sort({ score: -1, updatedAt: -1 })
    .limit(200)
    .lean();

  const globalEntries = allReps.map((item, idx) => ({
    userId: item.userId?._id,
    score: item.score || 0,
    rank: idx + 1
  }));

  await LeaderboardSnapshot.findOneAndUpdate(
    { dateKey, scope: "global", collegeName: "" },
    { $set: { entries: globalEntries } },
    { upsert: true, new: true }
  );

  if (collegeName) {
    const collegeProfiles = await StudentProfile.find({ collegeName })
      .select("userId")
      .lean();
    const collegeUserIds = new Set(collegeProfiles.map((item) => String(item.userId)));
    const collegeEntries = allReps
      .filter((item) => collegeUserIds.has(String(item.userId?._id)))
      .map((item, idx) => ({
        userId: item.userId?._id,
        score: item.score || 0,
        rank: idx + 1
      }));

    await LeaderboardSnapshot.findOneAndUpdate(
      { dateKey, scope: "college", collegeName },
      { $set: { entries: collegeEntries } },
      { upsert: true, new: true }
    );
  }
}

exports.getNetworkOverview = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const [pendingIncoming, pendingOutgoing, acceptedConnections, followers, following, reputation] = await Promise.all([
    Connection.countDocuments({ recipientId: userId, status: "pending" }),
    Connection.countDocuments({ requesterId: userId, status: "pending" }),
    Connection.countDocuments({
      status: "accepted",
      $or: [{ requesterId: userId }, { recipientId: userId }]
    }),
    UserFollow.countDocuments({ followingId: userId }),
    UserFollow.countDocuments({ followerId: userId }),
    ensureReputation(userId)
  ]);

  res.json({
    connections: {
      accepted: acceptedConnections,
      pendingIncoming,
      pendingOutgoing
    },
    follow: {
      followers,
      following
    },
    reputation: {
      score: reputation.score,
      levelTag: reputation.levelTag,
      breakdown: reputation.breakdown
    }
  });
});

exports.getConnections = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const status = req.query.status || "accepted";

  const list = await Connection.find({
    status,
    $or: [{ requesterId: userId }, { recipientId: userId }]
  })
    .populate("requesterId", "name role email")
    .populate("recipientId", "name role email")
    .sort({ updatedAt: -1 })
    .lean();

  res.json(list);
});

exports.sendConnectionRequest = asyncHandler(async (req, res) => {
  const requesterId = req.user.id;
  const { recipientId } = req.body;

  if (!recipientId) throw new ApiError(400, "recipientId is required");
  if (requesterId === recipientId) throw new ApiError(400, "Cannot connect with yourself");
  if (!mongoose.Types.ObjectId.isValid(recipientId)) throw new ApiError(400, "Invalid recipientId");

  const recipient = await User.findOne({ _id: recipientId, isDeleted: false }).select("role");
  if (!recipient) throw new ApiError(404, "Recipient not found");

  const existing = await Connection.findOne({
    $or: [
      { requesterId, recipientId },
      { requesterId: recipientId, recipientId: requesterId }
    ]
  });

  if (existing) {
    if (existing.status === "rejected" || existing.status === "blocked") {
      throw new ApiError(400, "Connection cannot be requested for this user");
    }
    return res.status(200).json({ message: "Connection already exists", connection: existing });
  }

  const relationshipType =
    req.user.role === "student" && recipient.role === "mentor"
      ? "student_mentor"
      : req.user.role === "student" && recipient.role === "student"
        ? "student_student"
        : "student_recruiter";

  const connection = await Connection.create({
    requesterId,
    recipientId,
    relationshipType
  });

  await Notification.create({
    title: "New Connection Request",
    message: "You have a new connection request on ORIN.",
    type: "direct",
    sentBy: requesterId,
    targetRole: "all",
    recipient: recipientId
  });

  res.status(201).json({ message: "Connection request sent", connection });
});

exports.respondConnectionRequest = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { connectionId } = req.params;
  const { action } = req.body;

  if (!["accept", "reject"].includes(action)) throw new ApiError(400, "action must be accept or reject");

  const connection = await Connection.findOne({
    _id: connectionId,
    recipientId: userId,
    status: "pending"
  });
  if (!connection) throw new ApiError(404, "Pending connection request not found");

  connection.status = action === "accept" ? "accepted" : "rejected";
  connection.respondedAt = new Date();
  await connection.save();

  await Notification.create({
    title: `Connection ${action === "accept" ? "Accepted" : "Rejected"}`,
    message: `Your connection request was ${action}ed.`,
    type: "direct",
    sentBy: userId,
    targetRole: "all",
    recipient: connection.requesterId
  });

  res.json({ message: `Connection ${action}ed`, connection });
});

exports.toggleFollow = asyncHandler(async (req, res) => {
  const followerId = req.user.id;
  const { userId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(userId)) throw new ApiError(400, "Invalid userId");
  if (followerId === userId) throw new ApiError(400, "Cannot follow yourself");

  const existing = await UserFollow.findOne({ followerId, followingId: userId });
  if (existing) {
    await existing.deleteOne();
    return res.json({ following: false });
  }

  await UserFollow.create({ followerId, followingId: userId });
  return res.json({ following: true });
});

exports.getFeed = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const profile = await StudentProfile.findOne({ userId }).select("collegeName skills").lean();
  const collegeName = profile?.collegeName || "";
  const skills = profile?.skills || [];

  const posts = await FeedPost.find({
    $or: [
      { visibility: "public" },
      { authorId: userId },
      { visibility: "connections" },
      ...(collegeName ? [{ collegeTag: collegeName }] : []),
      ...(skills.length ? [{ domainTags: { $in: skills.slice(0, 5) } }] : [])
    ]
  })
    .populate("authorId", "name role")
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  const postIds = posts.map((p) => p._id);
  const comments = await FeedComment.find({ postId: { $in: postIds } })
    .populate("authorId", "name role")
    .sort({ createdAt: -1 })
    .lean();

  const commentsByPostId = comments.reduce((acc, item) => {
    const key = String(item.postId);
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

  const data = posts.map((post) => toFeedResponse(post, userId, commentsByPostId[String(post._id)] || []));

  res.json(data);
});

exports.getPublicFeed = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const posts = await FeedPost.find({ visibility: "public" })
    .populate("authorId", "name role")
    .sort({ createdAt: -1 })
    .limit(80)
    .lean();
  const postIds = posts.map((p) => p._id);
  const comments = await FeedComment.find({ postId: { $in: postIds } })
    .populate("authorId", "name role")
    .sort({ createdAt: -1 })
    .lean();
  const commentsByPostId = comments.reduce((acc, item) => {
    const key = String(item.postId);
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});
  res.json(posts.map((post) => toFeedResponse(post, userId, commentsByPostId[String(post._id)] || [])));
});

exports.createPost = asyncHandler(async (req, res) => {
  const authorId = req.user.id;
  const { content, postType, domainTags = [], mediaUrls = [], visibility = "public" } = req.body;

  if (!content || content.trim().length < 3) throw new ApiError(400, "Post content is required");

  const profile = await StudentProfile.findOne({ userId: authorId }).select("collegeName").lean();

  const post = await FeedPost.create({
    authorId,
    content: content.trim(),
    postType: postType || "learning_progress",
    domainTags: Array.isArray(domainTags) ? domainTags : [],
    mediaUrls: Array.isArray(mediaUrls) ? mediaUrls : [],
    visibility,
    collegeTag: profile?.collegeName || ""
  });

  await applyReputationDelta(authorId, { activityPosts: 1 });
  res.status(201).json(post);
});

exports.deletePost = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { postId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(postId)) throw new ApiError(400, "Invalid post id");

  const post = await FeedPost.findById(postId);
  if (!post) throw new ApiError(404, "Post not found");
  if (String(post.authorId) !== String(userId)) throw new ApiError(403, "You can delete only your own posts");

  await FeedComment.deleteMany({ postId });
  await post.deleteOne();

  res.json({ message: "Post deleted successfully" });
});

exports.addComment = asyncHandler(async (req, res) => {
  const authorId = req.user.id;
  const { postId } = req.params;
  const { content } = req.body;

  if (!content || content.trim().length < 1) throw new ApiError(400, "Comment content is required");

  const post = await FeedPost.findById(postId);
  if (!post) throw new ApiError(404, "Post not found");

  const comment = await FeedComment.create({
    postId,
    authorId,
    content: content.trim()
  });

  post.commentCount += 1;
  await post.save();

  if (String(post.authorId) !== String(authorId)) {
    await Notification.create({
      title: "New Comment",
      message: "Someone commented on your post.",
      type: "direct",
      sentBy: authorId,
      targetRole: "all",
      recipient: post.authorId
    });
  }

  res.status(201).json(comment);
});

exports.reactToPost = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { postId } = req.params;
  const { action, reactionType } = req.body;

  if (!["like", "react", "save", "share"].includes(action)) throw new ApiError(400, "Invalid action");

  const post = await FeedPost.findById(postId);
  if (!post) throw new ApiError(404, "Post not found");

  if (!post.reactionCounts) {
    post.reactionCounts = { like: 0, love: 0, care: 0, haha: 0, wow: 0, sad: 0, angry: 0 };
  }
  if (!Array.isArray(post.reactions)) {
    post.reactions = [];
  }

  if (action === "like" || action === "react") {
    const nextReaction = action === "like" ? "like" : String(reactionType || "").toLowerCase();
    if (!REACTION_TYPES.includes(nextReaction)) {
      throw new ApiError(400, "Invalid reactionType");
    }

    const existingIndex = post.reactions.findIndex((entry) => String(entry.userId) === String(userId));
    const existing = existingIndex >= 0 ? post.reactions[existingIndex] : null;
    const previousType = existing?.type || null;

    if (existing && previousType === nextReaction) {
      post.reactions.splice(existingIndex, 1);
      post.reactionCounts[nextReaction] = Math.max(0, Number(post.reactionCounts[nextReaction] || 0) - 1);
    } else {
      if (existing && previousType) {
        post.reactionCounts[previousType] = Math.max(0, Number(post.reactionCounts[previousType] || 0) - 1);
        post.reactions[existingIndex] = { userId, type: nextReaction };
      } else {
        post.reactions.push({ userId, type: nextReaction });
      }
      post.reactionCounts[nextReaction] = Number(post.reactionCounts[nextReaction] || 0) + 1;

      if (String(post.authorId) !== String(userId)) {
        await Notification.create({
          title: "New Reaction",
          message: `Someone reacted (${nextReaction}) to your post.`,
          type: "direct",
          sentBy: userId,
          targetRole: "all",
          recipient: post.authorId
        });
      }
    }

    post.likedBy = post.reactions.map((entry) => entry.userId);
    post.likeCount = post.reactions.length;
  }

  if (action === "save") {
    const hasSaved = post.savedBy.some((id) => String(id) === userId);
    if (hasSaved) {
      post.savedBy = post.savedBy.filter((id) => String(id) !== userId);
      post.saveCount = Math.max(0, post.saveCount - 1);
    } else {
      post.savedBy.push(userId);
      post.saveCount += 1;
    }
  }

  if (action === "share") {
    const hasShared = post.sharedBy.some((id) => String(id) === userId);
    if (!hasShared) {
      post.sharedBy.push(userId);
      post.shareCount += 1;

      if (String(post.authorId) !== String(userId)) {
        await Notification.create({
          title: "Post Shared",
          message: "Someone shared your post.",
          type: "direct",
          sentBy: userId,
          targetRole: "all",
          recipient: post.authorId
        });
      }
    }
  }

  await post.save();
  const userReaction = post.reactions.find((entry) => String(entry.userId) === String(userId))?.type || null;
  res.json({
    postId: post._id,
    likeCount: post.likeCount,
    reactionCounts: post.reactionCounts,
    userReaction,
    saveCount: post.saveCount,
    shareCount: post.shareCount
  });
});

exports.endorseSkill = asyncHandler(async (req, res) => {
  const endorsedByUserId = req.user.id;
  const { userId: endorsedUserId } = req.params;
  const { skill } = req.body;

  if (!skill || !skill.trim()) throw new ApiError(400, "Skill is required");
  if (!mongoose.Types.ObjectId.isValid(endorsedUserId)) throw new ApiError(400, "Invalid userId");
  if (endorsedByUserId === endorsedUserId) throw new ApiError(400, "Cannot endorse yourself");

  const exists = await SkillEndorsement.findOne({
    endorsedUserId,
    endorsedByUserId,
    skill: skill.trim()
  });

  if (exists) return res.json({ message: "Skill already endorsed" });

  await SkillEndorsement.create({
    endorsedUserId,
    endorsedByUserId,
    skill: skill.trim()
  });

  await applyReputationDelta(endorsedUserId, { skillEndorsements: 1 });
  res.status(201).json({ message: "Skill endorsed" });
});

exports.getDailyDashboard = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const dateKey = toDateKey();

  const [progressRows, reputation, profile] = await Promise.all([
    DailyTaskProgress.find({ userId, dateKey }).lean(),
    ensureReputation(userId),
    StudentProfile.findOne({ userId }).select("collegeName").lean()
  ]);

  const completedKeys = new Set(progressRows.map((item) => item.taskKey));
  const totalXpToday = progressRows.reduce((sum, item) => sum + (item.xpEarned || 0), 0);

  await upsertLeaderboardForToday({ collegeName: profile?.collegeName || "" });

  const [globalSnapshot, collegeSnapshot] = await Promise.all([
    LeaderboardSnapshot.findOne({ dateKey, scope: "global", collegeName: "" }).lean(),
    profile?.collegeName
      ? LeaderboardSnapshot.findOne({ dateKey, scope: "college", collegeName: profile.collegeName }).lean()
      : null
  ]);

  const globalRank =
    globalSnapshot?.entries.find((item) => String(item.userId) === String(userId))?.rank || null;
  const collegeRank =
    collegeSnapshot?.entries.find((item) => String(item.userId) === String(userId))?.rank || null;

  const tasks = DAILY_TASKS.map((task) => ({
    ...task,
    completed: completedKeys.has(task.key)
  }));

  res.json({
    dateKey,
    tasks,
    streakDays: Math.min(30, Math.floor(reputation.breakdown.dailyChallenges / 2)),
    xp: totalXpToday,
    levelTag: reputation.levelTag,
    reputationScore: reputation.score,
    leaderboard: {
      globalRank,
      collegeRank
    }
  });
});

exports.completeDailyTask = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { taskKey } = req.body;

  const task = DAILY_TASKS.find((item) => item.key === taskKey);
  if (!task) throw new ApiError(400, "Invalid taskKey");

  const dateKey = toDateKey();
  const existing = await DailyTaskProgress.findOne({ userId, taskKey, dateKey });
  if (existing) return res.json({ message: "Task already completed today" });

  await DailyTaskProgress.create({
    userId,
    taskKey,
    dateKey,
    status: "completed",
    xpEarned: task.xp
  });
  await applyReputationDelta(userId, { dailyChallenges: 1 });
  res.status(201).json({ message: "Task completed", xpEarned: task.xp });
});

exports.getSmartSuggestions = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const profile = await StudentProfile.findOne({ userId }).select("collegeName skills").lean();
  const mySkills = profile?.skills || [];
  const myCollege = profile?.collegeName || "";

  const connections = await Connection.find({
    status: "accepted",
    $or: [{ requesterId: userId }, { recipientId: userId }]
  }).lean();
  const connectedIds = new Set([String(userId)]);
  connections.forEach((item) => {
    connectedIds.add(String(item.requesterId));
    connectedIds.add(String(item.recipientId));
  });

  const users = await User.find({
    isDeleted: false,
    _id: { $nin: Array.from(connectedIds) },
    role: { $in: ["student", "mentor"] }
  })
    .select("name role email primaryCategory subCategory specializations")
    .limit(60)
    .lean();

  const profiles = await StudentProfile.find({
    userId: { $in: users.map((u) => u._id) }
  })
    .select("userId collegeName skills")
    .lean();
  const profileByUserId = new Map(profiles.map((item) => [String(item.userId), item]));

  const scored = users
    .map((item) => {
      const p = profileByUserId.get(String(item._id));
      const sameCollege = myCollege && p?.collegeName && p.collegeName === myCollege ? 1 : 0;
      const skillOverlap = (p?.skills || []).filter((s) => mySkills.includes(s)).length;
      const domainOverlap = (item.specializations || []).filter((s) => mySkills.includes(s)).length;
      const score = sameCollege * 50 + skillOverlap * 20 + domainOverlap * 10 + (item.role === "mentor" ? 12 : 0);
      return {
        id: item._id,
        name: item.name,
        role: item.role,
        score,
        reason: sameCollege
          ? "Same college"
          : skillOverlap > 0
            ? "Similar skills"
            : domainOverlap > 0
              ? "Similar domain"
              : "Career network suggestion"
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 15);

  res.json(scored);
});

exports.getCollegeNetwork = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const profile = await StudentProfile.findOne({ userId }).select("collegeName").lean();
  const collegeName = profile?.collegeName || "";

  if (!collegeName) {
    return res.json({
      collegeName: "",
      topStudents: [],
      trendingProjects: [],
      skillRankings: []
    });
  }

  const collegeProfiles = await StudentProfile.find({ collegeName })
    .populate("userId", "name email role")
    .sort({ profileCompleteness: -1, updatedAt: -1 })
    .limit(20)
    .lean();

  const topStudents = collegeProfiles.slice(0, 10).map((item, idx) => ({
    rank: idx + 1,
    userId: item.userId?._id,
    name: item.userId?.name || "Student",
    profileCompleteness: item.profileCompleteness || 0
  }));

  const trendingProjects = collegeProfiles
    .flatMap((item) =>
      (item.projects || []).map((project) => ({
        owner: item.userId?.name || "Student",
        name: project.name || "",
        summary: project.summary || "",
        link: project.link || ""
      }))
    )
    .filter((item) => item.name)
    .slice(0, 20);

  const skillCounter = {};
  collegeProfiles.forEach((item) => {
    (item.skills || []).forEach((skill) => {
      const key = String(skill || "").trim();
      if (!key) return;
      skillCounter[key] = (skillCounter[key] || 0) + 1;
    });
  });
  const skillRankings = Object.keys(skillCounter)
    .map((skill) => ({ skill, users: skillCounter[skill] }))
    .sort((a, b) => b.users - a.users)
    .slice(0, 10);

  res.json({
    collegeName,
    topStudents,
    trendingProjects,
    skillRankings
  });
});

exports.getMentorMatches = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const studentProfile = await StudentProfile.findOne({ userId }).lean();
  const studentUser = await User.findById(userId).select("primaryCategory subCategory goals").lean();

  const studentSignals = [
    ...(studentProfile?.skills || []),
    ...(studentProfile?.careerGoals ? [studentProfile.careerGoals] : []),
    ...(studentUser?.goals ? [studentUser.goals] : []),
    ...(studentUser?.primaryCategory ? [studentUser.primaryCategory] : []),
    ...(studentUser?.subCategory ? [studentUser.subCategory] : [])
  ];
  const studentTokens = uniqueTokens(studentSignals);

  const mentorProfiles = await MentorProfile.find({})
    .populate("userId", "name email approvalStatus role isDeleted primaryCategory subCategory specializations")
    .sort({ rating: -1, totalSessionsConducted: -1, updatedAt: -1 })
    .limit(120)
    .lean();

  const scored = mentorProfiles
    .filter((item) => {
      const user = item.userId;
      return (
        user &&
        user.role === "mentor" &&
        user.approvalStatus === "approved" &&
        user.isDeleted !== true
      );
    })
    .map((mentor) => {
      const mentorSignals = [
        mentor.primaryCategory || "",
        mentor.subCategory || "",
        ...(mentor.specializations || []),
        ...(mentor.expertiseDomains || []),
        ...(mentor.userId?.specializations || [])
      ];
      const mentorTokens = uniqueTokens(mentorSignals);

      let overlap = 0;
      studentTokens.forEach((token) => {
        if (mentorTokens.has(token)) overlap += 1;
      });

      const categoryExact =
        normalizeText(mentor.primaryCategory) &&
        normalizeText(mentor.primaryCategory) === normalizeText(studentUser?.primaryCategory || "")
          ? 1
          : 0;
      const subCategoryExact =
        normalizeText(mentor.subCategory) &&
        normalizeText(mentor.subCategory) === normalizeText(studentUser?.subCategory || "")
          ? 1
          : 0;

      const ratingFactor = Math.min(5, Number(mentor.rating || 0)) / 5;
      const experienceFactor = Math.min(12, Number(mentor.experienceYears || 0)) / 12;
      const sessionsFactor = Math.min(100, Number(mentor.totalSessionsConducted || 0)) / 100;

      const scoreRaw =
        overlap * 10 +
        categoryExact * 18 +
        subCategoryExact * 10 +
        ratingFactor * 25 +
        experienceFactor * 20 +
        sessionsFactor * 17;
      const matchScore = Math.max(25, Math.min(99, Math.round(scoreRaw)));

      return {
        mentorId: mentor.userId?._id,
        name: mentor.userId?.name || "Mentor",
        email: mentor.userId?.email || "",
        title: mentor.title || "Mentor",
        primaryCategory: mentor.primaryCategory || mentor.userId?.primaryCategory || "",
        subCategory: mentor.subCategory || mentor.userId?.subCategory || "",
        specializations: mentor.specializations || [],
        expertiseDomains: mentor.expertiseDomains || [],
        experienceYears: mentor.experienceYears || 0,
        rating: Number(mentor.rating || 0),
        totalSessionsConducted: Number(mentor.totalSessionsConducted || 0),
        sessionPrice: Number(mentor.sessionPrice || 0),
        profilePhotoUrl: mentor.profilePhotoUrl || "",
        matchScore,
        reasons: [
          categoryExact ? "Same domain" : null,
          subCategoryExact ? "Same sub-domain" : null,
          overlap > 0 ? `Skill overlap (${overlap})` : null,
          ratingFactor > 0 ? "Strong mentor rating" : null
        ].filter(Boolean)
      };
    })
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 12);

  res.json({
    studentSignals: {
      domain: studentUser?.primaryCategory || "",
      subDomain: studentUser?.subCategory || "",
      skills: studentProfile?.skills || [],
      careerGoal: studentProfile?.careerGoals || studentUser?.goals || ""
    },
    recommendations: scored
  });
});

exports.getSessionHistory = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const rows = await Session.find({
    studentId: userId,
    $or: [{ status: "completed" }, { sessionStatus: "completed" }, { paymentStatus: "verified" }, { paymentStatus: "paid" }]
  })
    .populate("mentorId", "name email")
    .sort({ scheduledStart: -1 })
    .limit(100)
    .lean();

  const history = rows.map((item) => ({
    sessionId: item._id,
    mentorId: item.mentorId?._id || null,
    mentorName: item.mentorId?.name || "Mentor",
    mentorEmail: item.mentorId?.email || "",
    date: item.date,
    time: item.time,
    amount: item.amount,
    paymentStatus: item.paymentStatus,
    status: item.status,
    sessionStatus: item.sessionStatus,
    notes: item.studentNotes || item.notes || "",
    feedback: item.feedback || "",
    meetingLink: item.meetingLink || ""
  }));

  res.json(history);
});

exports.updateStudentSessionNote = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { sessionId } = req.params;
  const { note } = req.body;

  if (!mongoose.Types.ObjectId.isValid(sessionId)) throw new ApiError(400, "Invalid sessionId");
  const nextNote = String(note || "").trim();
  if (!nextNote) throw new ApiError(400, "note is required");

  const session = await Session.findOne({ _id: sessionId, studentId: userId });
  if (!session) throw new ApiError(404, "Session not found");

  session.studentNotes = nextNote.slice(0, 2500);
  await session.save();

  res.json({ message: "Session note updated", sessionId: session._id, studentNotes: session.studentNotes });
});

exports.submitMentorReview = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { sessionId } = req.params;
  const { rating, reviewText = "" } = req.body;

  if (!mongoose.Types.ObjectId.isValid(sessionId)) throw new ApiError(400, "Invalid sessionId");
  const numericRating = Number(rating || 0);
  if (!Number.isFinite(numericRating) || numericRating < 1 || numericRating > 5) {
    throw new ApiError(400, "rating must be between 1 and 5");
  }

  const session = await Session.findOne({ _id: sessionId, studentId: userId });
  if (!session) throw new ApiError(404, "Session not found");

  const review = await MentorReview.findOneAndUpdate(
    { sessionId: session._id },
    {
      $set: {
        mentorId: session.mentorId,
        studentId: userId,
        rating: numericRating,
        reviewText: String(reviewText || "").trim().slice(0, 1200)
      }
    },
    { upsert: true, new: true }
  );

  const stats = await MentorReview.aggregate([
    { $match: { mentorId: session.mentorId } },
    {
      $group: {
        _id: "$mentorId",
        avgRating: { $avg: "$rating" },
        totalReviews: { $sum: 1 }
      }
    }
  ]);
  const avgRating = Number(stats[0]?.avgRating || 0);
  const totalReviews = Number(stats[0]?.totalReviews || 0);

  await MentorProfile.findOneAndUpdate(
    { userId: session.mentorId },
    { $set: { rating: Math.round(avgRating * 10) / 10, totalSessionsConducted: Math.max(totalReviews, 0) } }
  );

  await applyReputationDelta(session.mentorId, { mentorReviews: 1 });

  res.status(201).json({
    message: "Review saved",
    review: {
      id: review._id,
      rating: review.rating,
      reviewText: review.reviewText
    }
  });
});

exports.getMentorReviews = asyncHandler(async (req, res) => {
  const { mentorId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(mentorId)) throw new ApiError(400, "Invalid mentorId");

  const rows = await MentorReview.find({ mentorId })
    .populate("studentId", "name")
    .sort({ createdAt: -1 })
    .limit(40)
    .lean();

  const summary = await MentorReview.aggregate([
    { $match: { mentorId: new mongoose.Types.ObjectId(mentorId) } },
    { $group: { _id: "$mentorId", average: { $avg: "$rating" }, total: { $sum: 1 } } }
  ]);

  res.json({
    averageRating: Number(summary[0]?.average || 0).toFixed(1),
    totalReviews: Number(summary[0]?.total || 0),
    reviews: rows.map((item) => ({
      id: item._id,
      rating: item.rating,
      reviewText: item.reviewText,
      studentName: item.studentId?.name || "Student",
      createdAt: item.createdAt
    }))
  });
});

exports.getCareerRoadmap = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const studentProfile = await StudentProfile.findOne({ userId }).select("careerGoals skills").lean();
  const user = await User.findById(userId).select("goals primaryCategory subCategory").lean();

  const goal = req.query.goal || studentProfile?.careerGoals || user?.goals || user?.primaryCategory || "Career Growth";
  const steps = getRoadmapForGoal(String(goal || ""));

  res.json({
    goal: String(goal),
    steps: steps.map((title, idx) => ({
      stepNumber: idx + 1,
      title,
      completed: false
    })),
    basedOn: {
      skills: studentProfile?.skills || [],
      domain: user?.primaryCategory || "",
      subDomain: user?.subCategory || ""
    }
  });
});

exports.getCareerOpportunities = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const profile = await StudentProfile.findOne({ userId }).select("skills careerGoals").lean();
  const user = await User.findById(userId).select("primaryCategory subCategory").lean();

  const queryTokens = uniqueTokens([
    ...(profile?.skills || []),
    profile?.careerGoals || "",
    user?.primaryCategory || "",
    user?.subCategory || "",
    String(req.query.q || "")
  ]);

  let opportunities = await CareerOpportunity.find({ isActive: true })
    .sort({ createdAt: -1 })
    .limit(80)
    .lean();

  if (opportunities.length === 0) {
    opportunities = [
      {
        _id: "seed-1",
        title: "ML Internship Program",
        company: "AI Startup",
        type: "internship",
        role: "ML Intern",
        duration: "3 months",
        location: "Remote",
        domainTags: ["ai", "ml", "python"],
        applicationUrl: "",
        description: "Hands-on internship for students interested in machine learning.",
        createdAt: new Date()
      },
      {
        _id: "seed-2",
        title: "National Coding Hackathon",
        company: "Open Innovation Forum",
        type: "hackathon",
        role: "Participant",
        duration: "48 hours",
        location: "Online",
        domainTags: ["coding", "web", "ai"],
        applicationUrl: "",
        description: "Build a practical solution and compete with students nationwide.",
        createdAt: new Date()
      }
    ];
  }

  const scored = opportunities
    .map((item) => {
      const tokens = uniqueTokens([
        item.title,
        item.company,
        item.role,
        item.description,
        ...(item.domainTags || [])
      ]);
      let score = 0;
      queryTokens.forEach((token) => {
        if (tokens.has(token)) score += 1;
      });
      return {
        ...item,
        relevanceScore: score
      };
    })
    .sort((a, b) => b.relevanceScore - a.relevanceScore || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 40);

  res.json(scored);
});

exports.getCollegeLeaderboard = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const profile = await StudentProfile.findOne({ userId }).select("collegeName").lean();
  const collegeName = profile?.collegeName || "";
  const dateKey = toDateKey();

  await upsertLeaderboardForToday({ collegeName });

  const globalSnapshot = await LeaderboardSnapshot.findOne({ dateKey, scope: "global", collegeName: "" })
    .populate("entries.userId", "name")
    .lean();

  const collegeSnapshot = collegeName
    ? await LeaderboardSnapshot.findOne({ dateKey, scope: "college", collegeName })
      .populate("entries.userId", "name")
      .lean()
    : null;

  const mapEntries = (entries = []) =>
    entries.slice(0, 20).map((item) => ({
      rank: item.rank,
      userId: item.userId?._id || item.userId || null,
      name: item.userId?.name || "User",
      score: item.score || 0
    }));

  res.json({
    dateKey,
    collegeName,
    collegeTop: mapEntries(collegeSnapshot?.entries || []),
    globalTop: mapEntries(globalSnapshot?.entries || [])
  });
});

exports.getLiveSessions = asyncHandler(async (req, res) => {
  const rows = await MentorLiveSession.find({
    isPublic: true,
    isCancelled: false,
    startsAt: { $gte: new Date(Date.now() - 2 * 60 * 60 * 1000) }
  })
    .populate("mentorId", "name email")
    .sort({ startsAt: 1 })
    .limit(60)
    .lean();

  res.json(
    rows.map((item) => ({
      id: item._id,
      title: item.title,
      topic: item.topic,
      description: item.description,
      startsAt: item.startsAt,
      endsAt: item.endsAt,
      meetingLink: item.meetingLink,
      domainTags: item.domainTags || [],
      mentor: {
        id: item.mentorId?._id || null,
        name: item.mentorId?.name || "Mentor",
        email: item.mentorId?.email || ""
      }
    }))
  );
});

exports.createLiveSession = asyncHandler(async (req, res) => {
  if (req.user.role !== "mentor") throw new ApiError(403, "Only mentors can create live sessions");

  const { title, topic = "", description = "", startsAt, endsAt = null, meetingLink = "", domainTags = [] } = req.body;
  if (!title || !String(title).trim()) throw new ApiError(400, "title is required");
  const startDate = new Date(startsAt);
  if (Number.isNaN(startDate.getTime())) throw new ApiError(400, "startsAt is invalid");

  const doc = await MentorLiveSession.create({
    mentorId: req.user.id,
    title: String(title).trim(),
    topic: String(topic || "").trim(),
    description: String(description || "").trim(),
    startsAt: startDate,
    endsAt: endsAt ? new Date(endsAt) : null,
    meetingLink: String(meetingLink || "").trim(),
    domainTags: Array.isArray(domainTags) ? domainTags : [],
    isPublic: true,
    isCancelled: false
  });

  res.status(201).json({ message: "Live session created", liveSession: doc });
});

exports.generateResume = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const user = await User.findById(userId).select("name email phoneNumber").lean();
  const profile = await StudentProfile.findOne({ userId }).lean();
  if (!user) throw new ApiError(404, "User not found");

  const payload = {
    basics: {
      name: user.name || "",
      email: user.email || "",
      phone: user.phoneNumber || "",
      headline: profile?.headline || "",
      about: profile?.about || ""
    },
    skills: profile?.skills || [],
    projects: (profile?.projects || []).map((item) => ({
      title: item.name || "",
      description: item.summary || "",
      techStack: item.techStack || [],
      githubOrLink: item.link || "",
      demoVideo: item.demoVideoUrl || "",
      screenshots: item.screenshots || []
    })),
    achievements: profile?.achievements || [],
    experience: profile?.experiences || [],
    education: profile?.education || [],
    careerGoals: profile?.careerGoals || ""
  };

  const markdown = [
    `# ${payload.basics.name}`,
    payload.basics.headline ? `**${payload.basics.headline}**` : "",
    payload.basics.about ? payload.basics.about : "",
    "",
    "## Contact",
    `- Email: ${payload.basics.email}`,
    payload.basics.phone ? `- Phone: ${payload.basics.phone}` : "",
    "",
    "## Skills",
    ...(payload.skills.length ? payload.skills.map((item) => `- ${item}`) : ["- Add your skills in profile"]),
    "",
    "## Projects",
    ...(payload.projects.length
      ? payload.projects.flatMap((project) => [
          `- **${project.title || "Project"}**`,
          project.description ? `  - ${project.description}` : "",
          project.techStack.length ? `  - Tech: ${project.techStack.join(", ")}` : "",
          project.githubOrLink ? `  - Link: ${project.githubOrLink}` : ""
        ])
      : ["- Add projects in profile"]),
    "",
    "## Achievements",
    ...(payload.achievements.length
      ? payload.achievements.map((item) => `- ${item.title || item.type || "Achievement"}`)
      : ["- Add achievements in profile"]),
    "",
    "## Experience",
    ...(payload.experience.length
      ? payload.experience.map((item) => `- ${item.role || "Role"} at ${item.organization || "Organization"}`)
      : ["- Add experiences in profile"]),
    "",
    "## Career Goal",
    payload.careerGoals || "Career growth and mentorship"
  ]
    .filter(Boolean)
    .join("\n");

  res.json({
    resume: payload,
    markdown,
    export: {
      fileName: `${String(payload.basics.name || "orin_resume").replace(/\s+/g, "_")}.md`,
      mimeType: "text/markdown"
    }
  });
});
