const mongoose = require("mongoose");
const Connection = require("../models/Connection");
const UserFollow = require("../models/UserFollow");
const FeedPost = require("../models/FeedPost");
const FeedComment = require("../models/FeedComment");
const SkillEndorsement = require("../models/SkillEndorsement");
const ReputationScore = require("../models/ReputationScore");
const LeaderboardSnapshot = require("../models/LeaderboardSnapshot");
const StudentProfile = require("../models/StudentProfile");
const MentorProfile = require("../models/MentorProfile");
const Session = require("../models/Session");
const MentorReview = require("../models/MentorReview");
const CareerOpportunity = require("../models/CareerOpportunity");
const MentorLiveSession = require("../models/MentorLiveSession");
const CommunityChallenge = require("../models/CommunityChallenge");
const OrinCertification = require("../models/OrinCertification");
const MentorGroup = require("../models/MentorGroup");
const KnowledgeResource = require("../models/KnowledgeResource");
const UserSkillLevel = require("../models/UserSkillLevel");
const QuizStreak = require("../models/QuizStreak");
const QuizAttempt = require("../models/QuizAttempt");
const User = require("../models/User");
const Notification = require("../models/Notification");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { mentorCategoryTree } = require("../config/mentorCategories");

const QUIZ_XP_BY_SCORE = {
  1: 10,
  2: 20,
  3: 30,
  4: 40,
  5: 50
};
const STREAK_BONUS_XP = {
  3: 20,
  7: 50,
  30: 200
};
const QUIZ_DAILY_LIMIT_MESSAGE = "You have completed today's quiz. Come back tomorrow.";
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

function parseCsvList(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.flatMap((item) => String(item || "").split(","))
      .map((item) => String(item || "").trim())
      .filter(Boolean);
  }
  return String(value || "")
    .split(",")
    .map((item) => String(item || "").trim())
    .filter(Boolean);
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

function getRequiredSkillsForGoal(goal = "") {
  const normalized = normalizeText(goal);

  if (/(ai|ml|machine learning|data scientist|deep learning)/i.test(normalized)) {
    return ["Python", "Machine Learning", "Deep Learning", "MLOps", "Statistics", "Data Structures"];
  }
  if (/(web|frontend|backend|full stack|react|node)/i.test(normalized)) {
    return ["HTML", "CSS", "JavaScript", "React", "Node.js", "Databases", "APIs"];
  }
  if (/(cyber|security|ethical hacking|soc)/i.test(normalized)) {
    return ["Networking", "Linux", "Web Security", "Cryptography", "Incident Response"];
  }
  if (/(upsc|civil services)/i.test(normalized)) {
    return ["Polity", "Economy", "Geography", "History", "Ethics", "Current Affairs"];
  }

  return ["Communication", "Problem Solving", "Domain Fundamentals", "Projects", "Interview Preparation"];
}

function getProjectIdeasForGoal(goal = "") {
  const normalized = normalizeText(goal);
  if (/(ai|ml|machine learning|data scientist|deep learning)/i.test(normalized)) {
    return [
      "Gesture Controlled Game",
      "AI Resume Analyzer",
      "Face Recognition Attendance",
      "Student Performance Predictor",
      "Document Q&A Assistant"
    ];
  }
  if (/(web|frontend|backend|full stack|react|node)/i.test(normalized)) {
    return [
      "Mentor Booking Platform",
      "Realtime Group Chat App",
      "Portfolio Builder",
      "Task Management SaaS",
      "Campus Events Web App"
    ];
  }
  if (/(cyber|security|ethical hacking|soc)/i.test(normalized)) {
    return [
      "Password Strength Analyzer",
      "Phishing URL Detector",
      "Basic Vulnerability Scanner (Lab Only)",
      "Secure Notes App with Encryption",
      "SOC Alert Dashboard (Mock Data)"
    ];
  }
  if (/(data science|data analytics|analytics|power bi|tableau)/i.test(normalized)) {
    return [
      "Student Performance Dashboard",
      "Sales Forecasting Mini Project",
      "Exploratory Data Analysis (EDA) Portfolio",
      "Job Market Insights Scraper (Public Data)",
      "Recommendation System (Basics)"
    ];
  }
  if (/(upsc|civil services)/i.test(normalized)) {
    return [
      "Daily Current Affairs Tracker",
      "UPSC Notes Organizer",
      "Mains Answer Writing Timer",
      "Mock Test Revision Planner"
    ];
  }
  if (/(academics|school|intermediate|ssc|cbse|icse)/i.test(normalized)) {
    return [
      "Study Planner and Timetable Builder",
      "Subject-wise Revision Tracker",
      "Flashcards App for Key Concepts",
      "Exam Countdown and Practice Log"
    ];
  }
  return [
    "Career Roadmap Tracker",
    "Skill Gap Analyzer Tool",
    "Peer Learning Community App",
    "Interview Prep Quiz App"
  ];
}

function normalizedLevelFromScore(skillScore) {
  if (skillScore < 30) return "Easy";
  if (skillScore < 70) return "Medium";
  return "Hard";
}

function domainFromProfile({ user, profile }) {
  const preferred =
    user?.primaryCategory ||
    (Array.isArray(user?.interestedCategories) ? user.interestedCategories[0] : "") ||
    profile?.careerGoals ||
    "Technology & AI";
  const domainOptions = Object.keys(mentorCategoryTree || {});
  const direct = domainOptions.find((item) => normalizeText(item) === normalizeText(preferred));
  if (direct) return direct;
  const fuzzy = domainOptions.find((item) => normalizeText(preferred).includes(normalizeText(item)));
  return fuzzy || "Technology & AI";
}

function buildQuizContext({ user, profile, domain }) {
  const domainMap = mentorCategoryTree[domain] || {};
  const availableSubCategories = Object.keys(domainMap);
  const selectedSubCategory =
    availableSubCategories.find((item) => normalizeText(item) === normalizeText(user?.subCategory || "")) ||
    availableSubCategories.find((item) => normalizeText(profile?.careerGoals || "").includes(normalizeText(item))) ||
    availableSubCategories[0] ||
    "";

  const availableSpecializations = selectedSubCategory ? domainMap[selectedSubCategory] || [] : [];
  const selectedSpecializations = (user?.specializations || []).filter((item) =>
    availableSpecializations.some((spec) => normalizeText(spec) === normalizeText(item))
  );

  return {
    domain,
    subCategory: selectedSubCategory,
    specializations: selectedSpecializations.length ? selectedSpecializations : availableSpecializations.slice(0, 4),
    availableSubCategories,
    profileSkills: (profile?.skills || []).map((item) => String(item || "").trim()).filter(Boolean),
    careerGoal: profile?.careerGoals || user?.goals || ""
  };
}

function domainSkills(domain, quizContext = null) {
  const subMap = mentorCategoryTree[domain] || {};
  const seen = new Set();
  const skills = [];
  if (quizContext?.subCategory) {
    seen.add(quizContext.subCategory);
    skills.push(quizContext.subCategory);
  }
  (quizContext?.specializations || []).forEach((spec) => {
    if (!seen.has(spec)) {
      seen.add(spec);
      skills.push(spec);
    }
  });
  (quizContext?.profileSkills || []).forEach((skill) => {
    if (!seen.has(skill)) {
      seen.add(skill);
      skills.push(skill);
    }
  });
  Object.entries(subMap).forEach(([sub, specs]) => {
    if (!seen.has(sub)) {
      seen.add(sub);
      skills.push(sub);
    }
    (specs || []).forEach((spec) => {
      if (!seen.has(spec)) {
        seen.add(spec);
        skills.push(spec);
      }
    });
  });
  return skills.slice(0, 12);
}

const FACTUAL_QUIZ_BANK = {
  python: {
    easy: [
      {
        question: "Which Python library is commonly used for graphs and plotting?",
        options: ["Matplotlib", "Express", "Selenium", "Bootstrap"],
        correctOption: "Matplotlib",
        explanation: "Matplotlib is a standard Python library for charts and plotting."
      },
      {
        question: "Which symbol is used to start a comment in Python?",
        options: ["#", "//", "<!--", "/*"],
        correctOption: "#",
        explanation: "Python single-line comments begin with the # symbol."
      }
    ],
    medium: [
      {
        question: "Which Python data type stores key-value pairs?",
        options: ["Dictionary", "Tuple", "Set", "String"],
        correctOption: "Dictionary",
        explanation: "A dictionary stores values as key-value pairs."
      }
    ],
    hard: [
      {
        question: "Which keyword is used to define a function in Python?",
        options: ["def", "func", "function", "lambda"],
        correctOption: "def",
        explanation: "Functions in Python are defined with the def keyword."
      }
    ]
  },
  html: {
    easy: [
      {
        question: "Which HTML attribute is used to specify the image source?",
        options: ["src", "href", "alt", "link"],
        correctOption: "src",
        explanation: "The src attribute tells the browser where the image file is located."
      }
    ],
    medium: [
      {
        question: "Which tag is used to create a hyperlink in HTML?",
        options: ["<a>", "<img>", "<p>", "<link>"],
        correctOption: "<a>",
        explanation: "The anchor tag <a> is used for hyperlinks."
      }
    ],
    hard: [
      {
        question: "Which attribute provides alternative text for an image in HTML?",
        options: ["alt", "title", "name", "srcset"],
        correctOption: "alt",
        explanation: "The alt attribute provides alternative text for accessibility and fallback."
      }
    ]
  },
  react: {
    easy: [
      {
        question: "Which hook is commonly used to manage state in a React function component?",
        options: ["useState", "useEffect", "useRef", "useMemo"],
        correctOption: "useState",
        explanation: "useState is the standard React hook for local component state."
      }
    ],
    medium: [
      {
        question: "Which prop is commonly used to render lists efficiently in React?",
        options: ["key", "id", "index", "ref"],
        correctOption: "key",
        explanation: "The key prop helps React track list items efficiently."
      }
    ],
    hard: [
      {
        question: "Which hook is used to run side effects in React?",
        options: ["useEffect", "useState", "useLayout", "useReducer"],
        correctOption: "useEffect",
        explanation: "useEffect is used for side effects such as fetching data or subscriptions."
      }
    ]
  },
  "node.js": {
    easy: [
      {
        question: "Node.js is primarily used to run JavaScript on which side?",
        options: ["Server side", "Browser UI only", "Database only", "Operating system kernel"],
        correctOption: "Server side",
        explanation: "Node.js allows JavaScript to run on the server side."
      }
    ]
  },
  algebra: {
    easy: [
      {
        question: "What is the value of x in the equation x + 5 = 9?",
        options: ["4", "5", "9", "14"],
        correctOption: "4",
        explanation: "Subtracting 5 from both sides gives x = 4."
      }
    ]
  },
  physics: {
    easy: [
      {
        question: "What is the SI unit of force?",
        options: ["Newton", "Joule", "Watt", "Pascal"],
        correctOption: "Newton",
        explanation: "Force is measured in newtons."
      }
    ]
  },
  chemistry: {
    easy: [
      {
        question: "What is the chemical symbol for water?",
        options: ["H2O", "O2", "CO2", "NaCl"],
        correctOption: "H2O",
        explanation: "Water is made of two hydrogen atoms and one oxygen atom."
      }
    ]
  },
  biology: {
    easy: [
      {
        question: "Which organ pumps blood through the human body?",
        options: ["Heart", "Lungs", "Liver", "Kidney"],
        correctOption: "Heart",
        explanation: "The heart pumps blood throughout the body."
      }
    ]
  },
  geography: {
    easy: [
      {
        question: "What is the capital of the United States of America?",
        options: ["Washington, D.C.", "New York", "Los Angeles", "Chicago"],
        correctOption: "Washington, D.C.",
        explanation: "Washington, D.C. is the capital city of the USA."
      }
    ]
  },
  history: {
    easy: [
      {
        question: "Who is widely credited with inventing the practical electric bulb?",
        options: ["Thomas Edison", "Isaac Newton", "Alexander Fleming", "Galileo"],
        correctOption: "Thomas Edison",
        explanation: "Thomas Edison is widely credited with the practical incandescent bulb."
      }
    ]
  },
  polity: {
    easy: [
      {
        question: "Who is known as the Father of the Indian Constitution?",
        options: ["B. R. Ambedkar", "Mahatma Gandhi", "Jawaharlal Nehru", "Sardar Patel"],
        correctOption: "B. R. Ambedkar",
        explanation: "Dr. B. R. Ambedkar is widely regarded as the principal architect of the Indian Constitution."
      }
    ]
  },
  economics: {
    easy: [
      {
        question: "Which term refers to a general rise in prices over time?",
        options: ["Inflation", "Deflation", "Subsidy", "Tariff"],
        correctOption: "Inflation",
        explanation: "Inflation means prices are rising over time."
      }
    ]
  },
  "machine learning": {
    easy: [
      {
        question: "Which of these is a supervised learning algorithm?",
        options: ["Linear Regression", "K-Means", "Apriori", "PCA"],
        correctOption: "Linear Regression",
        explanation: "Linear Regression is a supervised learning algorithm."
      }
    ],
    medium: [
      {
        question: "Which dataset split is used to evaluate model performance after training?",
        options: ["Test set", "Training set", "Feature set", "Label set"],
        correctOption: "Test set",
        explanation: "The test set is used to evaluate final model performance."
      }
    ]
  },
  "deep learning": {
    easy: [
      {
        question: "Which neural network is commonly used for image tasks?",
        options: ["CNN", "RNN", "KNN", "SVM"],
        correctOption: "CNN",
        explanation: "Convolutional Neural Networks are widely used for image processing."
      }
    ]
  },
  mlops: {
    easy: [
      {
        question: "Which MLOps task focuses on watching models after deployment?",
        options: ["Monitoring", "Tokenization", "Normalization", "Augmentation"],
        correctOption: "Monitoring",
        explanation: "Monitoring tracks model health and performance after deployment."
      }
    ]
  }
};

function getFactualBank(skill) {
  const normalized = normalizeText(skill);
  return (
    FACTUAL_QUIZ_BANK[normalized] ||
    FACTUAL_QUIZ_BANK[normalized.replace(/\s+/g, " ")] ||
    FACTUAL_QUIZ_BANK[normalized.replace(/ basics| fundamentals| core/g, "")]
  );
}

function buildQuestionTemplates({ domain, subCategory, skill, careerGoal, alternatives = [] }) {
  const safeSkill = skill || "Core Concepts";
  const safeDomain = domain || "General";
  const safeSubCategory = subCategory || safeDomain;
  const distractors = alternatives.filter((item) => normalizeText(item) !== normalizeText(safeSkill)).slice(0, 3);
  while (distractors.length < 3) {
    distractors.push(`General ${safeSubCategory} theory ${distractors.length + 1}`);
  }

  const factualBank = getFactualBank(safeSkill);
  if (factualBank) {
    return {
      easy: factualBank.easy || [],
      medium: factualBank.medium || factualBank.easy || [],
      hard: factualBank.hard || factualBank.medium || factualBank.easy || []
    };
  }

  return {
    easy: [
      {
        question: `Which of the following belongs to ${safeSubCategory} under ${safeDomain}?`,
        options: [safeSkill, ...distractors],
        correctOption: safeSkill,
        explanation: `${safeSkill} is part of ${safeSubCategory} inside the ${safeDomain} path.`
      },
      {
        question: `Which topic is directly associated with ${safeSkill}?`,
        options: [
          safeSkill,
          distractors[0],
          distractors[1],
          distractors[2]
        ],
        correctOption: safeSkill,
        explanation: `${safeSkill} is one of the tracked concepts in this domain path.`
      }
    ],
    medium: [
      {
        question: `${safeSkill} is most closely linked to which path?`,
        options: [
          `${safeDomain} -> ${safeSubCategory}`,
          `${careerGoal || "General Career"} -> Random Topics`,
          "Unrelated category -> Memorization",
          "No domain mapping"
        ],
        correctOption: `${safeDomain} -> ${safeSubCategory}`,
        explanation: `${safeSkill} belongs inside the ${safeSubCategory} track of ${safeDomain}.`
      },
      {
        question: `Which option is a valid concept from ${safeSubCategory}?`,
        options: [
          safeSkill,
          `Capital of ${safeSkill}`,
          `History of ${distractors[0]}`,
          "All of the above unrelated"
        ],
        correctOption: safeSkill,
        explanation: `${safeSkill} is a valid topic inside the selected student path.`
      }
    ],
    hard: [
      {
        question: `In the ORIN domain map, ${safeSkill} should be grouped under which sub-category?`,
        options: [
          safeSubCategory,
          distractors[0],
          distractors[1],
          distractors[2]
        ],
        correctOption: safeSubCategory,
        explanation: `${safeSkill} is currently grouped under ${safeSubCategory} in the selected path.`
      },
      {
        question: `Which domain contains ${safeSkill} in the student's current guide path?`,
        options: [
          safeDomain,
          distractors[0],
          distractors[1],
          distractors[2]
        ],
        correctOption: safeDomain,
        explanation: `${safeSkill} belongs to ${safeDomain} in this quiz context.`
      }
    ]
  };
}

function generateQuestionPool({ domain, skills, quizContext }) {
  const chosenSkills = (skills || []).slice(0, 6);
  const pool = [];
  chosenSkills.forEach((skill) => {
    const templates = buildQuestionTemplates({
      domain,
      subCategory: quizContext?.subCategory,
      skill,
      careerGoal: quizContext?.careerGoal,
      alternatives: chosenSkills
    });
    ["easy", "medium", "hard"].forEach((difficulty) => {
      const list = templates[difficulty] || [];
      list.forEach((item, idx) => {
        pool.push({
          id: `${normalizeText(domain)}-${normalizeText(skill)}-${difficulty}-${idx + 1}`,
          question: item.question,
          options: item.options,
          correct: item.correctOption,
          difficulty,
          explanation: item.explanation,
          skill
        });
      });
    });
  });
  return pool;
}

async function upsertUserSkill(userId, domain, skillName, isCorrect) {
  const row = await UserSkillLevel.findOneAndUpdate(
    { userId, domain, skillName },
    {
      $setOnInsert: {
        userId,
        domain,
        skillName,
        skillScore: 50,
        level: "Medium"
      }
    },
    { upsert: true, new: true }
  );

  const delta = isCorrect ? 5 : -2;
  const nextScore = Math.max(0, Math.min(100, Number(row.skillScore || 50) + delta));
  row.skillScore = nextScore;
  row.level = normalizedLevelFromScore(nextScore);
  row.lastUpdated = new Date();
  await row.save();
  return row;
}

async function updateQuizStreak(userId, dateKey) {
  const streak = (await QuizStreak.findOne({ userId })) || (await QuizStreak.create({ userId, currentStreak: 0, lastQuizDate: "" }));
  if (streak.lastQuizDate === dateKey) {
    return streak;
  }

  let next = 1;
  if (streak.lastQuizDate) {
    const last = new Date(`${streak.lastQuizDate}T00:00:00.000Z`);
    const current = new Date(`${dateKey}T00:00:00.000Z`);
    const diffDays = Math.round((current.getTime() - last.getTime()) / 86400000);
    next = diffDays === 1 ? streak.currentStreak + 1 : 1;
  }
  streak.currentStreak = next;
  streak.lastQuizDate = dateKey;
  await streak.save();
  return streak;
}

async function buildSkillRadar(userId, domain) {
  const rows = await UserSkillLevel.find({ userId, domain }).sort({ updatedAt: -1 }).limit(6).lean();
  return {
    domain,
    skills: rows.map((row) => ({
      name: row.skillName,
      score: Math.max(0, Math.min(100, Number(row.skillScore || 0)))
    }))
  };
}

async function buildWeakSkillMentorRecommendations(domain, weakSkills = []) {
  if (!weakSkills.length) return [];
  const weakTokens = weakSkills.map((item) => normalizeText(item)).filter(Boolean);
  const mentors = await User.find({
    role: "mentor",
    approvalStatus: "approved",
    isDeleted: false,
    $or: [
      { primaryCategory: domain },
      { specializations: { $in: weakSkills } }
    ]
  })
    .select("name primaryCategory subCategory specializations")
    .limit(25)
    .lean();

  return mentors
    .map((mentor) => {
      const mentorTags = uniqueTokens([
        mentor.primaryCategory,
        mentor.subCategory,
        ...(mentor.specializations || [])
      ]);
      const overlap = weakTokens.filter((token) => mentorTags.has(token)).length;
      return {
        mentorId: mentor._id,
        name: mentor.name,
        expertise: mentor.specializations || [],
        matchScore: overlap * 30 + (mentor.primaryCategory === domain ? 20 : 0)
      };
    })
    .filter((item) => item.matchScore > 0)
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 5);
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
  await Notification.create({
    title: "New Follower",
    message: "Someone started following you on ORIN.",
    type: "direct",
    sentBy: followerId,
    targetRole: "all",
    recipient: userId
  });
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

exports.getSavedPosts = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const posts = await FeedPost.find({ savedBy: userId })
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

exports.updatePost = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { postId } = req.params;
  const { content } = req.body;

  if (!mongoose.Types.ObjectId.isValid(postId)) throw new ApiError(400, "Invalid post id");
  if (!content || content.trim().length < 3) throw new ApiError(400, "Post content is required");

  const post = await FeedPost.findById(postId);
  if (!post) throw new ApiError(404, "Post not found");
  if (String(post.authorId) !== String(userId)) throw new ApiError(403, "You can edit only your own posts");

  post.content = content.trim();
  await post.save();

  const hydrated = await FeedPost.findById(postId)
    .populate("authorId", "name role profilePhotoUrl")
    .lean();

  res.json(toFeedResponse(hydrated, userId, []));
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

exports.getPostComments = asyncHandler(async (req, res) => {
  const { postId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(postId)) throw new ApiError(400, "Invalid post id");

  const post = await FeedPost.findById(postId);
  if (!post) throw new ApiError(404, "Post not found");

  const comments = await FeedComment.find({ postId })
    .populate("authorId", "name role")
    .sort({ createdAt: -1 })
    .lean();

  res.json(comments);
});

exports.updateComment = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { postId, commentId } = req.params;
  const { content } = req.body;

  if (!mongoose.Types.ObjectId.isValid(postId) || !mongoose.Types.ObjectId.isValid(commentId)) {
    throw new ApiError(400, "Invalid id");
  }
  if (!content || !content.trim()) throw new ApiError(400, "Comment content is required");

  const comment = await FeedComment.findOne({ _id: commentId, postId });
  if (!comment) throw new ApiError(404, "Comment not found");
  if (String(comment.authorId) !== String(userId)) throw new ApiError(403, "You can edit only your own comment");

  comment.content = content.trim();
  await comment.save();

  const data = await FeedComment.findById(comment._id).populate("authorId", "name role").lean();
  res.json(data);
});

exports.deleteComment = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { postId, commentId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(postId) || !mongoose.Types.ObjectId.isValid(commentId)) {
    throw new ApiError(400, "Invalid id");
  }

  const [comment, post] = await Promise.all([
    FeedComment.findOne({ _id: commentId, postId }),
    FeedPost.findById(postId)
  ]);
  if (!comment) throw new ApiError(404, "Comment not found");
  if (!post) throw new ApiError(404, "Post not found");

  const isCommentOwner = String(comment.authorId) === String(userId);
  const isPostOwner = String(post.authorId) === String(userId);
  if (!isCommentOwner && !isPostOwner) {
    throw new ApiError(403, "Not allowed to delete this comment");
  }

  await comment.deleteOne();
  post.commentCount = Math.max(0, Number(post.commentCount || 0) - 1);
  await post.save();

  res.json({ message: "Comment deleted" });
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
  const [reputation, profile, userDoc, todayAttempt, streak] = await Promise.all([
    ensureReputation(userId),
    StudentProfile.findOne({ userId }).select("collegeName careerGoals skills").lean(),
    User.findById(userId).select("primaryCategory interestedCategories").lean(),
    QuizAttempt.findOne({ userId, dateKey }).lean(),
    QuizStreak.findOne({ userId }).lean()
  ]);
  const domain = domainFromProfile({ user: userDoc, profile });

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

  const skillRadar = await buildSkillRadar(userId, domain);
  const sortedSkills = [...(skillRadar.skills || [])].sort((a, b) => b.score - a.score);
  const strength = sortedSkills[0]?.name || "Consistent Learning";
  const weakSkills = sortedSkills.filter((item) => item.score < 60).map((item) => item.name).slice(0, 3);
  const mentorRecommendations = await buildWeakSkillMentorRecommendations(domain, weakSkills);
  const trendingOpportunity = await CareerOpportunity.findOne({ isActive: true }).sort({ updatedAt: -1 }).lean();

  res.json({
    dateKey,
    tasks: [],
    streakDays: streak?.currentStreak || 0,
    xp: todayAttempt?.xpAwarded || 0,
    levelTag: reputation.levelTag,
    reputationScore: reputation.score,
    dailyQuiz: {
      completedToday: Boolean(todayAttempt),
      domain,
      attemptsLeft: todayAttempt ? 0 : 1,
      message: todayAttempt ? QUIZ_DAILY_LIMIT_MESSAGE : "Complete today's adaptive quiz to earn XP.",
      result: todayAttempt
        ? {
            score: todayAttempt.score,
            totalQuestions: todayAttempt.totalQuestions || 5,
            xpEarned: todayAttempt.xpAwarded || 0,
            streak: todayAttempt.streakAfter || streak?.currentStreak || 0
          }
        : null
    },
    skillRadar,
    careerIntelligence: todayAttempt
      ? {
          strength,
          needsImprovement: weakSkills,
          mentorRecommendations,
          recommendedNextStep:
            weakSkills.length > 0
              ? `Book a mentor session on ${weakSkills[0]}.`
              : "Continue with advanced challenges to maintain momentum.",
          trendingOpportunity: trendingOpportunity
            ? {
                title: trendingOpportunity.title,
                company: trendingOpportunity.company || "",
                role: trendingOpportunity.role || ""
              }
            : null
        }
      : null,
    leaderboard: {
      globalRank,
      collegeRank
    }
  });
});

exports.completeDailyTask = asyncHandler(async (req, res) => {
  res.status(410).json({
    message: "Daily tasks were replaced by Daily Career Quiz.",
    action: "Use /api/network/daily-quiz and /api/network/daily-quiz/submit."
  });
});

exports.getDailyQuiz = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const dateKey = toDateKey();
  const [profile, userDoc, existingAttempt, streak] = await Promise.all([
    StudentProfile.findOne({ userId }).select("careerGoals skills").lean(),
    User.findById(userId).select("primaryCategory interestedCategories").lean(),
    QuizAttempt.findOne({ userId, dateKey }).lean(),
    QuizStreak.findOne({ userId }).lean()
  ]);
  const domain = domainFromProfile({ user: userDoc, profile });

  if (existingAttempt) {
    return res.json({
      completedToday: true,
      dateKey,
      domain,
      message: QUIZ_DAILY_LIMIT_MESSAGE,
      result: {
        score: existingAttempt.score,
        totalQuestions: existingAttempt.totalQuestions || 5,
        xpEarned: existingAttempt.xpAwarded || 0,
        streak: existingAttempt.streakAfter || streak?.currentStreak || 0
      },
      quiz: null
    });
  }

  const quizContext = buildQuizContext({ user: userDoc, profile, domain });
  const seededSkills = domainSkills(domain, quizContext);
  const profileSkills = (profile?.skills || []).map((item) => String(item || "").trim()).filter(Boolean);
  const skillSet = Array.from(new Set([...profileSkills, ...seededSkills]));
  const questionPool = generateQuestionPool({ domain, skills: skillSet, quizContext });
  const userSkillRows = await UserSkillLevel.find({ userId, domain }).select("skillScore").lean();
  const avgSkill =
    userSkillRows.length > 0
      ? userSkillRows.reduce((sum, item) => sum + Number(item.skillScore || 0), 0) / userSkillRows.length
      : 50;
  const startDifficulty = avgSkill < 30 ? "easy" : avgSkill < 70 ? "medium" : "hard";

  res.json({
    completedToday: false,
    dateKey,
    domain,
    subCategory: quizContext.subCategory,
    message: "Daily Career Quiz ready.",
    streak: streak?.currentStreak || 0,
    quiz: {
      totalQuestions: 5,
      startDifficulty,
      questionPool
    }
  });
});

exports.submitDailyQuiz = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const dateKey = toDateKey();
  const { domain, answers } = req.body || {};

  if (!domain || typeof domain !== "string") throw new ApiError(400, "Domain is required");
  if (!Array.isArray(answers) || answers.length !== 5) throw new ApiError(400, "Exactly 5 answers are required");

  const existingAttempt = await QuizAttempt.findOne({ userId, dateKey });
  if (existingAttempt) throw new ApiError(400, QUIZ_DAILY_LIMIT_MESSAGE);

  const normalizedAnswers = answers.map((item) => ({
    questionId: String(item.questionId || ""),
    skillName: String(item.skill || item.skillName || "General").trim(),
    difficulty: ["easy", "medium", "hard"].includes(String(item.difficulty || "").toLowerCase())
      ? String(item.difficulty).toLowerCase()
      : "medium",
    selectedOption: String(item.selectedOption || ""),
    correctOption: String(item.correctOption || ""),
    isCorrect: Boolean(item.isCorrect)
  }));

  const score = normalizedAnswers.filter((item) => item.isCorrect).length;
  const baseXp = QUIZ_XP_BY_SCORE[score] || 0;
  const streak = await updateQuizStreak(userId, dateKey);
  const streakBonus = STREAK_BONUS_XP[streak.currentStreak] || 0;
  const totalXp = baseXp + streakBonus;

  const updatedSkillRows = [];
  for (const answer of normalizedAnswers) {
    const updated = await upsertUserSkill(userId, domain, answer.skillName, answer.isCorrect);
    updatedSkillRows.push(updated);
  }

  const attempt = await QuizAttempt.create({
    userId,
    dateKey,
    domain,
    score,
    totalQuestions: 5,
    xpAwarded: totalXp,
    streakAfter: streak.currentStreak,
    answers: normalizedAnswers
  });

  await applyReputationDelta(userId, { dailyChallenges: 1 });

  const sortedSkills = [...updatedSkillRows].sort((a, b) => Number(b.skillScore || 0) - Number(a.skillScore || 0));
  const strength = sortedSkills[0]?.skillName || "Consistent Learning";
  const weakSkills = sortedSkills.filter((item) => Number(item.skillScore || 0) < 60).map((item) => item.skillName).slice(0, 3);
  const mentorRecommendations = await buildWeakSkillMentorRecommendations(domain, weakSkills);
  const trendingOpportunity = await CareerOpportunity.findOne({ isActive: true }).sort({ updatedAt: -1 }).lean();

  res.status(201).json({
    message: "Quiz completed",
    result: {
      score,
      totalQuestions: 5,
      xpEarned: totalXp,
      streak: streak.currentStreak
    },
    streakBonusXp: streakBonus,
    skillRadar: {
      domain,
      skills: sortedSkills.slice(0, 6).map((item) => ({
        name: item.skillName,
        score: Number(item.skillScore || 0)
      }))
    },
    careerIntelligence: {
      strength,
      needsImprovement: weakSkills,
      mentorRecommendations,
      recommendedNextStep:
        weakSkills.length > 0
          ? `Book a mentor session on ${weakSkills[0]}.`
          : "Continue advanced projects and mentor interactions.",
      trendingOpportunity: trendingOpportunity
        ? {
            title: trendingOpportunity.title,
            company: trendingOpportunity.company || "",
            role: trendingOpportunity.role || ""
          }
        : null
    },
    attemptId: attempt._id
  });
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

  const domainOverride = String(req.query.domain || "").trim();
  const subDomainOverride = String(req.query.subDomain || "").trim();
  const goalOverride = String(req.query.goal || "").trim();
  const skillsOverride = parseCsvList(req.query.skills);
  const levelOverride = normalizeText(req.query.level || "");

  const effectiveDomain = domainOverride || studentUser?.primaryCategory || "";
  const effectiveSubDomain = subDomainOverride || studentUser?.subCategory || "";
  const effectiveGoal = goalOverride || studentProfile?.careerGoals || studentUser?.goals || effectiveDomain || "Career Growth";
  const effectiveSkills = skillsOverride.length ? skillsOverride : studentProfile?.skills || [];

  const studentSignals = [
    ...effectiveSkills,
    ...(effectiveGoal ? [effectiveGoal] : []),
    ...(studentUser?.goals ? [studentUser.goals] : []),
    ...(effectiveDomain ? [effectiveDomain] : []),
    ...(effectiveSubDomain ? [effectiveSubDomain] : [])
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
      if (!user || user.role !== "mentor" || user.approvalStatus !== "approved" || user.isDeleted === true) return false;

      // Optional level filter coming from the app UI (Beginner / Intermediate / Advanced).
      if (!levelOverride) return true;
      const years = Number(item.experienceYears || 0);
      if (levelOverride === "beginner") return years <= 3;
      if (levelOverride === "intermediate") return years >= 2 && years <= 6;
      if (levelOverride === "advanced") return years >= 5;
      return true;
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
        normalizeText(mentor.primaryCategory) === normalizeText(effectiveDomain || "")
          ? 1
          : 0;
      const subCategoryExact =
        normalizeText(mentor.subCategory) &&
        normalizeText(mentor.subCategory) === normalizeText(effectiveSubDomain || "")
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
      domain: effectiveDomain,
      subDomain: effectiveSubDomain,
      skills: effectiveSkills,
      careerGoal: effectiveGoal,
      level: levelOverride || ""
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
      posterImageUrl: item.posterImageUrl || "",
      startsAt: item.startsAt,
      endsAt: item.endsAt,
      meetingLink: item.meetingLink,
      domainTags: item.domainTags || [],
      interestedCount: Array.isArray(item.interestedUserIds) ? item.interestedUserIds.length : 0,
      isInterested: Array.isArray(item.interestedUserIds)
        ? item.interestedUserIds.some((userId) => String(userId) === String(req.user.id))
        : false,
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

  const {
    title,
    topic = "",
    description = "",
    posterImageUrl = "",
    startsAt,
    endsAt = null,
    meetingLink = "",
    domainTags = []
  } = req.body;
  if (!title || !String(title).trim()) throw new ApiError(400, "title is required");
  const startDate = new Date(startsAt);
  if (Number.isNaN(startDate.getTime())) throw new ApiError(400, "startsAt is invalid");

  const doc = await MentorLiveSession.create({
    mentorId: req.user.id,
    title: String(title).trim(),
    topic: String(topic || "").trim(),
    description: String(description || "").trim(),
    posterImageUrl: String(posterImageUrl || "").trim(),
    startsAt: startDate,
    endsAt: endsAt ? new Date(endsAt) : null,
    meetingLink: String(meetingLink || "").trim(),
    domainTags: Array.isArray(domainTags) ? domainTags : [],
    interestedUserIds: [],
    isPublic: true,
    isCancelled: false
  });

  res.status(201).json({ message: "Live session created", liveSession: doc });
});

exports.toggleLiveSessionInterest = asyncHandler(async (req, res) => {
  const { liveSessionId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(liveSessionId)) throw new ApiError(400, "Invalid live session id");

  const liveSession = await MentorLiveSession.findById(liveSessionId);
  if (!liveSession || liveSession.isCancelled || !liveSession.isPublic) {
    throw new ApiError(404, "Live session not found");
  }

  if (String(liveSession.mentorId) === String(req.user.id)) {
    throw new ApiError(400, "Mentor cannot mark interest on own live session");
  }

  const alreadyInterested = (liveSession.interestedUserIds || []).some(
    (userId) => String(userId) === String(req.user.id)
  );

  if (alreadyInterested) {
    liveSession.interestedUserIds = (liveSession.interestedUserIds || []).filter(
      (userId) => String(userId) !== String(req.user.id)
    );
  } else {
    liveSession.interestedUserIds.push(req.user.id);
  }

  await liveSession.save();

  res.json({
    message: alreadyInterested ? "Interest removed" : "Marked as interested",
    liveSession: {
      id: liveSession._id,
      interestedCount: liveSession.interestedUserIds.length,
      isInterested: !alreadyInterested
    }
  });
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

exports.getSkillGapAnalysis = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const studentProfile = await StudentProfile.findOne({ userId }).select("skills careerGoals projects").lean();
  const user = await User.findById(userId).select("goals primaryCategory subCategory").lean();

  const goal = String(req.query.goal || studentProfile?.careerGoals || user?.goals || user?.primaryCategory || "Career Growth");
  const requiredSkills = getRequiredSkillsForGoal(goal);
  const overrideSkills = parseCsvList(req.query.skills);
  const currentSkills = (overrideSkills.length ? overrideSkills : studentProfile?.skills || [])
    .map((item) => String(item).trim())
    .filter(Boolean);
  const currentTokens = new Set(currentSkills.map((item) => normalizeText(item)));
  const missingSkills = requiredSkills.filter((skill) => !currentTokens.has(normalizeText(skill)));

  const mentorProfiles = await MentorProfile.find({})
    .populate("userId", "name approvalStatus role isDeleted")
    .sort({ rating: -1, totalSessionsConducted: -1 })
    .limit(80)
    .lean();
  const recommendedMentors = mentorProfiles
    .filter((item) => item.userId?.role === "mentor" && item.userId?.approvalStatus === "approved" && item.userId?.isDeleted !== true)
    .map((item) => {
      const signals = uniqueTokens([
        item.primaryCategory,
        item.subCategory,
        ...(item.specializations || []),
        ...(item.expertiseDomains || [])
      ]);
      let score = 0;
      missingSkills.forEach((skill) => {
        if (signals.has(normalizeText(skill))) score += 1;
      });
      return {
        mentorId: item.userId?._id,
        name: item.userId?.name || "Mentor",
        rating: Number(item.rating || 0),
        verifiedBadge: Boolean(item.verifiedBadge),
        score
      };
    })
    .sort((a, b) => b.score - a.score || b.rating - a.rating)
    .slice(0, 6);

  const projectIdeas = getProjectIdeasForGoal(goal).slice(0, 5);
  const roadmapSteps = getRoadmapForGoal(goal).slice(0, 5);

  res.json({
    goal,
    currentSkills,
    missingSkills,
    suggestions: {
      mentors: recommendedMentors,
      courses: missingSkills.map((skill) => `${skill} Fundamentals`),
      projects: projectIdeas,
      roadmapUpdates: roadmapSteps
    }
  });
});

exports.getVerifiedMentors = asyncHandler(async (_req, res) => {
  const mentors = await MentorProfile.find({ verifiedBadge: true })
    .populate("userId", "name role approvalStatus isDeleted")
    .sort({ rating: -1, totalSessionsConducted: -1, updatedAt: -1 })
    .limit(60)
    .lean();

  const rows = mentors
    .filter((item) => item.userId?.role === "mentor" && item.userId?.approvalStatus === "approved" && item.userId?.isDeleted !== true)
    .map((item) => ({
      mentorId: item.userId?._id,
      name: item.userId?.name || "Mentor",
      title: item.title || "Mentor",
      company: item.company || "",
      rating: Number(item.rating || 0),
      totalSessionsConducted: Number(item.totalSessionsConducted || 0),
      verifiedBadge: true,
      profilePhotoUrl: item.profilePhotoUrl || "",
      primaryCategory: item.primaryCategory || "",
      subCategory: item.subCategory || ""
    }));

  res.json(rows);
});

exports.getCommunityChallenges = asyncHandler(async (_req, res) => {
  let challenges = await CommunityChallenge.find({ isActive: true })
    .sort({ deadline: 1, createdAt: -1 })
    .limit(40)
    .lean();

  if (!challenges.length) {
    challenges = [
      {
        _id: "seed-challenge-ai",
        title: "AI Challenge - Build Image Classifier",
        domain: "AI & Machine Learning",
        description: "Build and submit an image classifier project.",
        deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        participants: new Array(320).fill(""),
        topParticipants: []
      }
    ];
  }

  res.json(
    challenges.map((item) => ({
      id: item._id,
      title: item.title,
      domain: item.domain,
      description: item.description,
      deadline: item.deadline,
      participantsCount: (item.participants || []).length,
      topParticipants: item.topParticipants || []
    }))
  );
});

exports.joinCommunityChallenge = asyncHandler(async (req, res) => {
  const { challengeId } = req.params;
  const userId = req.user.id;
  if (!mongoose.Types.ObjectId.isValid(challengeId)) throw new ApiError(400, "Invalid challengeId");

  const challenge = await CommunityChallenge.findOne({ _id: challengeId, isActive: true });
  if (!challenge) throw new ApiError(404, "Challenge not found");

  const already = challenge.participants.some((id) => String(id) === String(userId));
  if (!already) {
    challenge.participants.push(userId);
    await challenge.save();
  }

  await applyReputationDelta(userId, { dailyChallenges: 1 });

  res.json({ message: "Challenge joined", participantsCount: challenge.participants.length });
});

exports.getOrinCertifications = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const [certs, profile] = await Promise.all([
    OrinCertification.find({ userId }).sort({ issuedAt: -1 }).limit(60).lean(),
    StudentProfile.findOne({ userId }).select("certifications").lean()
  ]);

  const profileCerts = (profile?.certifications || []).map((title, idx) => ({
    id: `profile-${idx}`,
    title: String(title),
    level: "Profile",
    domain: "",
    issuedAt: null,
    source: "Profile"
  }));

  res.json([
    ...certs.map((item) => ({
      id: item._id,
      title: item.title,
      level: item.level,
      domain: item.domain,
      issuedAt: item.issuedAt,
      source: item.source
    })),
    ...profileCerts
  ]);
});

exports.getMentorGroups = asyncHandler(async (_req, res) => {
  let groups = await MentorGroup.find({ isActive: true })
    .populate("mentorId", "name role approvalStatus isDeleted")
    .sort({ updatedAt: -1 })
    .limit(60)
    .lean();

  if (!groups.length) {
    groups = [
      {
        _id: "seed-group-ai",
        mentorId: { _id: null, name: "Google ML Engineer", role: "mentor", approvalStatus: "approved", isDeleted: false },
        name: "AI Beginners",
        domain: "AI & Machine Learning",
        description: "Weekly learning group for AI basics.",
        maxStudents: 50,
        memberIds: [],
        schedule: "Weekly sessions",
        isActive: true
      }
    ];
  }

  res.json(
    groups
      .filter((item) => !item.mentorId || (item.mentorId.role === "mentor" && item.mentorId.approvalStatus === "approved" && item.mentorId.isDeleted !== true))
      .map((item) => ({
        id: item._id,
        name: item.name,
        domain: item.domain,
        description: item.description,
        mentor: {
          id: item.mentorId?._id || null,
          name: item.mentorId?.name || "Mentor"
        },
        maxStudents: item.maxStudents || 0,
        membersCount: (item.memberIds || []).length,
        schedule: item.schedule || "Weekly sessions"
      }))
  );
});

exports.joinMentorGroup = asyncHandler(async (req, res) => {
  const { groupId } = req.params;
  const userId = req.user.id;
  if (!mongoose.Types.ObjectId.isValid(groupId)) throw new ApiError(400, "Invalid groupId");

  const group = await MentorGroup.findOne({ _id: groupId, isActive: true });
  if (!group) throw new ApiError(404, "Group not found");
  if (req.user.role !== "student") throw new ApiError(403, "Only students can join groups");

  const already = group.memberIds.some((id) => String(id) === String(userId));
  if (!already) {
    if (group.maxStudents > 0 && group.memberIds.length >= group.maxStudents) {
      throw new ApiError(400, "Group is full");
    }
    group.memberIds.push(userId);
    await group.save();
  }

  await applyReputationDelta(userId, { activityPosts: 1 });
  res.json({ message: "Joined mentor group", membersCount: group.memberIds.length });
});

exports.getProjectIdeas = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const profile = await StudentProfile.findOne({ userId }).select("careerGoals skills").lean();
  const user = await User.findById(userId).select("goals primaryCategory").lean();
  const domainOverride = String(req.query.domain || "").trim();
  const levelOverride = String(req.query.level || "").trim();
  const goal = String(req.query.goal || domainOverride || profile?.careerGoals || user?.goals || user?.primaryCategory || "Career Growth");
  const difficulty =
    normalizeText(levelOverride) === "beginner"
      ? "Easy"
      : normalizeText(levelOverride) === "advanced"
        ? "Hard"
        : "Medium";

  res.json({
    goal,
    domain: domainOverride || user?.primaryCategory || "",
    level: levelOverride || "",
    ideas: getProjectIdeasForGoal(goal).map((title) => ({
      title,
      level: difficulty,
      tags: tokenize(goal).slice(0, 3)
    }))
  });
});

exports.getKnowledgeLibrary = asyncHandler(async (req, res) => {
  const queryDomain = String(req.query.domain || "").trim();
  let resources = await KnowledgeResource.find({
    isActive: true,
    ...(queryDomain ? { domain: queryDomain } : {})
  })
    .sort({ updatedAt: -1 })
    .limit(100)
    .lean();

  if (!resources.length) {
    resources = [
      {
        _id: "seed-lib-1",
        domain: queryDomain || "AI & Machine Learning",
        type: "interview_questions",
        title: "Top 50 AI Interview Questions",
        description: "Core ML, DL, and model deployment interview Q&A.",
        url: ""
      },
      {
        _id: "seed-lib-2",
        domain: queryDomain || "Web Development",
        type: "coding_resource",
        title: "Full Stack Coding Resource Pack",
        description: "Practice links, project references, and interview prep.",
        url: ""
      },
      {
        _id: "seed-lib-3",
        domain: queryDomain || "Career",
        type: "career_guide",
        title: "Career Growth Guide",
        description: "How to choose skills, projects, and mentorship path.",
        url: ""
      }
    ];
  }

  res.json(
    resources.map((item) => ({
      id: item._id,
      domain: item.domain || "",
      type: item.type,
      title: item.title,
      description: item.description || "",
      url: item.url || ""
    }))
  );
});

exports.getReputationSummary = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const [rep, globalSnapshot] = await Promise.all([
    ensureReputation(userId),
    LeaderboardSnapshot.findOne({ dateKey: toDateKey(), scope: "global", collegeName: "" }).lean()
  ]);
  const total = (globalSnapshot?.entries || []).length || 1;
  const myRank = (globalSnapshot?.entries || []).find((item) => String(item.userId) === String(userId))?.rank || total;
  const percentile = Math.max(1, Math.round((myRank / total) * 100));

  res.json({
    score: rep.score,
    levelTag: rep.levelTag,
    topPercent: percentile,
    breakdown: rep.breakdown
  });
});
