const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const AiChatLog = require("../models/AiChatLog");
const HighSchoolLearningActivity = require("../models/HighSchoolLearningActivity");
const { aiChatDailyLimit } = require("../config/env");
const { getSubscriptionEntitlement } = require("../services/subscriptionService");
const { requestAiResponse } = require("../services/aiService");
const { retrieveAcademicContext } = require("../services/orinAiEngineService");
const { summarizeAcademicContext, getSubjectRecord, getSubjectRecordForClass, getManualPdfsForClassSubject, getAcademicImagesForContext } = require("../services/academicService");
const User = require("../models/User");
const StudentProfile = require("../models/StudentProfile");
const { updateJourneyGoal, updateSkillProfile } = require("../services/journeyStateService");
const mongoose = require("mongoose");

const HIGH_SCHOOL_SUBJECTS = ["Mathematics", "Science", "Social Science", "English", "Telugu", "Hindi", "Sanskrit", "Computer", "Physics", "Chemistry", "Biology"];
const FALLBACK_SUBJECT_GAP_QUESTIONS = [
  {
    id: "math-fractions-1",
    subject: "Mathematics",
    topic: "Fractions",
    question: "What is 1/2 + 1/4?",
    options: ["2/6", "3/4", "1/8", "1/6"],
    correct: "3/4",
    explanation: "Convert 1/2 to 2/4, then add 2/4 + 1/4 = 3/4."
  },
  {
    id: "math-algebra-1",
    subject: "Mathematics",
    topic: "Algebra",
    question: "If x + 7 = 12, what is x?",
    options: ["3", "4", "5", "6"],
    correct: "5",
    explanation: "Subtract 7 from both sides: x = 12 - 7 = 5."
  },
  {
    id: "math-geometry-1",
    subject: "Mathematics",
    topic: "Geometry",
    question: "How many degrees are in a right angle?",
    options: ["45", "60", "90", "180"],
    correct: "90",
    explanation: "A right angle measures exactly 90 degrees."
  },
  {
    id: "science-electricity-1",
    subject: "Science",
    topic: "Electricity",
    question: "Which material is a good conductor of electricity?",
    options: ["Rubber", "Plastic", "Copper", "Wood"],
    correct: "Copper",
    explanation: "Copper lets electric current pass through it easily."
  },
  {
    id: "science-plants-1",
    subject: "Science",
    topic: "Plants",
    question: "Which part of a plant absorbs water from soil?",
    options: ["Leaf", "Root", "Flower", "Fruit"],
    correct: "Root",
    explanation: "Roots absorb water and minerals from the soil."
  },
  {
    id: "science-forces-1",
    subject: "Science",
    topic: "Forces",
    question: "A push or pull on an object is called a...",
    options: ["Force", "Light", "Sound", "Heat"],
    correct: "Force",
    explanation: "Force is a push or pull that can change motion."
  },
  {
    id: "english-grammar-1",
    subject: "English",
    topic: "Grammar",
    question: "Choose the correct sentence.",
    options: ["She go to school.", "She goes to school.", "She going school.", "She gone school."],
    correct: "She goes to school.",
    explanation: "For he/she/it in simple present tense, we usually add s or es to the verb."
  },
  {
    id: "english-reading-1",
    subject: "English",
    topic: "Reading",
    question: "What is the main idea of a paragraph?",
    options: ["A small spelling mistake", "The central point", "Only the last word", "A punctuation mark"],
    correct: "The central point",
    explanation: "The main idea is the central point the paragraph is about."
  },
  {
    id: "english-vocabulary-1",
    subject: "English",
    topic: "Vocabulary",
    question: "Which word means the opposite of 'brave'?",
    options: ["Fearful", "Strong", "Happy", "Fast"],
    correct: "Fearful",
    explanation: "Fearful is close to the opposite of brave."
  }
];

function clampNumber(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function safeJsonParse(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (_) {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch (_) {
      return null;
    }
  }
}

const HIGH_SCHOOL_JSON_MODE = "highschool_json";
const MAX_PROFILE_ACTIVITY_ROWS = 80;
const STUDY_ASSISTANT_STOP_WORDS = new Set([
  "what",
  "when",
  "where",
  "which",
  "explain",
  "write",
  "answer",
  "exam",
  "simple",
  "step",
  "steps",
  "class",
  "subject",
  "about",
  "with",
  "from",
  "this",
  "that",
  "your",
  "please",
  "tell",
  "give",
  "mean",
  "means"
]);

function extractStudyKeywords(text) {
  return Array.from(
    new Set(
      String(text || "")
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .split(/\s+/)
        .map((word) => word.trim())
        .filter((word) => word.length >= 3 && !STUDY_ASSISTANT_STOP_WORDS.has(word))
    )
  ).slice(0, 12);
}

function hasUsefulStudyKeywordOverlap(question, result) {
  const keywords = extractStudyKeywords(question);
  if (!keywords.length) return false;
  const answerText = [
    result?.title,
    result?.summary,
    result?.simpleAnswer,
    result?.examAnswer,
    ...(Array.isArray(result?.stepByStep) ? result.stepByStep : []),
    ...(Array.isArray(result?.keyPoints) ? result.keyPoints : [])
  ]
    .join(" ")
    .toLowerCase();
  return keywords.some((keyword) => answerText.includes(keyword));
}

function hasRealPracticeOptions(question) {
  const options = Array.isArray(question?.options)
    ? question.options.map((option) => String(option || "").trim()).filter(Boolean)
    : [];
  const correct = String(question?.correct || "").trim();
  const placeholderOptions = new Set(["A", "B", "C", "D", "OPTION A", "OPTION B", "OPTION C", "OPTION D"]);
  if (options.length !== 4 || !correct || !options.includes(correct)) return false;
  if (options.every((option) => placeholderOptions.has(option.toUpperCase()))) return false;
  return options.every((option) => option.length >= 2);
}

function normalizeSubject(value) {
  const text = String(value || "").trim();
  const examSubject = normalizeExamSubject(text);
  return HIGH_SCHOOL_SUBJECTS.find((item) => item.toLowerCase() === String(examSubject || text).toLowerCase())
    || examSubject
    || "Mathematics";
}

function normalizeGapQuestion(item, index) {
  const subject = normalizeSubject(item?.subject);
  const options = Array.isArray(item?.options)
    ? item.options.map((option) => String(option || "").trim()).filter(Boolean).slice(0, 4)
    : [];
  const correct = String(item?.correct || "").trim();
  const placeholderOptions = new Set(["A", "B", "C", "D"]);
  if (options.every((option) => placeholderOptions.has(option.toUpperCase()))) return null;
  if (options.length !== 4 || !correct || !options.includes(correct)) return null;
  const weakQuestionPatterns = [
    /\bwhat is the correct meaning of ["']?(this|that|it|these|those)\b/i,
    /\bwhat is the correct meaning of ["']?this value of x["']?\b/i
  ];
  const questionText = String(item?.question || "").trim();
  if (weakQuestionPatterns.some((pattern) => pattern.test(questionText))) return null;
  if (questionText.length < 10) return null;

  return {
    id: String(item?.id || `${subject.toLowerCase()}-${index + 1}`).trim().slice(0, 80),
    subject,
    topic: String(item?.topic || "Core Concept").trim().slice(0, 80),
    question: questionText.slice(0, 500),
    options,
    correct,
    explanation: String(item?.explanation || "Review this concept and try one similar practice question.").trim().slice(0, 500)
  };
}

function buildDeterministicTopicQuestions(subject, topic, questionCount) {
  const key = `${normalizeSubject(subject)}:${String(topic || "").trim()}`;
  const bank = {
    "Mathematics:Fractions": [
      ["What is 1/2 + 1/4?", ["2/6", "3/4", "1/8", "1/6"], "3/4", "Convert 1/2 to 2/4, then add 2/4 + 1/4 = 3/4."],
      ["Which fraction is equal to 0.75?", ["1/4", "2/3", "3/4", "4/3"], "3/4", "0.75 means seventy-five hundredths, which simplifies to 3/4."],
      ["What is 2/5 of 20?", ["4", "8", "10", "12"], "8", "Divide 20 into 5 equal parts and take 2 parts: 4 x 2 = 8."],
      ["Which is the smallest fraction?", ["1/2", "1/3", "2/3", "3/4"], "1/3", "One third is smaller than one half, two thirds, and three fourths."],
      ["What is 3/4 - 1/4?", ["1/4", "1/2", "2/4", "Both 1/2 and 2/4"], "Both 1/2 and 2/4", "3/4 - 1/4 = 2/4, and 2/4 simplifies to 1/2."]
    ],
    "Mathematics:Algebra": [
      ["If x + 7 = 12, what is x?", ["3", "4", "5", "6"], "5", "Subtract 7 from both sides: x = 12 - 7 = 5."],
      ["Simplify: 3a + 2a", ["5a", "6a", "a", "5"], "5a", "Like terms can be added: 3a + 2a = 5a."],
      ["If 2x = 18, what is x?", ["6", "8", "9", "16"], "9", "Divide both sides by 2, so x = 9."],
      ["Which expression means five more than n?", ["5n", "n - 5", "n + 5", "5 - n"], "n + 5", "Five more than n means add 5 to n."],
      ["Simplify: 4y - y", ["3y", "4", "5y", "y"], "3y", "Subtract one y from four y terms to get 3y."]
    ],
    "Mathematics:Geometry": [
      ["How many degrees are in a right angle?", ["45", "60", "90", "180"], "90", "A right angle measures exactly 90 degrees."],
      ["How many sides does a hexagon have?", ["5", "6", "7", "8"], "6", "A hexagon is a polygon with 6 sides."],
      ["What is the perimeter of a square with side 4 cm?", ["8 cm", "12 cm", "16 cm", "20 cm"], "16 cm", "Perimeter of a square is 4 times the side: 4 x 4 = 16 cm."],
      ["Which shape has three sides?", ["Circle", "Triangle", "Rectangle", "Pentagon"], "Triangle", "A triangle has exactly three sides."],
      ["The sum of angles in a triangle is...", ["90 degrees", "120 degrees", "180 degrees", "360 degrees"], "180 degrees", "All interior angles of a triangle add up to 180 degrees."]
    ],
    "Mathematics:Numbers": [
      ["Which number is prime?", ["9", "11", "15", "21"], "11", "11 has only two factors: 1 and 11."],
      ["What is the place value of 7 in 4,725?", ["7", "70", "700", "7000"], "700", "In 4,725, the digit 7 is in the hundreds place."],
      ["What is 15 x 6?", ["60", "75", "90", "120"], "90", "15 x 6 = 90."],
      ["Which is an even number?", ["13", "21", "34", "45"], "34", "Even numbers are divisible by 2, and 34 is divisible by 2."],
      ["What is 144 divided by 12?", ["10", "11", "12", "14"], "12", "12 x 12 = 144, so 144 divided by 12 is 12."]
    ],
    "Science:Electricity": [
      ["Which material is a good conductor of electricity?", ["Rubber", "Plastic", "Copper", "Wood"], "Copper", "Copper lets electric current pass through it easily."],
      ["What does a switch do in a circuit?", ["Stores charge", "Opens or closes the circuit", "Makes water", "Changes color"], "Opens or closes the circuit", "A switch controls whether current can flow through the circuit."],
      ["The unit of electric current is...", ["Volt", "Ampere", "Ohm", "Watt"], "Ampere", "Electric current is measured in amperes."],
      ["A closed circuit allows current to...", ["Stop completely", "Flow", "Disappear", "Turn into sound only"], "Flow", "Current flows when the circuit path is complete."],
      ["Which device converts electrical energy into light?", ["Bulb", "Compass", "Ruler", "Spring"], "Bulb", "A bulb uses electrical energy to produce light."]
    ],
    "Science:Plants": [
      ["Which part of a plant absorbs water from soil?", ["Leaf", "Root", "Flower", "Fruit"], "Root", "Roots absorb water and minerals from the soil."],
      ["Plants make food by a process called...", ["Evaporation", "Photosynthesis", "Condensation", "Digestion"], "Photosynthesis", "Photosynthesis is how green plants make food using sunlight."],
      ["Which gas do plants mostly take in for photosynthesis?", ["Oxygen", "Carbon dioxide", "Nitrogen", "Hydrogen"], "Carbon dioxide", "Plants use carbon dioxide, water, and sunlight to make food."],
      ["The green pigment in leaves is called...", ["Chlorophyll", "Hemoglobin", "Melanin", "Keratin"], "Chlorophyll", "Chlorophyll helps leaves capture sunlight."],
      ["Which part of a plant usually makes seeds?", ["Flower", "Root", "Stem", "Bark"], "Flower", "Flowers are involved in reproduction and seed formation."]
    ],
    "Science:Forces": [
      ["A push or pull on an object is called a...", ["Force", "Light", "Sound", "Heat"], "Force", "Force is a push or pull that can change motion."],
      ["Which force pulls objects toward Earth?", ["Friction", "Gravity", "Magnetism", "Pressure"], "Gravity", "Gravity pulls objects toward the Earth."],
      ["Friction usually acts...", ["In the direction of motion", "Opposite to motion", "Only upward", "Only in water"], "Opposite to motion", "Friction resists motion between surfaces."],
      ["A force can change an object's...", ["Color only", "Motion or shape", "Name", "Age"], "Motion or shape", "Force can start, stop, speed up, slow down, or deform an object."],
      ["Which force helps a bicycle brake stop the wheel?", ["Friction", "Gravity", "Buoyancy", "Static charge"], "Friction", "Brakes use friction to slow down wheel rotation."]
    ],
    "Science:Life Processes": [
      ["The process of taking in food and using it is called...", ["Nutrition", "Reflection", "Evaporation", "Magnetism"], "Nutrition", "Nutrition is the life process related to taking and using food."],
      ["Which organ pumps blood in humans?", ["Lungs", "Heart", "Stomach", "Kidney"], "Heart", "The heart pumps blood through the body."],
      ["Breathing helps the body take in...", ["Oxygen", "Sand", "Smoke", "Salt"], "Oxygen", "Oxygen is needed for respiration and energy release."],
      ["Plants lose water vapor mainly through...", ["Stomata", "Roots only", "Seeds", "Petals only"], "Stomata", "Stomata are tiny openings on leaves that help gas exchange and transpiration."],
      ["The removal of waste from the body is called...", ["Excretion", "Photosynthesis", "Friction", "Melting"], "Excretion", "Excretion removes metabolic wastes from the body."]
    ],
    "English:Grammar": [
      ["Choose the correct sentence.", ["She go to school.", "She goes to school.", "She going school.", "She gone school."], "She goes to school.", "For she in simple present tense, we usually add s or es to the verb."],
      ["Which word is an adjective?", ["Run", "Beautiful", "Quickly", "Table"], "Beautiful", "An adjective describes a noun."],
      ["Choose the correct past tense of 'go'.", ["Goed", "Went", "Going", "Goes"], "Went", "Went is the past tense form of go."],
      ["Which sentence uses a proper noun?", ["the city is big", "Hyderabad is big", "a city is big", "that city is big"], "Hyderabad is big", "Hyderabad is a proper noun and begins with a capital letter."],
      ["Select the correct article: I saw ___ elephant.", ["a", "an", "the only", "no article"], "an", "Use an before a vowel sound."]
    ],
    "English:Reading": [
      ["What is the main idea of a paragraph?", ["A small spelling mistake", "The central point", "Only the last word", "A punctuation mark"], "The central point", "The main idea is the central point the paragraph is about."],
      ["A title usually tells the reader...", ["The topic", "The page number only", "The author's age", "The font size"], "The topic", "A title gives a clue about the topic or focus."],
      ["What should you do first when answering a passage question?", ["Guess quickly", "Read the question and passage carefully", "Skip all details", "Copy any sentence"], "Read the question and passage carefully", "Careful reading helps you find evidence for the answer."],
      ["A supporting detail helps explain...", ["The main idea", "Only punctuation", "The book cover", "The page margin"], "The main idea", "Supporting details give evidence or examples for the main idea."],
      ["An inference is...", ["A guess based on clues", "A spelling rule only", "A type of full stop", "A chapter number"], "A guess based on clues", "Inference means using clues and prior knowledge to understand unstated meaning."]
    ],
    "English:Vocabulary": [
      ["Which word means the opposite of 'brave'?", ["Fearful", "Strong", "Happy", "Fast"], "Fearful", "Fearful is close to the opposite of brave."],
      ["What does 'improve' mean?", ["Make worse", "Make better", "Forget", "Stop"], "Make better", "To improve means to make something better."],
      ["Choose the synonym of 'quick'.", ["Slow", "Fast", "Late", "Heavy"], "Fast", "Fast and quick have similar meanings."],
      ["What does 'ancient' mean?", ["Very old", "Very small", "Very loud", "Very wet"], "Very old", "Ancient means from a very old time."],
      ["Choose the antonym of 'difficult'.", ["Hard", "Easy", "Complex", "Tough"], "Easy", "Easy is the opposite of difficult."]
    ],
    "English:Writing Skills": [
      ["A paragraph should usually focus on...", ["One main idea", "Many unrelated ideas", "Only punctuation", "Only the date"], "One main idea", "A clear paragraph develops one main idea."],
      ["Which is best for a formal letter?", ["Hey bro", "Respected Sir/Madam", "Yo!", "What up"], "Respected Sir/Madam", "Formal letters use respectful and clear openings."],
      ["A conclusion should...", ["Introduce a new unrelated topic", "Summarize or close the idea", "Remove the main point", "Only repeat one word"], "Summarize or close the idea", "A conclusion closes the writing by summarizing or giving a final thought."],
      ["Which sentence is clearer?", ["Because exam.", "I studied because the exam is tomorrow.", "Tomorrow because studied I.", "Exam studied because tomorrow I."], "I studied because the exam is tomorrow.", "The sentence has a clear subject, verb, and reason."],
      ["Before submitting writing, you should check...", ["Only color", "Spelling, grammar, and clarity", "Only page size", "Only emojis"], "Spelling, grammar, and clarity", "Proofreading improves correctness and readability."]
    ]
  };
  const rows = bank[key] || bank[`${normalizeSubject(subject)}:${String(topic || "").trim()}`] || [];
  return rows.slice(0, questionCount).map((row, index) => ({
    id: `${key.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${index + 1}`,
    subject: normalizeSubject(subject),
    topic: String(topic || "Core Concept").trim() || "Core Concept",
    question: row[0],
    options: row[1],
    correct: row[2],
    explanation: row[3]
  }));
}

function buildSubjectGapFallbackQuiz({ subjects = HIGH_SCHOOL_SUBJECTS, questionCount = 9, focusTopic = "" }) {
  const allowed = new Set(subjects.map(normalizeSubject));
  const topic = String(focusTopic || "").trim().toLowerCase();
  const filtered = FALLBACK_SUBJECT_GAP_QUESTIONS.filter((item) => {
    const subjectMatch = allowed.has(item.subject);
    const topicMatch = !topic || item.topic.toLowerCase() === topic;
    return subjectMatch && topicMatch;
  });
  if (focusTopic && subjects.length === 1 && filtered.length < questionCount) {
    const generated = buildDeterministicTopicQuestions(subjects[0], focusTopic, questionCount);
    if (generated.length) return generated;
  }
  const source = filtered.length ? filtered : FALLBACK_SUBJECT_GAP_QUESTIONS;
  return source.slice(0, questionCount).map((item, index) => ({ ...item, id: `${item.id}-${index}` }));
}

function scoreHighSchoolSubjectGap(questions = [], answers = {}) {
  const bySubject = new Map();
  const byTopic = new Map();
  let correctCount = 0;

  questions.forEach((question) => {
    const subject = normalizeSubject(question.subject);
    const topic = String(question.topic || "Core Concept").trim() || "Core Concept";
    const isCorrect = String(answers?.[question.id] || "") === String(question.correct || "");
    if (isCorrect) correctCount += 1;

    const subjectRow = bySubject.get(subject) || { key: subject, label: subject, correct: 0, total: 0 };
    subjectRow.total += 1;
    if (isCorrect) subjectRow.correct += 1;
    bySubject.set(subject, subjectRow);

    const topicKey = `${subject}:${topic}`;
    const topicRow = byTopic.get(topicKey) || { key: topicKey, label: topic, subject, correct: 0, total: 0 };
    topicRow.total += 1;
    if (isCorrect) topicRow.correct += 1;
    byTopic.set(topicKey, topicRow);
  });

  const withPercent = (row) => ({
    ...row,
    percent: row.total ? Math.round((row.correct / row.total) * 100) : 0
  });
  const subjectRows = Array.from(bySubject.values()).map(withPercent);
  const topicRows = Array.from(byTopic.values()).map(withPercent);
  const weakRows = topicRows.filter((row) => row.percent < 60).sort((a, b) => a.percent - b.percent);
  const averageRows = topicRows.filter((row) => row.percent >= 60 && row.percent < 80).sort((a, b) => a.percent - b.percent);
  const strengthRows = topicRows.filter((row) => row.percent >= 80).sort((a, b) => b.percent - a.percent);
  const focusRows = weakRows.length ? weakRows.slice(0, 2) : averageRows.slice(0, 2);
  const overallScore = questions.length ? Math.round((correctCount / questions.length) * 100) : 0;

  return {
    overallScore,
    completedQuestions: questions.length,
    totalCorrect: correctCount,
    subjectRows,
    topicRows,
    weakRows,
    averageRows,
    strengthRows,
    focusRows
  };
}

function buildFallbackFocusPlan(score) {
  const focusRows = score.focusRows.length ? score.focusRows : score.topicRows.slice(0, 2);
  const topics = focusRows.map((item) => item.label);
  const label = topics.join(" and ") || "your next weak topic";
  return {
    title: "Your Focus Plan",
    topics,
    description: `Focus on ${label} this week. Practice 5-10 questions daily and aim to improve by 10%.`,
    dailyPractice: "Practice 5-10 short questions daily.",
    improvementTarget: "Improve by 10% in the next report.",
    steps: [
      `Revise ${topics[0] || "one weak topic"} for 15 minutes.`,
      "Attempt a short practice quiz.",
      "Review every wrong answer and retry similar questions."
    ]
  };
}

const WEAK_DEFINITION_TERMS = new Set([
  "this", "that", "these", "those", "it", "its", "they", "them", "we", "you", "he", "she"
]);

function isUsefulDefinitionEntry(term = "", meaning = "") {
  const cleanedTerm = cleanAcademicText(term).toLowerCase();
  const cleanedMeaning = cleanAcademicText(meaning);
  if (!cleanedTerm || !cleanedMeaning) return false;
  if (WEAK_DEFINITION_TERMS.has(cleanedTerm)) return false;
  if (cleanedTerm.length < 3 || cleanedTerm.length > 80) return false;
  if (cleanedMeaning.length < 12) return false;
  if (/^(this|that|these|those)\b/i.test(cleanedMeaning)) return false;
  return true;
}

function isUsefulKeyPoint(point = "") {
  const cleaned = cleanAcademicText(point);
  if (!cleaned) return false;
  if (cleaned.length < 14) return false;
  if (/^(this|that|these|those)\b/i.test(cleaned)) return false;
  if (/^(only|just)\b/i.test(cleaned)) return false;
  return true;
}

function decodePdfMojibake(value = "") {
  const text = String(value || "");
  if (!/[àÂ][\u0080-\u00ff]/.test(text) && !text.includes("à°") && !text.includes("à±")) return text;
  try {
    const decoded = Buffer.from(text, "latin1").toString("utf8");
    return decoded && decoded !== text ? decoded : text;
  } catch {
    return text;
  }
}

function cleanAcademicText(value = "") {
  return decodePdfMojibake(value)
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeClassLevel(value = "") {
  const number = String(value || "").match(/\d+/)?.[0];
  return number || String(value || "").trim().slice(0, 40);
}

function normalizeBoard(value = "") {
  return String(value || "SSC").trim().toUpperCase().slice(0, 20);
}

function uniqueCleanList(items = [], limit = 12) {
  const seen = new Set();
  const out = [];
  for (const item of Array.isArray(items) ? items : []) {
    const clean = cleanAcademicText(item || "").slice(0, 120);
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
    if (out.length >= limit) break;
  }
  return out;
}

function normalizePlannerSubject(value = "") {
  return normalizeExamSubject(value) || normalizeSubject(value);
}

async function recordHighSchoolActivity(userId, source, payload = {}) {
  if (!userId) return null;
  const subject = normalizePlannerSubject(payload.subject || "");
  const doc = {
    userId,
    source,
    board: normalizeBoard(payload.board),
    classLevel: normalizeClassLevel(payload.classLevel || "10"),
    subject,
    topics: uniqueCleanList(payload.topics, 30),
    weakTopics: uniqueCleanList(payload.weakTopics, 20),
    strongTopics: uniqueCleanList(payload.strongTopics, 20),
    wrongAnswerTopics: uniqueCleanList(payload.wrongAnswerTopics, 20),
    doubts: uniqueCleanList(payload.doubts, 10),
    selectedTopics: uniqueCleanList(payload.selectedTopics, 30),
    pendingTopics: uniqueCleanList(payload.pendingTopics, 30),
    completedTopics: uniqueCleanList(payload.completedTopics, 30),
    score: Number.isFinite(Number(payload.score)) ? Number(payload.score) : null,
    details: payload.details && typeof payload.details === "object" ? payload.details : {}
  };
  if (!doc.subject) return null;
  try {
    return await HighSchoolLearningActivity.create(doc);
  } catch {
    return null;
  }
}

function incrementTopic(map, topic, weight, source) {
  const clean = cleanAcademicText(topic || "");
  if (!clean) return;
  const key = clean.toLowerCase();
  const existing = map.get(key) || { topic: clean, score: 0, sources: new Set() };
  existing.score += weight;
  if (source) existing.sources.add(source);
  map.set(key, existing);
}

function compactTopicMap(map, limit = 10) {
  return Array.from(map.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => ({ topic: item.topic, score: item.score, sources: Array.from(item.sources) }));
}

function summarizeHighSchoolActivities(activities = []) {
  const weak = new Map();
  const wrong = new Map();
  const doubts = [];
  const exam = new Map();
  const roadmap = new Map();
  const planner = new Map();
  const strong = new Map();

  for (const row of activities) {
    const source = row.source;
    (row.weakTopics || []).forEach((topic) => incrementTopic(weak, topic, source === "subject_gap" ? 8 : 4, source));
    (row.wrongAnswerTopics || []).forEach((topic) => incrementTopic(wrong, topic, 7, source));
    (row.strongTopics || []).forEach((topic) => incrementTopic(strong, topic, 3, source));
    (row.selectedTopics || []).forEach((topic) => incrementTopic(exam, topic, source === "exam_strategy" ? 4 : 2, source));
    (row.pendingTopics || []).forEach((topic) => incrementTopic(roadmap, topic, source === "study_roadmap" ? 3 : 2, source));
    (row.topics || []).forEach((topic) => {
      if (source === "study_planner") incrementTopic(planner, topic, 2, source);
    });
    (row.doubts || []).forEach((doubt) => {
      const clean = cleanAcademicText(doubt || "");
      if (clean) doubts.push({ text: clean.slice(0, 160), createdAt: row.createdAt });
    });
  }

  const recentDoubts = doubts
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 6)
    .map((item) => item.text);

  const hasUsefulHistory = Boolean(
    weak.size || wrong.size || recentDoubts.length || exam.size || roadmap.size || planner.size
  );

  return {
    hasUsefulHistory,
    activityCount: activities.length,
    weakTopics: compactTopicMap(weak, 10),
    wrongAnswerTopics: compactTopicMap(wrong, 10),
    recentDoubts,
    examFocusTopics: compactTopicMap(exam, 10),
    pendingRoadmapTopics: compactTopicMap(roadmap, 10),
    plannerTopics: compactTopicMap(planner, 8),
    strongTopics: compactTopicMap(strong, 8),
    lastActivityAt: activities[0]?.createdAt || null
  };
}

async function buildHighSchoolStudyProfile(userId, { board, classLevel, subject }) {
  const filter = {
    userId,
    board: normalizeBoard(board),
    classLevel: normalizeClassLevel(classLevel || "10"),
    subject: normalizePlannerSubject(subject)
  };
  const activities = await HighSchoolLearningActivity.find(filter)
    .sort({ createdAt: -1 })
    .limit(MAX_PROFILE_ACTIVITY_ROWS)
    .lean();
  return {
    board: filter.board,
    classLevel: filter.classLevel,
    subject: filter.subject,
    ...summarizeHighSchoolActivities(activities)
  };
}

function profilePriorityTopics(profile = {}, academicTopics = []) {
  const ranked = [
    ...(profile.weakTopics || []).map((item) => ({ ...item, weight: 100 })),
    ...(profile.wrongAnswerTopics || []).map((item) => ({ ...item, weight: 80 })),
    ...(profile.recentDoubts || []).map((text) => ({ topic: text, score: 1, sources: ["study_assistant"], weight: 60 })),
    ...(profile.examFocusTopics || []).map((item) => ({ ...item, weight: 40 })),
    ...(profile.pendingRoadmapTopics || []).map((item) => ({ ...item, weight: 25 }))
  ];
  const seen = new Set();
  const picked = [];
  for (const item of ranked.sort((a, b) => (b.weight + b.score) - (a.weight + a.score))) {
    const clean = cleanAcademicText(item.topic || "");
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    picked.push(clean);
    if (picked.length >= 8) break;
  }
  if (picked.length < 5) {
    for (const row of academicTopics) {
      const topic = cleanAcademicText(row?.topic || row?.chapter || "");
      const key = topic.toLowerCase();
      if (topic && !seen.has(key)) {
        seen.add(key);
        picked.push(topic);
      }
      if (picked.length >= 8) break;
    }
  }
  return picked;
}

function hasBrokenPdfText(value = "") {
  const text = String(value || "");
  return /(?:à°|à±|Â|�)/.test(text);
}

function isGenericRoadmapText(value = "") {
  const key = String(value || "").trim().toLowerCase();
  return !key || /^(mission|step|core topic|concept clarity|practice|quick quiz|final check)(\s+\d+)?$/.test(key);
}

function recordVerificationState(record = {}) {
  const metadata = record?.metadata || record?.subject?.metadata || {};
  const extractionStatus = String(metadata.extraction_status || "").trim().toLowerCase();
  const verificationStatus = String(metadata.verification_status || "").trim().toLowerCase();
  const sourceType = String(metadata.source_type || "").trim().toLowerCase();
  const pending = ["pending_ocr", "needs_ocr", "extraction_pending", "needs_review", "review_required"].some((status) =>
    extractionStatus.includes(status) || verificationStatus.includes(status)
  );
  const fallback = ["generated_fallback", "curated_fallback"].includes(sourceType);
  return {
    verified: !pending && !fallback,
    usable: !fallback && Boolean(extractionStatus || verificationStatus || metadata.extraction_message || metadata.source_note),
    reviewPending: pending,
    extractionStatus,
    verificationStatus,
    message: metadata.extraction_message || metadata.source_note || ""
  };
}

function hasUsableExtractedText(record = {}) {
  const subjectRecord = record?.subject || record || {};
  const chapters = Array.isArray(subjectRecord?.chapters) ? subjectRecord.chapters : [];
  return chapters.some((chapter) =>
    String(chapter?.fullText || "").trim().length >= 500 ||
    (Array.isArray(chapter?.pages) && chapter.pages.length) ||
    (Array.isArray(chapter?.lessonSections) && chapter.lessonSections.length) ||
    (Array.isArray(chapter?.textbookQuestions) && chapter.textbookQuestions.length)
  );
}

function roadmapSubjectKind(subjectName = "") {
  const key = String(subjectName || "").toLowerCase();
  if (key.includes("math")) return "mathematics";
  if (key.includes("physics") || key.includes("physical")) return "physics";
  if (key.includes("biology") || key.includes("biological")) return "biology";
  if (key.includes("social")) return "social";
  if (key.includes("telugu") || key.includes("hindi") || key.includes("english") || key.includes("sanskrit")) return "language";
  if (key.includes("science") || key.includes("chem")) return "science";
  return "general";
}

function roadmapSkillLevel(value = "") {
  const key = String(value || "").toLowerCase();
  if (key.includes("strong") || key.includes("advanced")) return "advanced";
  if (key.includes("average") || key.includes("intermediate")) return "intermediate";
  return "beginner";
}

function roadmapMissionTemplate(subjectName = "") {
  const kind = roadmapSubjectKind(subjectName);
  const templates = {
    mathematics: [
      { label: "Concept Foundation", type: "Read", practice: "Build a formula map and list standard results", proof: "Upload formula notes or solved example page" },
      { label: "Formula Map", type: "Practice", practice: "Write formulas with one example each", proof: "Submit your formula sheet" },
      { label: "Solved Examples", type: "Practice", practice: "Solve textbook examples step by step", proof: "Submit 3 solved examples" },
      { label: "Exercise Practice", type: "Practice", practice: "Solve exercise problems from easy to application level", proof: "Submit exercise answers or score" },
      { label: "Weak-Area Drill", type: "Quiz", practice: "Retry mistakes and similar questions", proof: "Submit mistake corrections" },
      { label: "Revision Test", type: "Quiz", practice: "Take a short timed chapter test", proof: "Submit test score and corrections" }
    ],
    physics: [
      { label: "Concept Foundation", type: "Read", practice: "Define key terms and laws in your own words", proof: "Submit concept notes" },
      { label: "Formula and Numericals", type: "Practice", practice: "Practice formula use and solved numericals", proof: "Submit numerical solutions" },
      { label: "Diagram or Experiment", type: "Practice", practice: "Draw diagrams or write lab observations", proof: "Submit diagram/experiment notes" },
      { label: "Textbook Questions", type: "Practice", practice: "Answer short and long textbook questions", proof: "Submit answer practice" },
      { label: "Application Practice", type: "Quiz", practice: "Solve application or daily-life questions", proof: "Submit application answers" },
      { label: "Revision Quiz", type: "Quiz", practice: "Take a quick revision quiz", proof: "Submit quiz score and corrections" }
    ],
    biology: [
      { label: "Concept Foundation", type: "Read", practice: "Explain the process or system clearly", proof: "Submit concept notes" },
      { label: "Diagrams and Processes", type: "Practice", practice: "Draw labelled diagrams and flow steps", proof: "Submit diagram/process page" },
      { label: "Definitions", type: "Read", practice: "Write important definitions and terms", proof: "Submit definitions list" },
      { label: "Textbook Questions", type: "Practice", practice: "Answer textbook short and long questions", proof: "Submit answer practice" },
      { label: "Revision Quiz", type: "Quiz", practice: "Take a concept and diagram quiz", proof: "Submit quiz score and corrections" }
    ],
    social: [
      { label: "Chapter Reading", type: "Read", practice: "Read the chapter and mark key ideas", proof: "Submit reading notes" },
      { label: "Key Terms and Dates", type: "Practice", practice: "List important terms, dates, places, and people", proof: "Submit key terms sheet" },
      { label: "Map or Timeline Work", type: "Practice", practice: "Create a map, timeline, or flow chart where relevant", proof: "Submit map/timeline notes" },
      { label: "Short and Long Answers", type: "Practice", practice: "Write exam-style answers", proof: "Submit answer practice" },
      { label: "Case-Based Practice", type: "Quiz", practice: "Attempt case/context questions", proof: "Submit case answers" },
      { label: "Revision Test", type: "Quiz", practice: "Take a short chapter test", proof: "Submit test score and corrections" }
    ],
    language: [
      { label: "Lesson Reading", type: "Read", practice: "Read the lesson and identify the main idea", proof: "Submit reading summary" },
      { label: "Vocabulary and Meanings", type: "Practice", practice: "Write meanings, synonyms, and important words", proof: "Submit vocabulary notes" },
      { label: "Grammar", type: "Practice", practice: "Practice grammar items linked to the lesson", proof: "Submit grammar practice" },
      { label: "Question Answers", type: "Practice", practice: "Write short and long answers", proof: "Submit answer practice" },
      { label: "Writing Practice", type: "Practice", practice: "Write paragraph, letter, or creative response", proof: "Submit writing work" },
      { label: "Revision Check", type: "Quiz", practice: "Revise lesson points and take a short quiz", proof: "Submit quiz score and corrections" }
    ],
    science: [
      { label: "Concept Foundation", type: "Read", practice: "Understand key concepts and terms", proof: "Submit concept notes" },
      { label: "Diagrams and Definitions", type: "Practice", practice: "Write definitions and draw diagrams where needed", proof: "Submit diagram/definition notes" },
      { label: "Textbook Questions", type: "Practice", practice: "Answer textbook questions", proof: "Submit answer practice" },
      { label: "Application Practice", type: "Quiz", practice: "Try application questions", proof: "Submit practice answers" },
      { label: "Revision Test", type: "Quiz", practice: "Take a short revision test", proof: "Submit test score and corrections" }
    ],
    general: [
      { label: "Core Ideas", type: "Read", practice: "Study core ideas from the selected topic", proof: "Submit notes" },
      { label: "Examples and Notes", type: "Practice", practice: "Work through examples and notes", proof: "Submit example work" },
      { label: "Practice Set", type: "Practice", practice: "Complete a short practice set", proof: "Submit practice answers" },
      { label: "Weak-Area Drill", type: "Quiz", practice: "Retry mistakes and unclear points", proof: "Submit corrections" },
      { label: "Final Check", type: "Quiz", practice: "Complete a final check", proof: "Submit score and corrections" }
    ]
  };
  return templates[kind] || templates.general;
}

function buildRoadmapTopicPlan(subjectName, chapter, academicTopics = []) {
  const readableTopics = academicTopics
    .map((item) => ({
      chapter: cleanAcademicText(item?.chapter || ""),
      topic: cleanAcademicText(item?.topic || ""),
      subtopics: Array.isArray(item?.subtopics) ? item.subtopics.map(cleanAcademicText).filter(Boolean).slice(0, 4) : [],
      verified: item?.verified !== false,
      message: cleanAcademicText(item?.message || "")
    }))
    .filter((item) => item.verified && item.topic && !hasBrokenPdfText(item.topic) && !hasBrokenPdfText(item.chapter));

  const pendingMessage = academicTopics.find((item) => item?.verified === false)?.message || "";
  const selectedChapter = cleanAcademicText(chapter || readableTopics[0]?.chapter || "");
  const template = roadmapMissionTemplate(subjectName);

  if (!readableTopics.length) {
    return {
      verified: false,
      pendingMessage: pendingMessage || "Verified textbook topics for this selection are still pending. Use the PDF in Resource Library and add proof as you study.",
      topics: [],
      missions: template.slice(0, 4).map((item, index) => ({
        title: selectedChapter ? `${selectedChapter}: ${item.label}` : `Topic data pending: ${item.label}`,
        topic: selectedChapter || "Verified topic data pending",
        template: item,
        subtopics: []
      }))
    };
  }

  const topics = readableTopics.slice(0, 6);
  const missions = template.slice(0, Math.min(6, Math.max(5, topics.length))).map((item, index) => {
    const topic = topics[index] || topics[topics.length - 1];
    const baseTopic = cleanAcademicText(topic?.topic || selectedChapter || item.label);
    const chapterPrefix = selectedChapter && !baseTopic.toLowerCase().includes(selectedChapter.toLowerCase())
      ? `${selectedChapter}: `
      : "";
    return {
      title: `${chapterPrefix}${item.label}`,
      topic: baseTopic,
      template: item,
      subtopics: topic?.subtopics || []
    };
  });

  return { verified: true, pendingMessage: "", topics, missions };
}

function findAcademicLessonPlan({ board, classLevel, subject, chapter }) {
  const classNumber = Number(String(classLevel || "").match(/\d+/)?.[0] || 10);
  try {
    const record = board ? getSubjectRecord(board, classNumber, subject) : getSubjectRecordForClass(classNumber, subject);
    const subjectRecord = record.subject || record;
    const chapters = Array.isArray(subjectRecord?.chapters) ? subjectRecord.chapters : [];
    const requested = String(chapter || "").trim().toLowerCase();
    const selectedChapter = chapters.find((item) => String(item?.chapter_name || "").trim().toLowerCase() === requested)
      || chapters.find((item) => String(item?.chapter_name || "").trim().toLowerCase().includes(requested) || requested.includes(String(item?.chapter_name || "").trim().toLowerCase()))
      || chapters[0];
    if (!selectedChapter) return null;
    const pdfs = getManualPdfsForClassSubject(classNumber, subject, board);
    const pageRefs = Array.isArray(selectedChapter.pages)
      ? selectedChapter.pages.slice(0, 12).map((page) => ({
          page: Number(page?.page || 0),
          preview: cleanAcademicText(page?.text || "").slice(0, 220),
          pdfUrl: pdfs[0]?.pdfUrl || ""
        })).filter((page) => page.page || page.preview)
      : [];
    const images = getAcademicImagesForContext({
      board,
      classNumber,
      subject,
      chapter: selectedChapter.chapter_name,
      pages: pageRefs.map((item) => item.page)
    });
    return {
      chapter: selectedChapter,
      classNumber,
      pdfUrl: pdfs[0]?.pdfUrl || "",
      weeklyPlan: Array.isArray(selectedChapter.weeklyPlan) && selectedChapter.weeklyPlan.length
        ? selectedChapter.weeklyPlan
        : buildFallbackWeeklyPlanFromChapter(selectedChapter, subject),
      lessonSections: Array.isArray(selectedChapter.lessonSections) ? selectedChapter.lessonSections : [],
      definitions: Array.isArray(selectedChapter.definitions) ? selectedChapter.definitions : [],
      diagrams: Array.isArray(selectedChapter.diagrams) ? selectedChapter.diagrams : [],
      images,
      activities: Array.isArray(selectedChapter.activities) ? selectedChapter.activities : [],
      textbookQuestions: Array.isArray(selectedChapter.textbookQuestions) ? selectedChapter.textbookQuestions : [],
      quizQuestions: Array.isArray(selectedChapter.quizQuestions) ? selectedChapter.quizQuestions : [],
      pageRefs
    };
  } catch {
    return null;
  }
}

function buildFallbackWeeklyPlanFromChapter(chapter = {}, subject = "Science") {
  const chapterName = cleanAcademicText(chapter?.chapter_name || "Selected Chapter");
  const sections = Array.isArray(chapter?.lessonSections) && chapter.lessonSections.length
    ? chapter.lessonSections
    : Array.isArray(chapter?.pages)
      ? chapter.pages.slice(0, 5).map((page, index) => ({
          id: `page-${page?.page || index + 1}`,
          title: `Textbook page ${page?.page || index + 1}`,
          summary: [cleanAcademicText(page?.text || "").slice(0, 240)].filter(Boolean)
        }))
      : [];
  const template = roadmapMissionTemplate(subject);
  return (sections.length ? sections : template.slice(0, 5)).slice(0, 7).map((section, index) => ({
    id: `week-${index + 1}`,
    title: cleanAcademicText(section?.title || `${chapterName}: ${template[index % template.length]?.label || "Study"}`),
    focus: cleanAcademicText(section?.summary?.[0] || template[index % template.length]?.practice || `Study ${chapterName}`),
    lessonSectionIds: section?.id ? [section.id] : []
  }));
}

function normalizePlannerTextList(items = [], limit = 6, maxLength = 220) {
  return (Array.isArray(items) ? items : [items])
    .map((item) => cleanAcademicText(typeof item === "string" ? item : item?.title || item?.summary || item?.body || ""))
    .filter((item) => item && item.length >= 8 && !hasBrokenPdfText(item))
    .filter((item, index, arr) => arr.findIndex((entry) => entry.toLowerCase() === item.toLowerCase()) === index)
    .slice(0, limit)
    .map((item) => item.slice(0, maxLength));
}

function normalizePlannerDefinitions(items = [], limit = 6) {
  return (Array.isArray(items) ? items : [])
    .map((item) => ({
      term: cleanAcademicText(item?.term || item?.title || ""),
      meaning: cleanAcademicText(item?.meaning || item?.definition || item?.body || "")
    }))
    .filter((item) => item.term.length >= 3 && item.meaning.length >= 8)
    .filter((item) => !/^(this|that|these|those|it)$/i.test(item.term))
    .filter((item) => !hasBrokenPdfText(`${item.term} ${item.meaning}`))
    .filter((item, index, arr) => arr.findIndex((entry) => entry.term.toLowerCase() === item.term.toLowerCase()) === index)
    .slice(0, limit);
}

function normalizePlannerDiagrams(items = [], limit = 5) {
  return (Array.isArray(items) ? items : [])
    .map((item) => ({
      title: cleanAcademicText(item?.title || item?.name || ""),
      whatToLearn: cleanAcademicText(item?.whatToLearn || item?.description || "Identify labels, process order, and textbook explanation."),
      page: item?.page ? Number(item.page) : undefined,
      imageUrl: String(item?.imageUrl || item?.url || "").trim(),
      pdfUrl: String(item?.pdfUrl || "").trim()
    }))
    .filter((item) => item.title.length >= 6 && !hasBrokenPdfText(item.title))
    .filter((item, index, arr) => arr.findIndex((entry) => entry.title.toLowerCase() === item.title.toLowerCase()) === index)
    .slice(0, limit);
}

function normalizePlannerImages(items = [], limit = 6) {
  return (Array.isArray(items) ? items : [])
    .map((item) => ({
      id: String(item?.id || item?.assetPath || item?.imageUrl || "").trim(),
      title: cleanAcademicText(item?.title || item?.caption || "Textbook image"),
      caption: cleanAcademicText(item?.caption || item?.whatToLearn || ""),
      page: Number(item?.page || 0),
      imageUrl: String(item?.imageUrl || item?.url || "").trim(),
      sourcePdf: String(item?.sourcePdf || "").trim()
    }))
    .filter((item) => item.imageUrl)
    .slice(0, limit);
}

function normalizePlannerPageRefs(items = [], limit = 5) {
  return (Array.isArray(items) ? items : [])
    .map((item) => ({
      page: Number(item?.page || 0),
      preview: cleanAcademicText(item?.preview || item?.text || "").slice(0, 220),
      pdfUrl: String(item?.pdfUrl || "").trim()
    }))
    .filter((item) => item.page || item.preview)
    .slice(0, limit);
}

function normalizePlannerQuiz(items = [], subject = "Science", chapter = "", limit = 4) {
  return (Array.isArray(items) ? items : [])
    .map((item, index) => normalizeRoadmapQuizQuestion(item, index, subject, chapter))
    .filter(Boolean)
    .slice(0, limit);
}

function buildPlannerWeekDetail({ week = {}, lessonPlan, subject, chapter, fallbackUnit }) {
  const chapterName = cleanAcademicText(lessonPlan?.chapter?.chapter_name || chapter || fallbackUnit?.chapter || "");
  const lessonSections = Array.isArray(lessonPlan?.lessonSections) ? lessonPlan.lessonSections : [];
  const ids = Array.isArray(week?.lessonSectionIds) ? week.lessonSectionIds.map((item) => String(item || "")) : [];
  const selectedSections = ids.length
    ? lessonSections.filter((section) => ids.includes(String(section?.id || "")))
    : lessonSections.filter((section) => {
        const title = cleanAcademicText(section?.title || "").toLowerCase();
        const weekTitle = cleanAcademicText(week?.title || fallbackUnit?.topic || "").toLowerCase();
        return title && weekTitle && (title.includes(weekTitle) || weekTitle.includes(title));
      });
  const sections = selectedSections.length ? selectedSections : lessonSections.slice(0, 1);
  const summary = normalizePlannerTextList(sections.flatMap((section) => section?.summary || []), 5, 260);
  const keyPoints = normalizePlannerTextList(sections.flatMap((section) => section?.keyPoints || []), 8, 260);
  const definitions = normalizePlannerDefinitions(lessonPlan?.definitions, 6);
  const diagrams = normalizePlannerDiagrams(lessonPlan?.diagrams, 5);
  const images = normalizePlannerImages(lessonPlan?.images, 6);
  const pageRefs = normalizePlannerPageRefs(lessonPlan?.pageRefs, 5);
  const activities = normalizePlannerTextList((lessonPlan?.activities || []).flatMap((item) => [item?.title, ...(Array.isArray(item?.steps) ? item.steps : [])]), 4, 220);
  const quizQuestions = normalizePlannerQuiz(lessonPlan?.quizQuestions, subject, chapterName, 4);

  if (!summary.length && !keyPoints.length) {
    const topic = cleanAcademicText(fallbackUnit?.topic || week?.title || chapterName || "selected topic");
    const subtopics = Array.isArray(fallbackUnit?.subtopics) ? fallbackUnit.subtopics.map(cleanAcademicText).filter(Boolean) : [];
    return {
      source: "topic_dataset",
      heading: topic,
      description: `${topic} is selected from the SSC Classes 6-10 extracted topic list. Full lesson explanation for this exact section is still pending, so use the textbook PDF while ORIN shows the verified topic path.`,
      summary: subtopics.length ? subtopics.slice(0, 5) : [`Study the ${topic} concept from the textbook PDF and write your own explanation.`],
      keyPoints: subtopics.slice(0, 8),
      definitions: [],
      diagrams: [],
      images,
      pageRefs,
      activities: [],
      practice: [
        `Write a 120-word explanation of ${topic}.`,
        `Solve textbook examples or questions connected to ${topic}.`,
        `Create short notes only for ${topic}, not the full subject.`
      ],
      quizQuestions: []
    };
  }

  const heading = cleanAcademicText(sections[0]?.title || week?.title || chapterName);
  return {
    source: "lesson_dataset",
    heading,
    description: summary.join(" "),
    summary,
    keyPoints,
    definitions,
    diagrams,
    images,
    pageRefs,
    activities,
    practice: [
      `Explain ${heading} in your own words using the points above.`,
      `Write textbook-style short answers from ${chapterName || heading}.`,
      diagrams.length ? `Draw or trace the diagram/process for ${diagrams[0].title}.` : `Create a one-page note for ${heading}.`,
      quizQuestions.length ? `Attempt the quiz after reading the full explanation.` : `Prepare 5 self-test questions from the key points.`
    ],
    quizQuestions
  };
}

function attachLessonDetailsToStudyPlan({ plan, lessonPlan, subject, chapter, academicTopics = [] }) {
  if (!plan || !Array.isArray(plan.weeks) || !lessonPlan) return plan;
  const weeklyPlan = Array.isArray(lessonPlan.weeklyPlan) ? lessonPlan.weeklyPlan : [];
  const nextWeeks = plan.weeks.map((week, index) => {
    const lessonWeek = weeklyPlan[index] || {};
    const fallbackUnit = academicTopics[index] || academicTopics[0] || {};
    const baseWeek = {
      ...week,
      title: cleanAcademicText(lessonWeek.title || week.title),
      focus: cleanAcademicText(lessonWeek.focus || week.focus),
      lessonSectionIds: Array.isArray(lessonWeek.lessonSectionIds) ? lessonWeek.lessonSectionIds : week.lessonSectionIds
    };
    return {
      ...baseWeek,
      detail: buildPlannerWeekDetail({
        week: baseWeek,
        lessonPlan,
        subject,
        chapter,
        fallbackUnit
      })
    };
  });

  return {
    ...plan,
    summary: `${plan.summary} Open each week to read the extracted lesson explanation, key points, definitions, diagrams, and practice for that exact topic.`,
    weeks: nextWeeks,
    dailyTasks: nextWeeks[0]?.tasks || plan.dailyTasks,
    adaptivePlan: {
      ...plan.adaptivePlan,
      updatedWeeks: Array.isArray(plan.adaptivePlan?.updatedWeeks)
        ? plan.adaptivePlan.updatedWeeks.map((week, index) => ({
            ...week,
            detail: nextWeeks[index]?.detail || week.detail
          }))
        : plan.adaptivePlan?.updatedWeeks || []
    }
  };
}

function buildLessonBackedStudyRoadmap({ subject, studyGoal, currentLevel, timePerDay, classLevel, chapter, lessonPlan }) {
  const subjectName = normalizeExamSubject(subject) || subject || "Biology";
  const chapterName = String(lessonPlan?.chapter?.chapter_name || chapter || "").trim();
  const steps = (lessonPlan?.weeklyPlan || []).map((week, index) => ({
    id: String(week.id || `week-${index + 1}`),
    stepNumber: index + 1,
    title: String(week.title || `Week ${index + 1}: ${chapterName}`).trim(),
    status: index === 0 ? "active" : "locked",
    completed: false,
    canStart: index === 0,
    canSubmitProof: false,
    proofRequired: false,
    proofStatus: "not_submitted",
    startedAt: null,
    completedAt: null,
    unlockedAt: index === 0 ? new Date() : null,
    missionType: "academic_lesson_week",
    focus: String(week.focus || "Read the lesson section and complete the quiz correctly.").trim(),
    outcome: "Complete this week by answering every quiz question correctly.",
    xpReward: 20,
    lessonSectionIds: Array.isArray(week.lessonSectionIds) ? week.lessonSectionIds : [],
    quizQuestions: [],
    tasks: [
      { id: `week-${index + 1}-learn`, type: "Read", title: "Study the lesson explanation and key points", duration: "20 min", completed: false },
      { id: `week-${index + 1}-notes`, type: "Practice", title: "Revise definitions, diagrams, and textbook notes", duration: "15 min", completed: false },
      { id: `week-${index + 1}-quiz`, type: "Quiz", title: "Answer all quiz questions correctly to complete", duration: "10 min", completed: false }
    ]
  }));

  return {
    title: `${subjectName} ${chapterName} Weekly Roadmap`,
    goal: `${subjectName}: ${studyGoal}`,
    subject: subjectName,
    classLevel,
    studyGoal,
    currentLevel,
    timePerDay,
    chapter: chapterName,
    summary: `A lesson-backed ${subjectName} roadmap for ${chapterName}. Open each week, study the actual textbook section, then complete the quiz with all correct answers.`,
    steps,
    progress: {
      completedSteps: 0,
      totalSteps: steps.length,
      progressPercent: 0,
      currentStepId: steps[0]?.id || "",
      lockHours: 0
    },
    certificatePrompt: `Complete every ${chapterName} week quiz to finish this academic roadmap.`,
    reminders: ["Open the week before attempting the quiz.", "Revise diagrams and definitions.", "All quiz answers must be correct to complete a week."]
  };
}

function normalizeRoadmapQuizQuestion(item = {}, index = 0, subject = "Science", chapter = "") {
  const options = Array.isArray(item?.options)
    ? item.options.map((option) => String(option || "").trim()).filter(Boolean).slice(0, 4)
    : [];
  const correct = String(item?.correct || "").trim();
  const question = String(item?.question || "").trim();
  if (options.length !== 4 || !correct || !options.includes(correct)) return null;
  if (question.length < 10) return null;
  if (/\bwhat is the correct meaning of ["']?(this|that|it|these|those)\b/i.test(question)) return null;
  if (/\bwhich key point is correct\b/i.test(question)) return null;
  if (options.some((option) => /\b(ignore all textbook examples|do not revise important terms|skip diagrams and notes|random app setting|unrelated shortcut|only the chapter name|grammar meanings|unrelated poems)\b/i.test(option))) return null;
  if (!hasRealPracticeOptions({ options, correct })) return null;
  return {
    id: String(item?.id || `roadmap-quiz-${index + 1}`).trim().slice(0, 80),
    question: question.slice(0, 280),
    options,
    correct,
    explanation: String(item?.explanation || "Review this concept and retry.").trim().slice(0, 260),
    subject: normalizeExamSubject(subject) || subject,
    chapter: cleanAcademicText(chapter || "")
  };
}

function normalizeQuizText(value = "") {
  return cleanAcademicText(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function uniquePushQuestion(rows, item) {
  const normalizedQuestion = normalizeQuizText(item?.question || "");
  if (!normalizedQuestion || rows.some((row) => normalizeQuizText(row.question) === normalizedQuestion)) return;
  const optionKey = Array.isArray(item?.options) ? item.options.map(normalizeQuizText).join("|") : "";
  if (optionKey && rows.some((row) => Array.isArray(row.options) && row.options.map(normalizeQuizText).join("|") === optionKey)) return;
  rows.push(item);
}

function plausibleDistractors(correct, candidates = [], fallback = []) {
  const correctText = cleanAcademicText(correct);
  const seen = new Set([normalizeQuizText(correctText)]);
  const options = [correctText];
  for (const candidate of [...candidates, ...fallback]) {
    const text = cleanAcademicText(candidate);
    const key = normalizeQuizText(text);
    if (!text || text.length < 2 || seen.has(key)) continue;
    seen.add(key);
    options.push(text.slice(0, 140));
    if (options.length === 4) break;
  }
  return options.length === 4 ? options : [];
}

function buildMathConceptQuestions({ chapterName, keyPoints, definitions, questionCount }) {
  const rows = [];
  const lowerChapter = chapterName.toLowerCase();
  const realNumberHints = /\breal\s+numbers?\b/i.test(chapterName) || keyPoints.some((point) => /\b(euclid|hcf|irrational|decimal|prime|fundamental theorem|division algorithm)\b/i.test(point));
  const templates = realNumberHints
    ? [
        {
          question: "Which method is used to find the HCF of two positive integers efficiently?",
          options: ["Euclid's division algorithm", "Drawing a bar graph", "Counting only odd numbers", "Changing fractions to percentages"],
          correct: "Euclid's division algorithm",
          explanation: "Real Numbers uses Euclid's division algorithm to find HCF through repeated division."
        },
        {
          question: "In Euclid's division lemma, for positive integers a and b, the relation is...",
          options: ["a = bq + r, where 0 <= r < b", "a = b + q + r, where r > b", "a = bq - r, where r is always negative", "a = q/r, where b is zero"],
          correct: "a = bq + r, where 0 <= r < b",
          explanation: "Euclid's division lemma states a = bq + r with remainder r less than divisor b."
        },
        {
          question: "A number whose decimal expansion is non-terminating and non-recurring is...",
          options: ["Irrational", "A natural number only", "Always an integer", "A terminating decimal"],
          correct: "Irrational",
          explanation: "Irrational numbers have decimal expansions that neither terminate nor repeat."
        },
        {
          question: "The Fundamental Theorem of Arithmetic says every composite number can be expressed as...",
          options: ["A product of primes in a unique way", "A sum of equal fractions only", "A decimal with two digits only", "A square root of an integer only"],
          correct: "A product of primes in a unique way",
          explanation: "Every composite number has a unique prime factorisation, apart from order."
        },
        {
          question: "If HCF(a, b) = 1, then a and b are called...",
          options: ["Co-prime numbers", "Even numbers", "Irrational numbers", "Composite-only numbers"],
          correct: "Co-prime numbers",
          explanation: "Two numbers with HCF 1 are co-prime."
        },
        {
          question: "For any positive odd integer n, division by 6 can leave which possible odd remainders?",
          options: ["1, 3, or 5", "0, 2, or 4", "Only 6", "Only 0"],
          correct: "1, 3, or 5",
          explanation: "Odd integers divided by 6 can be represented using remainders 1, 3, or 5."
        }
      ]
    : [];

  templates.forEach((item) => uniquePushQuestion(rows, item));

  definitions.forEach((item) => {
    if (rows.length >= questionCount) return;
    const options = plausibleDistractors(item.meaning, definitions.map((entry) => entry.meaning), [
      "A geometry construction property",
      "A probability outcome",
      "A graph scale"
    ]);
    if (!options.length) return;
    uniquePushQuestion(rows, {
      question: `In ${chapterName}, what does ${item.term} mean?`,
      options,
      correct: item.meaning,
      explanation: `${item.term}: ${item.meaning}`
    });
  });

  keyPoints.forEach((point) => {
    if (rows.length >= questionCount) return;
    const shortPoint = point.replace(/\s+/g, " ").slice(0, 140);
    const options = plausibleDistractors(shortPoint, keyPoints, [
      "Use a geometry construction property",
      "Apply a probability outcome",
      "Draw a graph scale"
    ]);
    if (!options.length) return;
    uniquePushQuestion(rows, {
      question: `Which statement belongs to ${chapterName}${lowerChapter.includes("real") ? " - Real Numbers" : ""}?`,
      options,
      correct: shortPoint,
      explanation: "This statement is from the selected Mathematics chapter context."
    });
  });

  return rows;
}

function buildScienceConceptQuestions({ chapterName, keyPoints, definitions, questionCount }) {
  const rows = [];
  definitions.forEach((item) => {
    if (rows.length >= questionCount) return;
    const options = plausibleDistractors(item.meaning, definitions.map((entry) => entry.meaning), [
      "A mathematical theorem",
      "A poetry device",
      "A map scale"
    ]);
    if (!options.length) return;
    uniquePushQuestion(rows, {
      question: `What is ${item.term} in ${chapterName}?`,
      options,
      correct: item.meaning,
      explanation: `${item.term} is explained in this chapter as: ${item.meaning}`
    });
  });
  keyPoints.forEach((point) => {
    if (rows.length >= questionCount) return;
    const options = plausibleDistractors(point, keyPoints, ["A banking process", "A grammar rule", "A geometric construction"]);
    if (!options.length) return;
    uniquePushQuestion(rows, {
      question: `Which concept is correctly linked with ${chapterName}?`,
      options,
      correct: point,
      explanation: "The correct option is grounded in the selected Science chapter."
    });
  });
  return rows;
}

function normalizeTextbookQuestionRows(items = [], limit = 24) {
  return (Array.isArray(items) ? items : [])
    .map((item) => cleanAcademicText(typeof item === "string" ? item : item?.question || item?.text || ""))
    .filter((item) => item.length >= 18 && !hasBrokenPdfText(item))
    .filter((item, index, arr) => arr.findIndex((entry) => normalizeQuizText(entry) === normalizeQuizText(item)) === index)
    .slice(0, limit);
}

function buildTextbookPracticeQuestions({ subject, chapterName, textbookQuestions, keyPoints, questionCount }) {
  const rows = [];
  const subjectKind = roadmapSubjectKind(subject);
  const questions = normalizeTextbookQuestionRows(textbookQuestions, 32);
  const anchors = [...questions, ...keyPoints].filter(Boolean);
  questions.forEach((questionText, index) => {
    if (rows.length >= questionCount) return;
    const correct = questionText.slice(0, 140);
    const options = plausibleDistractors(correct, anchors, [
      `${chapterName}: revise the textbook example first`,
      `${chapterName}: solve using the given formula or concept`,
      `${chapterName}: write the answer with steps`
    ]);
    if (!options.length) return;
    const stem = subjectKind === "mathematics"
      ? `Which textbook problem from ${chapterName} should be solved with steps?`
      : subjectKind === "language"
        ? `Which textbook question belongs to ${chapterName}?`
        : `Which textbook question is from ${chapterName}?`;
    uniquePushQuestion(rows, {
      question: `${stem} (${index + 1})`,
      options,
      correct,
      explanation: subjectKind === "mathematics"
        ? "This is an extracted textbook Maths problem. Solve it step by step using formulas, equations, or examples from the chapter."
        : "This question was extracted from the selected textbook chapter."
    });
  });
  return rows;
}

function buildDeterministicRoadmapQuizQuestions({ subject, chapter, lessonPlan, questionCount = 12 }) {
  const normalizedSubject = normalizeExamSubject(subject) || subject || "Science";
  const chapterName = cleanAcademicText(chapter || lessonPlan?.chapter?.chapter_name || "Core Chapter");
  const keyPoints = Array.isArray(lessonPlan?.lessonSections)
    ? lessonPlan.lessonSections
        .flatMap((section) => Array.isArray(section?.keyPoints) ? section.keyPoints : [])
        .map((item) => cleanAcademicText(item))
        .filter((item) => isUsefulKeyPoint(item))
    : [];
  const definitions = Array.isArray(lessonPlan?.chapter?.definitions)
    ? lessonPlan.chapter.definitions
        .map((item) => ({ term: cleanAcademicText(item?.term || ""), meaning: cleanAcademicText(item?.meaning || "") }))
        .filter((item) => isUsefulDefinitionEntry(item.term, item.meaning))
    : [];
  const textbookQuestions = Array.isArray(lessonPlan?.chapter?.textbookQuestions)
    ? lessonPlan.chapter.textbookQuestions
    : Array.isArray(lessonPlan?.textbookQuestions) ? lessonPlan.textbookQuestions : [];
  const subjectKey = String(normalizedSubject).toLowerCase();
  const generated = [];

  buildTextbookPracticeQuestions({ subject: normalizedSubject, chapterName, textbookQuestions, keyPoints, questionCount: Math.min(questionCount, 8) })
    .forEach((item) => uniquePushQuestion(generated, item));

  const subjectQuestions = subjectKey.includes("math")
    ? buildMathConceptQuestions({ chapterName, keyPoints, definitions, questionCount })
    : buildScienceConceptQuestions({ chapterName, keyPoints, definitions, questionCount });
  subjectQuestions.forEach((item) => uniquePushQuestion(generated, item));

  if (generated.length < questionCount && subjectKey.includes("math")) {
    buildDeterministicTopicQuestions("Mathematics", chapterName.toLowerCase().includes("real") ? "Numbers" : chapterName, questionCount - generated.length)
      .forEach((item) => uniquePushQuestion(generated, item));
  } else if (generated.length < questionCount && (subjectKey.includes("science") || subjectKey.includes("bio") || subjectKey.includes("physics") || subjectKey.includes("chem"))) {
    buildDeterministicTopicQuestions("Science", chapterName, questionCount - generated.length)
      .forEach((item) => uniquePushQuestion(generated, item));
  }

  return generated
    .map((item, index) => normalizeRoadmapQuizQuestion(item, index, normalizedSubject, chapterName))
    .filter(Boolean)
    .slice(0, questionCount);
}

async function buildAiRoadmapQuizQuestions({ subject, classLevel, board, chapter, lessonPlan, questionCount = 12 }) {
  const chapterName = cleanAcademicText(chapter || lessonPlan?.chapter?.chapter_name || "");
  const sectionTitles = Array.isArray(lessonPlan?.lessonSections)
    ? lessonPlan.lessonSections.map((item) => cleanAcademicText(item?.title || "")).filter(Boolean).slice(0, 12)
    : [];
  const keyPoints = Array.isArray(lessonPlan?.lessonSections)
    ? lessonPlan.lessonSections.flatMap((section) => Array.isArray(section?.keyPoints) ? section.keyPoints : []).map((item) => cleanAcademicText(item)).filter(Boolean).slice(0, 24)
    : [];
  const definitions = Array.isArray(lessonPlan?.chapter?.definitions)
    ? lessonPlan.chapter.definitions.map((item) => `${cleanAcademicText(item?.term || "")}: ${cleanAcademicText(item?.meaning || "")}`).filter(Boolean).slice(0, 24)
    : [];

  const prompt = [
    "Generate a high-school chapter quiz with only textbook-grounded MCQs.",
    "Return JSON only in this shape:",
    '{"questions":[{"id":"q1","question":"question text","options":["opt1","opt2","opt3","opt4"],"correct":"exact option text","explanation":"short reason"}]}',
    `Board: ${board}.`,
    `Class: ${classLevel}.`,
    `Subject: ${subject}.`,
    `Chapter: ${chapterName || "Selected chapter"}.`,
    `Section titles: ${sectionTitles.join("; ") || "Not available"}.`,
    `Definitions: ${definitions.join("; ") || "Not available"}.`,
    `Key points: ${keyPoints.join("; ") || "Not available"}.`,
    `Create exactly ${questionCount} multiple-choice questions.`,
    "Rules: no placeholders, no random app text, no unrelated options, one clear correct answer that exactly matches one option, concise explanation."
  ].join("\n");

  const ai = await requestAiResponse({
    role: "student",
    message: prompt,
    context: {
      assistantMode: HIGH_SCHOOL_JSON_MODE,
      feature: "highschool_roadmap_week_quiz",
      expectedFormat: "json",
      learnerStage: "highschool"
    }
  });
  const parsed = safeJsonParse(ai.answer);
  const normalized = Array.isArray(parsed?.questions)
    ? parsed.questions.map((item, index) => normalizeRoadmapQuizQuestion(item, index, subject, chapterName)).filter(Boolean)
    : [];
  return normalized.slice(0, questionCount);
}

function roadmapTopicsForSubject(subjectName, chapter, academicTopics = []) {
  const datasetTopics = buildRoadmapTopicPlan(subjectName, chapter, academicTopics).missions
    .map((item) => cleanAcademicText(item?.topic || item?.title || ""))
    .filter(Boolean)
    .slice(0, 5);
  if (datasetTopics.length) return datasetTopics;

  const subjectKey = String(subjectName || "").toLowerCase();
  if (chapter) {
    if (subjectKey.includes("math")) return [`${chapter}: Formula Map`, "Solved Examples", "Practice Set", "Weak Area Drill", "Final Check"];
    if (subjectKey.includes("social")) return [`${chapter}: Key Events`, "Maps / Terms / Dates", "Short Answers", "Case-Based Practice", "Final Check"];
    if (subjectKey.includes("telugu")) return [`${chapter}: Reading`, "Meanings & Vocabulary", "Question Answers", "Grammar / Writing", "Final Check"];
    if (subjectKey.includes("science") || subjectKey.includes("physics") || subjectKey.includes("chem") || subjectKey.includes("bio")) {
      return [`${chapter}: Concepts`, "Diagrams & Definitions", "Textbook Questions", "Application Practice", "Final Check"];
    }
    return [`${chapter}: Core Ideas`, "Examples & Notes", "Practice Set", "Weak Area Drill", "Final Check"];
  }

  if (subjectKey.includes("math")) return ["Formula Basics", "Solved Examples", "Exercise Practice", "Weak Area Drill", "Revision Test"];
  if (subjectKey.includes("social")) return ["Chapter Reading", "Key Terms & Dates", "Map/Timeline Practice", "Short Answers", "Revision Test"];
  if (subjectKey.includes("telugu")) return ["Lesson Reading", "Meanings & Vocabulary", "Question Answers", "Grammar/Writing", "Revision Test"];
  if (subjectKey.includes("science") || subjectKey.includes("physics") || subjectKey.includes("chem") || subjectKey.includes("bio")) {
    return ["Concept Clarity", "Diagrams & Definitions", "Textbook Questions", "Experiment/Application", "Revision Test"];
  }
  if (subjectKey.includes("english") || subjectKey.includes("hindi")) return ["Reading", "Vocabulary", "Grammar", "Writing Practice", "Revision Test"];
  return ["Core Concepts", "Examples & Notes", "Practice Set", "Weak Area Drill", "Final Check"];
}

function buildFallbackHighSchoolStudyRoadmap({ subject, studyGoal, currentLevel, timePerDay, classLevel, chapter = "", academicTopics = [] }) {
  const subjectName = normalizeExamSubject(subject) || "Mathematics";
  const topicPlan = buildRoadmapTopicPlan(subjectName, chapter, academicTopics);
  const missions = topicPlan.missions.length
    ? topicPlan.missions
    : roadmapTopicsForSubject(subjectName, chapter, academicTopics).map((topic) => ({
      title: topic,
      topic,
      template: roadmapMissionTemplate(subjectName)[0],
      subtopics: []
    }));
  const minutes = String(timePerDay || "").includes("2") ? 35 : String(timePerDay || "").includes("3") ? 45 : 25;
  const steps = missions.map((mission, index) => ({
    id: `hs-${subjectName.toLowerCase()}-${index + 1}`,
    stepNumber: index + 1,
    title: mission.title,
    status: index === 0 ? "active" : "locked",
    completed: false,
    canStart: index === 0,
    canSubmitProof: false,
    proofRequired: true,
    proofStatus: "not_submitted",
    startedAt: null,
    completedAt: null,
    unlockedAt: index === 0 ? new Date() : null,
    missionType: index === missions.length - 1 ? "revision_test" : "learning_mission",
    focus: topicPlan.verified
      ? `${mission.template.practice} for ${mission.topic}.`
      : topicPlan.pendingMessage,
    outcome: index === missions.length - 1
      ? `Prove readiness in ${mission.topic} with a revision check.`
      : `Show clear progress in ${mission.topic}.`,
    xpReward: 20,
    tasks: [
      {
        id: `w${index + 1}-read`,
        type: mission.template.type || "Read",
        title: topicPlan.verified ? `${mission.template.label}: ${mission.topic}` : "Open the PDF/resource and study the selected topic",
        duration: `${Math.max(10, minutes - 10)} min`,
        completed: index === 0
      },
      {
        id: `w${index + 1}-practice`,
        type: "Practice",
        title: mission.subtopics.length ? `Practice: ${mission.subtopics.slice(0, 2).join(", ")}` : mission.template.practice,
        duration: "15 min",
        completed: false
      },
      { id: `w${index + 1}-proof`, type: "Proof", title: mission.template.proof, duration: "5 min", completed: false }
    ]
  }));

  return {
    title: `${subjectName} Academic Mission Roadmap`,
    goal: `${subjectName}: ${studyGoal}`,
    subject: subjectName,
    classLevel,
    studyGoal,
    currentLevel,
    timePerDay,
    summary: topicPlan.verified
      ? `A dataset-grounded ${subjectName} roadmap for ${cleanAcademicText(chapter) || "selected textbook topics"}. Start each mission, complete the work, submit proof, and unlock the next milestone.`
      : `${topicPlan.pendingMessage} This roadmap keeps the mission flow ready without inventing textbook topics.`,
    steps,
    progress: {
      completedSteps: 0,
      totalSteps: steps.length,
      progressPercent: 0,
      currentStepId: steps[0]?.id || "",
      lockHours: 0
    },
    certificatePrompt: `Complete all ${subjectName} missions to unlock a school achievement prompt.`,
    reminders: ["Start one mission at a time.", "Submit a short proof note or screenshot.", "Review wrong answers before unlocking the next mission."]
  };
}

function buildFallbackHighSchoolStudyAssistant({ question, subject, answerStyle, classLevel, assistantMode = "academic" }) {
  const cleanQuestion = String(question || "Explain photosynthesis").trim().slice(0, 180);
  const subjectName = normalizeExamSubject(subject) || "Science";
  const style = ["simple", "steps", "exam"].includes(String(answerStyle || "").toLowerCase())
    ? String(answerStyle).toLowerCase()
    : "simple";
  if (assistantMode === "general") {
    const title = cleanQuestion.replace(/[?.!]+$/, "") || "General Help";
    return {
      title,
      subject: "General",
      classLevel,
      answerStyle: "simple",
      summary: `Here is a clear answer for: ${title}.`,
      simpleAnswer: `I can help with that. ${title.length < 8 ? "Tell me a little more so I can give a better answer." : `For "${title}", start by understanding the main idea, then ask for examples or steps if you want a deeper answer.`}`,
      stepByStep: ["Identify what you want to know.", "Break it into one clear question.", "Ask for an example if the answer feels unclear."],
      examAnswer: `For a short answer, write the main idea first, add one supporting point, and end with a clear conclusion.`,
      keyPoints: ["Ask anything in normal language.", "Use Academic mode for subject-wise exam answers.", "Use follow-up questions to go deeper."],
      notes: [
        { title: "General Mode", body: "Use this for normal questions, explanations, planning, ideas, and everyday help." },
        { title: "Academic Mode", body: "Switch to Academic when you need school-style answers, steps, notes, and practice." }
      ],
      practiceQuestions: [
        {
          id: "general-1",
          question: "Which mode is best for exam-style school answers?",
          options: ["Academic", "General", "Settings", "Posts"],
          correct: "Academic",
          explanation: "Academic mode gives subject, steps, exam answer, notes, and practice."
        }
      ],
      dashboardTools: ["General Q&A", "Academic Mode", "Follow-up Questions"],
      progress: { questions: 0, accuracy: 0, streakDays: 0, strongTopics: ["Asking Questions"], weakTopics: ["Add more detail for better answers"] }
    };
  }
  const isPhotosynthesis = /photosynthesis/i.test(cleanQuestion);
  const title = isPhotosynthesis ? "Photosynthesis" : cleanQuestion.replace(/[?.!]+$/, "");
  const summary = isPhotosynthesis
    ? "Photosynthesis is the process by which green plants make food using sunlight, carbon dioxide, and water."
    : `Here is a clear ${subjectName} explanation for: ${title}.`;
  const steps = isPhotosynthesis
    ? [
        "Leaves take in sunlight.",
        "Roots absorb water.",
        "Leaves take in carbon dioxide from the air.",
        "Sunlight energy is trapped by chlorophyll.",
        "Water and carbon dioxide are converted into glucose.",
        "Oxygen is released into the air."
      ]
    : [
        "Understand the main concept first.",
        "Break the topic into smaller points.",
        "Connect each point with one example.",
        "Revise the important terms.",
        "Practice one related question."
      ];
  const examAnswer = isPhotosynthesis
    ? "Photosynthesis is the process in which green plants prepare their own food using carbon dioxide and water in the presence of sunlight and chlorophyll. Glucose is formed and oxygen is released as a by-product."
    : `${title} can be explained by writing the definition, key points, one example, and a short conclusion.`;

  return {
    title,
    subject: subjectName,
    classLevel,
    answerStyle: style,
    summary,
    simpleAnswer: summary,
    stepByStep: steps,
    examAnswer,
    keyPoints: isPhotosynthesis
      ? ["Plants need sunlight, water, and carbon dioxide.", "Chlorophyll helps capture sunlight.", "Glucose is food for the plant.", "Oxygen is released."]
      : ["Learn the definition.", "Remember important terms.", "Practice with examples.", "Review mistakes."],
    notes: [
      { title: "Short Notes", body: isPhotosynthesis ? "Formula: carbon dioxide + water + sunlight -> glucose + oxygen." : "Write 3-4 short points and one example." },
      { title: "Mind Map", body: "Definition -> process -> key terms -> example -> practice." },
      { title: "Important Diagram", body: isPhotosynthesis ? "Draw leaf, sunlight, carbon dioxide, water, glucose, and oxygen arrows." : "Use a small labelled concept diagram if possible." }
    ],
    practiceQuestions: [
      {
        id: "practice-1",
        question: isPhotosynthesis ? "Which gas is released during photosynthesis?" : `What is the main idea of ${title}?`,
        options: isPhotosynthesis ? ["Oxygen", "Carbon dioxide", "Nitrogen", "Hydrogen"] : ["Definition", "Unrelated fact", "Random date", "No answer"],
        correct: isPhotosynthesis ? "Oxygen" : "Definition",
        explanation: isPhotosynthesis ? "Oxygen is released as a by-product of photosynthesis." : "Start with the definition or main idea."
      },
      {
        id: "practice-2",
        question: isPhotosynthesis ? "Which pigment helps plants capture sunlight?" : "What should you do after learning a concept?",
        options: isPhotosynthesis ? ["Chlorophyll", "Hemoglobin", "Melanin", "Keratin"] : ["Practice questions", "Forget it", "Skip notes", "Avoid revision"],
        correct: isPhotosynthesis ? "Chlorophyll" : "Practice questions",
        explanation: isPhotosynthesis ? "Chlorophyll is the green pigment in leaves." : "Practice helps check understanding."
      }
    ],
    dashboardTools: ["Short Notes", "Mind Maps", "Practice Questions", "Important Diagrams", "Previous Year Questions"],
    progress: {
      questions: 120,
      accuracy: 85,
      streakDays: 7,
      strongTopics: [title, "Cell Structure", "Human Digestive System"],
      weakTopics: ["Plant Hormones", "Respiration in Plants"]
    }
  };
}

function buildFallbackHighSchoolStudyPlanner({ subject, goal, skills, currentLevel, timePerDay, classLevel, academicTopics = [] }) {
  const subjectName = normalizeExamSubject(subject) || "Science";
  const skillList = String(skills || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 6);

  const topicUnits = Array.isArray(academicTopics)
    ? academicTopics
        .map((item) => {
          const chapter = String(item?.chapter || "").trim();
          const topic = String(item?.topic || "").trim();
          const subtopics = Array.isArray(item?.subtopics)
            ? item.subtopics.map((entry) => String(entry || "").trim()).filter(Boolean).slice(0, 3)
            : [];
          if (!chapter && !topic) return null;
          return {
            chapter: chapter || topic,
            topic: topic || chapter,
            subtopics
          };
        })
        .filter(Boolean)
    : [];

  const selectedUnits = topicUnits.slice(0, 5);
  const fallbackUnits = skillList.length
    ? skillList.slice(0, 5).map((item) => ({ chapter: item, topic: item, subtopics: [] }))
    : [
        { chapter: `${subjectName} Foundations`, topic: `${subjectName} Core Concepts`, subtopics: [] },
        { chapter: `${subjectName} Practice`, topic: `${subjectName} Problem Solving`, subtopics: [] },
        { chapter: `${subjectName} Revision`, topic: `${subjectName} Key Questions`, subtopics: [] }
      ];

  const planUnits = selectedUnits.length ? selectedUnits : fallbackUnits;

  const weeks = planUnits.map((unit, index) => {
    const subtopicText = unit.subtopics.length ? unit.subtopics.join(", ") : "key textbook concepts";
    return {
      id: `week-${index + 1}`,
      week: `Week ${index + 1}`,
      title: `${unit.chapter}: ${unit.topic}`,
      status: index === 0 ? "active" : "locked",
      progress: index === 0 ? 20 : 0,
      focus:
        index === 0
          ? `Cover ${unit.topic} with textbook concepts and targeted practice.`
          : `Unlock after completing Week ${index}. Focus: ${unit.topic}.`,
      tasks: [
        {
          id: `w${index + 1}-concept`,
          type: "Learn",
          title: `Learn ${unit.topic} (${subtopicText})`,
          duration: "25 min",
          completed: false
        },
        {
          id: `w${index + 1}-examples`,
          type: "Practice",
          title: `Solve worked examples from ${unit.chapter}`,
          duration: "20 min",
          completed: false
        },
        {
          id: `w${index + 1}-mcq`,
          type: "Quiz",
          title: `Topic quiz on ${unit.topic} (12 MCQs)`,
          duration: "15 min",
          completed: false
        },
        {
          id: `w${index + 1}-revision`,
          type: "Revise",
          title: `Create short notes for ${unit.topic}`,
          duration: "15 min",
          completed: false
        }
      ]
    };
  });

  return {
    title: `${subjectName} Study Plan`,
    subject: subjectName,
    goal,
    classLevel,
    currentLevel,
    timePerDay,
    summary: `Topic-oriented SSC plan for ${subjectName}: ${goal}. Each week is mapped to extracted chapter-topic data and quiz practice.`,
    overallProgress: 20,
    weeks,
    dailyTasks: weeks[0].tasks,
    analytics: [
      { label: "Topic Coverage", percent: 20 },
      { label: "Practice Accuracy", percent: 0 },
      { label: "MCQ Completion", percent: 0 }
    ],
    adaptivePlan: {
      newFocus: weeks[1]?.title || weeks[0].title,
      reason: "Auto-prioritized next topic using completion and quiz performance.",
      updatedWeeks: weeks.map((week, index) => ({
        ...week,
        status: index === 0 ? "completed" : index === 1 ? "active" : week.status
      }))
    },
    reminders: [
      "Complete all topic tasks before unlocking the next week.",
      "Attempt 12 MCQs after each topic block.",
      "Revise wrong answers with chapter notes on the same day."
    ]
  };
}

function buildFallbackHighSchoolCareerExplorer({ interest, strengths, classLevel }) {
  const selectedInterest = String(interest || "Science").trim() || "Science";
  const strengthList = String(strengths || "biology, problem solving, helping people")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 6);
  const categoryMap = {
    Science: [
      { title: "Doctor", field: "Healthcare & Medical", subjects: ["Biology", "Chemistry", "Physics"], skills: ["Focus", "Empathy", "Decision Making"], nextStep: "Build Biology and Chemistry basics, then explore NEET path.", futureScope: "Hospitals, research, public health, and specialist medicine.", fitScore: 92, salaryRange: "High growth" },
      { title: "Scientist", field: "Research & Development", subjects: ["Science", "Maths"], skills: ["Curiosity", "Analysis", "Patience"], nextStep: "Start with science projects and research reading.", futureScope: "Labs, universities, space, climate, biotech, and innovation teams.", fitScore: 84, salaryRange: "Steady growth" },
      { title: "Biotechnologist", field: "Biotech & Research", subjects: ["Biology", "Chemistry"], skills: ["Lab thinking", "Observation", "Data"], nextStep: "Explore genetics, cells, and simple lab concepts.", futureScope: "Biotech companies, agriculture, healthcare, and research.", fitScore: 80, salaryRange: "Growing field" }
    ],
    Commerce: [
      { title: "Chartered Accountant", field: "Finance & Audit", subjects: ["Accountancy", "Economics", "Maths"], skills: ["Accuracy", "Discipline", "Analysis"], nextStep: "Learn CA Foundation subjects and daily accounting basics.", futureScope: "Audit, taxation, finance, consulting, and business advisory.", fitScore: 88, salaryRange: "High growth" },
      { title: "Business Manager", field: "Management", subjects: ["Business Studies", "Economics"], skills: ["Leadership", "Communication", "Planning"], nextStep: "Build leadership projects and business case practice.", futureScope: "Startups, companies, operations, and entrepreneurship.", fitScore: 82, salaryRange: "High growth" }
    ],
    Arts: [
      { title: "Lawyer", field: "Law & Judiciary", subjects: ["Political Science", "English", "History"], skills: ["Reasoning", "Writing", "Speaking"], nextStep: "Explore CLAT basics and read current affairs.", futureScope: "Courts, policy, corporate law, and civil services.", fitScore: 86, salaryRange: "High growth" },
      { title: "Designer", field: "Design & Creative", subjects: ["Fine Arts", "English"], skills: ["Creativity", "Observation", "Portfolio"], nextStep: "Build a small design portfolio and sketch daily.", futureScope: "Product, fashion, media, UI/UX, and branding.", fitScore: 80, salaryRange: "Creative growth" }
    ],
    Tech: [
      { title: "Software Engineer", field: "Technology", subjects: ["Computer Science", "Maths"], skills: ["Coding", "Logic", "Problem Solving"], nextStep: "Start Python or web basics and build small apps.", futureScope: "Apps, AI products, cloud systems, and startups.", fitScore: 90, salaryRange: "High growth" },
      { title: "AI Specialist", field: "AI & Data Science", subjects: ["Maths", "Computer Science"], skills: ["Math thinking", "Coding", "Data"], nextStep: "Learn Python, statistics basics, and AI tools.", futureScope: "Automation, data products, research, and AI engineering.", fitScore: 87, salaryRange: "Very high growth" }
    ]
  };
  const careers = categoryMap[selectedInterest] || categoryMap.Science;
  const featured = careers[0];
  return {
    greeting: "Hi, Student!",
    interest: selectedInterest,
    classLevel,
    summary: `AI matched ${selectedInterest} careers using your strengths: ${strengthList.join(", ") || "school interests"}.`,
    categories: ["Science", "Commerce", "Arts", "Tech", "Law", "Design", "Defense", "Other"],
    careers,
    featuredCareer: {
      ...featured,
      overview: `${featured.title} fits students who enjoy ${featured.subjects.slice(0, 2).join(" and ")} and want a ${featured.field.toLowerCase()} path.`,
      workEnvironment: "Dynamic",
      jobSatisfaction: "Very high",
      futureScope: featured.futureScope,
      roadmap: [
        "10th Standard: focus on science subjects and fundamentals.",
        "11th-12th: choose relevant stream and build subject depth.",
        "Entrance Exam: prepare for required exams or portfolio path.",
        "Degree: complete the relevant college program.",
        "Internship: gain practical exposure.",
        "Specialization: choose your focused career area.",
        "Build Career: apply, learn, and grow."
      ],
      skillRatings: featured.skills.map((skill, index) => ({ skill, level: index === 0 ? "High" : index === 1 ? "High" : "Medium", percent: index === 0 ? 88 : index === 1 ? 82 : 68 }))
    },
    compare: careers.slice(0, 2).map((career) => ({
      title: career.title,
      factor: career.field,
      salary: career.salaryRange,
      growth: career.fitScore >= 85 ? "High" : "Medium",
      satisfaction: career.fitScore >= 85 ? "Very high" : "High",
      workLifeBalance: career.title === "Doctor" ? "Medium" : "Good"
    })),
    savedCareers: careers.slice(0, 3).map((career) => ({ title: career.title, field: career.field })),
    progress: {
      profileCompletion: 72,
      completed: ["Interest Areas", "Skills Assessment", "Career Shortlist"],
      pending: ["Study Preferences", "Career Roadmap"]
    },
    assistantPrompts: [
      "What should I do after 10th in this career?",
      "Which subjects are most important?",
      "Compare top two careers for me."
    ],
    subjectsCovered: ["Physics", "Chemistry", "Biology", "Maths", "Accountancy", "Economics", "Computer Science", "English", "History", "Political Science", "Psychology"]
  };
}

function buildFallbackHighSchoolSchoolProjects({ subject, chapter, goal, classLevel, difficulty }) {
  const subjectName = normalizeExamSubject(subject) || "Science";
  const focus = String(chapter || goal || "Core Concepts").trim();
  const level = String(difficulty || "Medium").trim();
  const base = [
    {
      title: `${focus} Working Model`,
      type: "Model",
      why: `Helps you understand ${focus} with a visible school-friendly demonstration.`,
      materials: ["Notebook", "Chart paper", "Basic household materials", "Phone camera for proof"],
      steps: ["Read the textbook concept", "Sketch the model idea", "Build a simple version", "Explain it in 5 lines", "Submit photo/proof"],
      outcome: `You can explain ${focus} clearly with a simple model.`
    },
    {
      title: `${focus} Observation Journal`,
      type: "Research",
      why: `Builds exam-ready understanding by connecting ${subjectName} with real examples.`,
      materials: ["Notebook", "Textbook", "Internet/reference book if allowed"],
      steps: ["Pick 3 examples", "Write observations", "Add diagram/table", "Write conclusion", "Submit notes/proof"],
      outcome: `You can identify examples and explain ${focus} in your own words.`
    },
    {
      title: `${focus} Practice Presentation`,
      type: "Presentation",
      why: "Improves concept clarity, confidence, and answer-writing structure.",
      materials: ["Slides/chart", "Textbook notes", "Practice questions"],
      steps: ["Create 5 key points", "Add one diagram", "Add two questions", "Practice speaking", "Submit summary/proof"],
      outcome: "You can present the chapter topic with examples and keywords."
    }
  ];

  return {
    title: `${subjectName} School Projects`,
    classLevel,
    subject: subjectName,
    chapter: focus,
    goal,
    difficulty: level,
    summary: `Project ideas for Class ${classLevel} ${subjectName}, focused on ${focus}.`,
    projects: base.map((item, index) => ({
      id: `school-project-${index + 1}`,
      ...item,
      difficulty: level,
      duration: index === 0 ? "2-3 days" : "1-2 days",
      proofRequired: true,
      teacherFeedbackPrompt: "Submit this to your teacher/mentor for feedback or marks."
    }))
  };
}

const EXAM_SUBJECT_POOL = [
  "Mathematics",
  "Science",
  "English",
  "Social Studies",
  "Telugu",
  "Hindi",
  "Sanskrit",
  "Computer",
  "Physics",
  "Chemistry",
  "Biology"
];

function normalizeExamSubject(value) {
  const text = String(value || "").trim();
  const lower = text.toLowerCase();
  if (["math", "maths", "mathematics"].includes(lower)) return "Mathematics";
  if (["social", "social science", "social studies", "socialstudies"].includes(lower)) return "Social Studies";
  if (["bio", "biology"].includes(lower)) return "Biology";
  if (["phy", "physics"].includes(lower)) return "Physics";
  if (["chem", "chemistry"].includes(lower)) return "Chemistry";
  return EXAM_SUBJECT_POOL.find((item) => item.toLowerCase() === text.toLowerCase()) || text.slice(0, 40);
}

function topicMatchesSelection(row, selectedTopics = []) {
  if (!selectedTopics.length) return true;
  const haystack = [row?.subject, row?.chapter, row?.topic, ...(Array.isArray(row?.subtopics) ? row.subtopics : [])]
    .map((item) => cleanAcademicText(item || "").toLowerCase())
    .join(" ");
  return selectedTopics.some((topic) => {
    const needle = cleanAcademicText(topic || "").toLowerCase();
    return needle && (haystack.includes(needle) || needle.includes(String(row?.chapter || "").toLowerCase()) || needle.includes(String(row?.topic || "").toLowerCase()));
  });
}

function buildScopedExamTopicUnits({ subjects = [], selectedTopics = [], academicTopics = [] }) {
  const allowedSubjects = new Set(subjects.map(normalizeExamSubject).filter(Boolean).map((item) => item.toLowerCase()));
  const rows = Array.isArray(academicTopics)
    ? academicTopics.filter((row) => {
        if (row?.verified === false) return false;
        const subject = normalizeExamSubject(row?.subject || "");
        if (allowedSubjects.size && !allowedSubjects.has(subject.toLowerCase())) return false;
        return topicMatchesSelection(row, selectedTopics);
      })
    : [];

  const units = [];
  const seen = new Set();
  for (const row of rows) {
    const subject = normalizeExamSubject(row.subject);
    const chapter = cleanAcademicText(row.chapter || row.topic || "");
    const topic = cleanAcademicText(row.topic || row.chapter || "");
    const subtopics = Array.isArray(row.subtopics) ? row.subtopics.map(cleanAcademicText).filter(Boolean).slice(0, 5) : [];
    const topicNames = subtopics.length ? subtopics : [topic || chapter].filter(Boolean);
    for (const name of topicNames) {
      const key = `${subject}:${chapter}:${name}`.toLowerCase();
      if (!name || seen.has(key)) continue;
      seen.add(key);
      units.push({ subject, chapter, topic: name, parentTopic: topic, subtopics });
    }
  }

  return units.slice(0, 18);
}

function isGenericExamTopic(topic = "") {
  const text = cleanAcademicText(topic).toLowerCase();
  if (!text || text.length < 3) return true;
  return /\b(lesson reading|meanings|vocabulary|prepare formulas|learn formulas|revision notes|important questions|core concepts|study focus|grammar|personality development)\b/i.test(text);
}

function isExamStrategyScopeSafe(strategy, { subjects = [], selectedTopics = [], topicUnits = [] }) {
  const allowedSubjects = new Set(subjects.map(normalizeExamSubject).filter(Boolean).map((item) => item.toLowerCase()));
  const allowedTokens = topicUnits
    .flatMap((unit) => [unit.chapter, unit.topic, unit.parentTopic, ...(Array.isArray(unit.subtopics) ? unit.subtopics : [])])
    .map((item) => cleanAcademicText(item || "").toLowerCase())
    .filter((item) => item.length >= 3);
  if (!Array.isArray(strategy?.highPriorityTopics) || !strategy.highPriorityTopics.length) return false;
  if (allowedSubjects.size && strategy.highPriorityTopics.some((item) => !allowedSubjects.has(normalizeExamSubject(item?.subject || "").toLowerCase()))) return false;
  if (strategy.highPriorityTopics.some((item) => isGenericExamTopic(item?.topic))) return false;
  const selected = selectedTopics.map((item) => cleanAcademicText(item || "").toLowerCase()).filter(Boolean);
  const priorityText = strategy.highPriorityTopics.map((item) => `${item.topic} ${item.reason} ${(item.tasks || []).join(" ")}`).join(" ").toLowerCase();
  if (selected.length && !selected.some((item) => priorityText.includes(item))) return false;
  if (allowedTokens.length && !allowedTokens.some((token) => priorityText.includes(token))) return false;
  if (Array.isArray(strategy.weeklyPlan)) {
    const weekText = strategy.weeklyPlan.flatMap((week) => [week?.title, ...(Array.isArray(week?.tasks) ? week.tasks : [])]).join(" ").toLowerCase();
    if (/\b(personality development|meanings and vocabulary|lesson reading|english)\b/i.test(weekText) && !allowedSubjects.has("english")) return false;
    if (allowedTokens.length && !allowedTokens.some((token) => weekText.includes(token))) return false;
  }
  return true;
}

function buildFallbackExamStrategy({ examName, examDate, classLevel, syllabus, subjects, academicTopics = [] }) {
  const selectedSubjects = subjects.length ? subjects : ["Mathematics", "Science", "English", "Social Studies"];
  const topicTemplates = {
    Mathematics: ["Quadratic Equations", "Arithmetic Progressions", "Triangles", "Coordinate Geometry"],
    Science: ["Life Processes", "Electricity", "Acids Bases Salts", "Light Reflection"],
    English: ["Writing Skills", "Grammar", "Reading Comprehension", "Literature Extracts"],
    "Social Studies": ["National Movement", "Resources", "Democracy", "Economics Basics"],
    Telugu: ["Grammar", "Letter Writing", "Poetry", "Reading"],
    Hindi: ["Vyakaran", "Patra Lekhan", "Gadya", "Padya"],
    Sanskrit: ["Shabda Roop", "Dhatu Roop", "Translation", "Grammar"],
    Computer: ["Networking", "HTML Basics", "Python Basics", "Cyber Safety"],
    Physics: ["Light", "Electricity", "Motion", "Magnetism"],
    Chemistry: ["Chemical Reactions", "Acids Bases Salts", "Metals", "Carbon Compounds"],
    Biology: ["Life Processes", "Control Coordination", "Reproduction", "Heredity"]
  };
  const highPriorityTopics = selectedSubjects.flatMap((subject) => {
    const sourceTopics = academicTopics
      .filter((item) => String(item.subject || "").toLowerCase() === String(subject || "").toLowerCase())
      .map((item) => item.topic)
      .filter(Boolean);
    const topics = sourceTopics.length ? sourceTopics : topicTemplates[subject] || ["Core Concepts", "Important Questions", "Revision Notes"];
    return topics.slice(0, 2).map((topic, index) => ({
      subject,
      topic,
      priority: index === 0 ? "high" : "medium",
      weightageMarks: index === 0 ? 8 : 5,
      reason: "High-value topic for scoring and revision efficiency.",
      tasks: [`Revise ${topic}`, `Solve 10 questions from ${topic}`]
    }));
  });

  return {
    examName,
    examDate,
    classLevel,
    syllabus,
    expectedScore: 85,
    summary: "Focus on high-weightage topics first, revise medium topics next, and reserve short daily slots for writing practice.",
    priorityCounts: {
      high: highPriorityTopics.filter((item) => item.priority === "high").length,
      medium: highPriorityTopics.filter((item) => item.priority === "medium").length,
      low: Math.max(selectedSubjects.length, 3)
    },
    timeAllocation: selectedSubjects.map((subject, index) => ({
      subject,
      percent: Math.max(10, 28 - index * 3)
    })),
    highPriorityTopics,
    weeklyPlan: [
      { week: "Week 1", title: "High-weightage revision", tasks: highPriorityTopics.slice(0, 4).map((item) => item.topic) },
      { week: "Week 2", title: "Practice and weak-area repair", tasks: highPriorityTopics.slice(4, 8).map((item) => item.topic) },
      { week: "Week 3", title: "Mock tests and final revision", tasks: ["Full mock test", "Mistake notebook", "Formula/summary sheet"] }
    ],
    reminders: ["Study high-priority topics first.", "Take one short test every 3 days.", "Review wrong answers the same day."]
  };
}

function buildDatasetExamStrategy({ examName, examDate, classLevel, syllabus, subjects, selectedTopics = [], academicTopics = [] }) {
  const selectedSubjects = subjects.length ? subjects : ["Mathematics"];
  const topicUnits = buildScopedExamTopicUnits({ subjects: selectedSubjects, selectedTopics, academicTopics });
  if (!topicUnits.length) {
    return buildFallbackExamStrategy({ examName, examDate, classLevel, syllabus, subjects: selectedSubjects, academicTopics });
  }

  const highPriorityTopics = topicUnits.slice(0, 10).map((unit, index) => {
    const isHigh = index < Math.max(2, Math.ceil(topicUnits.length * 0.45));
    return {
      subject: unit.subject,
      topic: unit.chapter && unit.topic !== unit.chapter ? `${unit.chapter}: ${unit.topic}` : unit.topic,
      priority: isHigh ? "high" : index < Math.ceil(topicUnits.length * 0.75) ? "medium" : "low",
      weightageMarks: isHigh ? 8 : 5,
      reason: `Selected ${unit.subject} topic from extracted SSC Classes 6-10 academic data.`,
      tasks: [
        `Revise concept notes for ${unit.topic}`,
        `Solve textbook examples from ${unit.chapter || unit.topic}`,
        `Attempt 12 MCQs on ${unit.topic}`
      ]
    };
  });

  const weeklyPlan = [
    {
      week: "Week 1",
      title: `${topicUnits[0].chapter || selectedSubjects[0]} concept mastery`,
      tasks: topicUnits.slice(0, 4).map((unit) => `Study ${unit.topic} and solve worked examples`)
    },
    {
      week: "Week 2",
      title: "Textbook exercise and weak-area repair",
      tasks: topicUnits.slice(4, 8).map((unit) => `Practice textbook questions on ${unit.topic}`)
    },
    {
      week: "Week 3",
      title: "MCQ revision and final test",
      tasks: [
        `Take mixed MCQ test on ${topicUnits.slice(0, 5).map((unit) => unit.topic).join(", ")}`,
        `Rewrite mistakes with correct method`,
        `Revise ${topicUnits[0].chapter || selectedSubjects[0]} short notes`
      ]
    }
  ].filter((week) => week.tasks.length);

  return {
    examName,
    examDate,
    classLevel,
    syllabus,
    expectedScore: 85,
    summary: `Focus only on ${selectedSubjects.join(", ")} topics selected from extracted SSC Classes 6-10 data: ${topicUnits.slice(0, 4).map((unit) => unit.topic).join(", ")}.`,
    priorityCounts: {
      high: highPriorityTopics.filter((item) => item.priority === "high").length,
      medium: highPriorityTopics.filter((item) => item.priority === "medium").length,
      low: highPriorityTopics.filter((item) => item.priority === "low").length
    },
    timeAllocation: selectedSubjects.map((subject) => ({
      subject,
      percent: Math.max(10, Math.floor(100 / selectedSubjects.length))
    })),
    highPriorityTopics,
    weeklyPlan,
    reminders: [
      "Do not switch subjects inside this strategy.",
      `Complete topic practice before mock test: ${topicUnits[0].topic}.`,
      "Review every wrong answer with the textbook example method."
    ]
  };
}

function collectExamAcademicTopics({ board, classLevel = "10", subjects = [], requestedTopics = [] }) {
  const classNumber = Number(String(classLevel || "").match(/\d+/)?.[0] || 10);
  const requested = Array.isArray(requestedTopics)
    ? requestedTopics.map((item) => cleanAcademicText(item || "")).filter(Boolean)
    : [];
  const rows = [];

  for (const subject of subjects) {
    try {
      const record = board ? getSubjectRecord(board, classNumber, subject) : getSubjectRecordForClass(classNumber, subject);
      const subjectRecord = record?.subject || record;
      const verification = recordVerificationState(subjectRecord);
      const chapters = Array.isArray(record?.chapters || record?.subject?.chapters) ? record.chapters || record.subject.chapters : [];
      const usable = chapters.length && (verification.verified || hasUsableExtractedText(subjectRecord));
      if (!usable) {
        rows.push({
          subject,
          chapter: "",
          topic: "",
          subtopics: [],
          verified: false,
          extractionStatus: verification.extractionStatus,
          verificationStatus: verification.verificationStatus,
          message: verification.message || "Verified academic topics for this selection are pending."
        });
        continue;
      }
      for (const chapter of chapters) {
        const chapterName = cleanAcademicText(chapter?.chapter_name || chapter?.title || chapter?.name || "");
        if (hasBrokenPdfText(chapterName)) continue;
        const topicList = Array.isArray(chapter?.topics) ? chapter.topics : [];
        if (!topicList.length && chapterName) {
          rows.push({
            subject,
            chapter: chapterName,
            topic: chapterName,
            subtopics: normalizeTextbookQuestionRows(chapter?.textbookQuestions, 4),
            verified: true,
            reviewPending: verification.reviewPending,
            extractionStatus: verification.extractionStatus,
            verificationStatus: verification.verificationStatus,
            message: verification.message
          });
        }
        for (const topic of topicList) {
          const topicName = cleanAcademicText(topic?.topic_name || topic?.title || topic?.name || topic || "");
          if (!topicName) continue;
          if (hasBrokenPdfText(topicName)) continue;
          rows.push({
            subject,
            chapter: chapterName,
            topic: topicName,
            subtopics: Array.isArray(topic?.subtopics) ? topic.subtopics.map(cleanAcademicText).filter(Boolean) : [],
            verified: true,
            reviewPending: verification.reviewPending,
            extractionStatus: verification.extractionStatus,
            verificationStatus: verification.verificationStatus,
            message: verification.message
          });
        }
      }
    } catch {
      // Keep strategy generation resilient when a future class/subject is not yet enriched.
    }
  }

  const requestedMatches = requested.length
    ? rows.filter((row) => requested.some((topic) => {
        const key = topic.toLowerCase();
        const rowTopic = String(row.topic || "").toLowerCase();
        const rowChapter = String(row.chapter || "").toLowerCase();
        return key === rowTopic || key === rowChapter || rowTopic.includes(key) || rowChapter.includes(key) || key.includes(rowChapter);
      }))
    : rows;
  const filtered = requested.length && requestedMatches.length ? requestedMatches : rows;
  if (!filtered.length && rows.some((row) => row.verified === false)) {
    return rows.filter((row) => row.verified === false).slice(0, 3);
  }
  return filtered.slice(0, 80);
}

function classifyAcademicQuestion(text = "") {
  const value = cleanAcademicText(text);
  const lower = value.toLowerCase();
  if (/\b(mcq|choose|objective|fill in|match|true or false|one word)\b/i.test(lower)) return "objective";
  if (/\b(essay|long answer|explain in detail|describe in detail|write an essay)\b/i.test(lower) || value.length > 180) return "long";
  if (/\b(draw|diagram|map|label|locate|experiment|activity)\b/i.test(lower)) return "diagram";
  if (/\b(what is|define|name|who|when|where|why)\b/i.test(lower) || value.length < 80) return "veryShort";
  return "short";
}

function collectExamImportantQuestions({ board, classLevel = "10", subjects = [], selectedTopics = [], academicTopics = [] }) {
  const allowedTopicText = buildScopedExamTopicUnits({ subjects, selectedTopics, academicTopics })
    .flatMap((item) => [item.chapter, item.topic, item.parentTopic, ...(item.subtopics || [])])
    .map((item) => cleanAcademicText(item || "").toLowerCase())
    .filter(Boolean);
  const groups = { objective: [], veryShort: [], short: [], long: [], diagram: [] };
  const seen = new Set();
  const classNumber = Number(String(classLevel || "").match(/\d+/)?.[0] || 10);

  for (const subject of subjects) {
    try {
      const record = board ? getSubjectRecord(board, classNumber, subject) : getSubjectRecordForClass(classNumber, subject);
      const subjectRecord = record?.subject || record;
      const chapters = Array.isArray(record?.chapters || record?.subject?.chapters) ? record.chapters || record.subject.chapters : [];
      for (const chapter of chapters) {
        const chapterName = cleanAcademicText(chapter?.chapter_name || chapter?.title || chapter?.name || "");
        const chapterKey = chapterName.toLowerCase();
        if (allowedTopicText.length && !allowedTopicText.some((topic) => chapterKey.includes(topic) || topic.includes(chapterKey))) {
          const topicText = (Array.isArray(chapter?.topics) ? chapter.topics : [])
            .map((topic) => cleanAcademicText(topic?.topic_name || topic?.title || topic?.name || topic || "").toLowerCase())
            .join(" ");
          if (!allowedTopicText.some((topic) => topicText.includes(topic) || topic.includes(chapterKey))) continue;
        }
        const questions = normalizeTextbookQuestionRows(chapter?.textbookQuestions, 24);
        for (const question of questions) {
          const key = `${subject}:${chapterName}:${question}`.toLowerCase();
          if (seen.has(key) || hasBrokenPdfText(question)) continue;
          seen.add(key);
          const type = classifyAcademicQuestion(question);
          groups[type].push({
            subject,
            chapter: chapterName,
            question,
            source: "academic_pdf",
            page: Number(chapter?.source_pages?.start || 0) || undefined
          });
        }
      }
    } catch {
      // Keep exam strategy resilient for pending subjects.
    }
  }

  Object.keys(groups).forEach((key) => {
    groups[key] = groups[key].slice(0, 8);
  });
  return {
    available: Object.values(groups).some((items) => items.length > 0),
    groups
  };
}

function resolveStrictSsc10AcademicContext({ board, classLevel = "10", subjects = [], requestedTopics = [] }) {
  const normalizedBoard = String(board || "").trim().toUpperCase();
  const classNumber = Number(String(classLevel || "").match(/\d+/)?.[0] || 10);
  const datasetScope = {
    board: normalizedBoard || "SSC",
    classLevel: String(classLevel || "10"),
    subject: subjects[0] || "",
    chapter: requestedTopics[0] || ""
  };

  if (normalizedBoard !== "SSC" || classNumber < 6 || classNumber > 10) {
    return {
      ok: false,
      source: "data_pending",
      isTopicGrounded: false,
      dataPendingReason: "Topic-aware generation is currently available for SSC Classes 6 to 10.",
      datasetScope,
      topics: []
    };
  }

  const topics = collectExamAcademicTopics({
    board: "SSC",
    classLevel: String(classNumber),
    subjects,
    requestedTopics
  }).filter((item) => item?.verified);

  if (!topics.length) {
    return {
      ok: false,
      source: "data_pending",
      isTopicGrounded: false,
      dataPendingReason: `SSC Class ${classNumber} chapter/topic extraction is pending for this selection.`,
      datasetScope,
      topics: []
    };
  }

  return {
    ok: true,
    source: "dataset_deterministic",
    isTopicGrounded: true,
    dataPendingReason: "",
    datasetScope,
    topics
  };
}

function hasTopicGroundedPlanner(weeks = [], academicTopics = []) {
  if (!Array.isArray(weeks) || !weeks.length) return false;
  const topicTokens = Array.isArray(academicTopics)
    ? academicTopics
        .flatMap((item) => [item?.chapter, item?.topic, ...(Array.isArray(item?.subtopics) ? item.subtopics : [])])
        .map((item) => String(item || "").trim().toLowerCase())
        .filter((item) => item.length >= 3)
    : [];
  if (!topicTokens.length) return false;
  const plannerText = weeks
    .flatMap((week) => [
      week?.title,
      week?.focus,
      ...(Array.isArray(week?.tasks) ? week.tasks.map((task) => task?.title) : [])
    ])
    .map((item) => String(item || "").toLowerCase())
    .join(" ");
  return topicTokens.some((token) => plannerText.includes(token));
}

function buildEngineTopicHints(engineResults = []) {
  if (!Array.isArray(engineResults) || !engineResults.length) return [];
  return engineResults
    .map((item) => {
      const chapter = String(item?.chapter || "").trim();
      const topic = String(item?.topic || "").trim();
      const text = String(item?.text || "").trim().replace(/\s+/g, " ");
      const scope = [item?.subject, chapter, topic].filter(Boolean).join(" > ");
      if (!text) return null;
      return `${scope || "SSC Topic"} :: ${text.slice(0, 220)}`;
    })
    .filter(Boolean)
    .slice(0, 8);
}

function extractGoalFromMessage(message = "") {
  const text = String(message || "").trim();
  if (!text) return "";

  const patterns = [
    /want to become\s+(.+?)(?:[.!?]|$)/i,
    /become\s+(.+?)(?:[.!?]|$)/i,
    /goal is\s+(.+?)(?:[.!?]|$)/i,
    /prepare for\s+(.+?)(?:[.!?]|$)/i,
    /learn\s+(.+?)(?:[.!?]|$)/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return String(match[1]).trim().replace(/^an?\s+/i, "").slice(0, 120);
    }
  }

  if (/\b(ai engineer|data scientist|web developer|upsc|lawyer|backend developer|frontend developer|machine learning engineer)\b/i.test(text)) {
    const matched = text.match(/\b(ai engineer|data scientist|web developer|upsc|lawyer|backend developer|frontend developer|machine learning engineer)\b/i);
    return String(matched?.[1] || "").trim();
  }

  return "";
}

function toConversationTitle(prompt = "") {
  const clean = String(prompt || "").trim().replace(/\s+/g, " ");
  if (!clean) return "New chat";
  return clean.length > 60 ? `${clean.slice(0, 60)}...` : clean;
}

async function ensureConversationAccess(userId, conversationId) {
  const exists = await AiChatLog.exists({ userId, conversationId });
  if (!exists) throw new ApiError(404, "Conversation not found");
}

async function ensureConversationAccessScoped(userId, conversationId, scopeFilter = {}) {
  const exists = await AiChatLog.exists({ userId, conversationId, ...scopeFilter });
  if (!exists) throw new ApiError(404, "Conversation not found");
}

async function buildConversationSummaries(userId, scopeFilter = {}) {
  const rows = await AiChatLog.find({ userId, ...scopeFilter })
    .select("conversationId conversationTitle assistantMode pinned prompt response createdAt")
    .sort({ createdAt: -1 })
    .limit(250)
    .lean();

  const map = new Map();
  for (const row of rows) {
    const key = String(row.conversationId || "");
    if (!key) continue;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        conversationId: key,
        title: String(row.conversationTitle || "").trim() || toConversationTitle(row.prompt),
        assistantMode: row.assistantMode || "general",
        pinned: Boolean(row.pinned),
        lastPrompt: row.prompt || "",
        lastResponsePreview: String(row.response || "").trim().slice(0, 180),
        lastMessageAt: row.createdAt,
        createdAt: row.createdAt,
        messageCount: 1
      });
      continue;
    }

    existing.messageCount += 1;
    if (new Date(row.createdAt).getTime() < new Date(existing.createdAt).getTime()) {
      existing.createdAt = row.createdAt;
    }
    if (!existing.pinned && row.pinned) existing.pinned = true;
    if (!existing.title && row.conversationTitle) existing.title = row.conversationTitle;
  }

  return Array.from(map.values()).sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime();
  });
}

function buildHighSchoolAssistantFallbackAnswer({ message, assistantMode, classLevel, subject, chapter }) {
  const cleanPrompt = String(message || "").trim();
  const isGreeting = /^(hi|hii|hello|hey|namaste|good\s*(morning|afternoon|evening)|yo)[\s!.]*$/i.test(cleanPrompt);
  if (isGreeting) {
    return [
      "Hi! Welcome to ORIN.",
      "",
      assistantMode === "general"
        ? "I can help with anything you ask: school doubts, explanations, planning, writing, ideas, or general questions."
        : `I can help with your academic doubts for Class ${classLevel}${subject ? `, ${subject}` : ""}.`,
      "",
      "Ask me a question like:",
      "- What is photosynthesis?",
      "- Explain this in simple words",
      "- Give me exam points"
    ].join("\n");
  }
  if (assistantMode === "general") {
    return [
      `You asked: "${cleanPrompt}"`,
      "",
      "Here is a clear answer in simple language:",
      "1. I understood your question and focused only on your prompt.",
      "2. If you want, I can also give a shorter version, examples, or a step-by-step explanation.",
      "",
      "Reply with: short / detailed / examples."
    ].join("\n");
  }

  const scopeLine = `Class ${classLevel}${subject ? ` • ${subject}` : ""}${chapter ? ` • ${chapter}` : ""}`;
  return [
    `Academic help (${scopeLine})`,
    "",
    `Prompt: ${cleanPrompt}`,
    "",
    "Structured answer:",
    "1. Core concept: focus on the main definition and idea first.",
    "2. Step-by-step: break the problem into smaller logical steps.",
    "3. Exam tip: write key points with one example for full marks.",
    "",
    "If you share the exact chapter/topic, I can give a precise exam-ready answer."
  ].join("\n");
}

exports.chatWithAi = asyncHandler(async (req, res) => {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const entitlement = await getSubscriptionEntitlement(req.user.id);
  const dailyLimit = entitlement.aiChatDailyLimit || aiChatDailyLimit;

  const usedToday = await AiChatLog.countDocuments({
    userId: req.user.id,
    createdAt: { $gte: startOfDay }
  });

  if (usedToday >= dailyLimit) {
    throw new ApiError(429, `Daily AI limit reached (${dailyLimit}). Try again tomorrow.`);
  }

  const assistantMode = req.body?.context?.assistantMode === "personalized" ? "personalized" : "general";
  const conversationId = String(req.body?.conversationId || new mongoose.Types.ObjectId().toString()).trim();
  if (!conversationId) throw new ApiError(400, "conversationId is required");

  let existingConversation = null;
  if (req.body?.conversationId) {
    existingConversation = await AiChatLog.findOne({ userId: req.user.id, conversationId }).select("conversationTitle pinned").lean();
    if (!existingConversation) throw new ApiError(404, "Conversation not found");
  }

  let academicContext = null;
  if (req.body.context?.academic) {
    try {
      academicContext = summarizeAcademicContext(req.body.context.academic);
    } catch (error) {
      academicContext = {
        unavailable: true,
        reason: error.message || "Academic context could not be loaded"
      };
    }
  }
  const context = {
    ...(req.body.context || {}),
    academicContext
  };

  const { answer, provider, model } = await requestAiResponse({
    role: req.user.role,
    message: req.body.message,
    context
  });

  await AiChatLog.create({
    userId: req.user.id,
    role: req.user.role,
    conversationId,
    conversationTitle: String(existingConversation?.conversationTitle || "").trim() || toConversationTitle(req.body.message),
    assistantMode,
    pinned: Boolean(existingConversation?.pinned),
    provider,
    model,
    prompt: req.body.message,
    response: answer,
    context
  });

  const extractedGoal = extractGoalFromMessage(req.body.message);
  if (req.user.role === "student" && extractedGoal) {
    const [user, profile] = await Promise.all([
      User.findById(req.user.id).select("primaryCategory subCategory").lean(),
      StudentProfile.findOne({ userId: req.user.id }).select("careerGoals").lean()
    ]);

    await updateJourneyGoal(
      req.user.id,
      {
        title: extractedGoal,
        domain: user?.primaryCategory || "",
        subDomain: user?.subCategory || "",
        source: "assistant"
      },
      req.user.role
    );

    if (!String(profile?.careerGoals || "").trim()) {
      await StudentProfile.findOneAndUpdate(
        { userId: req.user.id },
        { $set: { careerGoals: extractedGoal } },
        { upsert: true, new: false }
      );
    }
  }

  res.status(200).json({
    answer,
    conversationId,
    meta: {
      provider,
      model,
      isPremium: entitlement.isPremium,
      planId: entitlement.planId,
      dailyLimit,
      remainingToday: Math.max(dailyLimit - usedToday - 1, 0)
    }
  });
});

exports.generateHighSchoolSubjectGapQuiz = asyncHandler(async (req, res) => {
  const profile = await StudentProfile.findOne({ userId: req.user.id })
    .select("learnerStage classLevel institutionName className")
    .lean();
  if (profile?.learnerStage && profile.learnerStage !== "highschool") {
    throw new ApiError(403, "Subject Gap Analyzer is available for high school learners.");
  }

  const requestedSubjects = Array.isArray(req.body?.subjects) && req.body.subjects.length
    ? req.body.subjects.map(normalizeSubject)
    : HIGH_SCHOOL_SUBJECTS;
  const subjects = Array.from(new Set(requestedSubjects)).slice(0, 3);
  const questionCount = clampNumber(req.body?.questionCount, 8, 20, 12);
  const classLevel = String(req.body?.classLevel || profile?.classLevel || profile?.className || "High School").trim().slice(0, 40);
  const focusTopic = String(req.body?.focusTopic || "").trim().slice(0, 80);
  const board = String(req.body?.board || req.body?.academicBoard || "SSC").trim().toUpperCase().slice(0, 20);
  const context = resolveStrictSsc10AcademicContext({
    board,
    classLevel,
    subjects,
    requestedTopics: focusTopic ? [focusTopic] : []
  });
  const academicTopics = context.topics;
  const aiEngine = context.ok
    ? await retrieveAcademicContext({
        query: `${subjects.join(" ")} ${focusTopic || ""} class ${classLevel}`,
        board,
        classLevel,
        subject: subjects[0] || "",
        chapter: focusTopic || "",
        limit: 10
      })
    : { ok: false, reason: "context_not_ready", results: [] };
  const engineTopicHints = buildEngineTopicHints(aiEngine.results);
  const importantQuestions = collectExamImportantQuestions({
    board,
    classLevel,
    subjects: subjects.length ? subjects : EXAM_SUBJECT_POOL.slice(0, 5),
    selectedTopics: focusTopic ? [focusTopic] : [],
    academicTopics
  });

  const fallbackQuestions = buildSubjectGapFallbackQuiz({ subjects, questionCount, focusTopic });
  let source = context.ok ? "dataset_deterministic" : "data_pending";
  let provider = "local";
  let model = "deterministic";
  let questions = fallbackQuestions;

  if (context.ok) {
    try {
    const prompt = [
      "Create a high-school Subject Gap Analyzer quiz.",
      "Return JSON only with this shape:",
      '{"questions":[{"id":"short-id","subject":"Mathematics|Science|English","topic":"topic name","question":"question text","options":["real answer 1","real answer 2","real answer 3","real answer 4"],"correct":"exact option text","explanation":"short explanation"}]}',
      `Class level: ${classLevel}.`,
      `Board: ${board}.`,
      `Subjects: ${subjects.join(", ")}.`,
      focusTopic ? `Focus topic: ${focusTopic}.` : "Mix foundational topics across the selected subjects.",
      `Academic dataset topics: ${academicTopics.length ? academicTopics.map((item) => `${item.subject} > ${item.chapter} > ${item.topic}`).join("; ") : "No verified textbook topics found for this selection. Avoid fake topic names."}.`,
      engineTopicHints.length ? `Retrieved textbook snippets: ${engineTopicHints.join(" || ")}` : "Retrieved textbook snippets: unavailable",
      `Create exactly ${questionCount} questions.`,
      "Rules: textbook-first, school-safe content, no adult career/marketplace content, each correct value must exactly match one option, concise explanations.",
      "Do not use placeholder options like A, B, C, D. Options must be the actual answer text."
    ].join("\n");

    const ai = await requestAiResponse({
      role: "student",
      message: prompt,
      context: {
        assistantMode: HIGH_SCHOOL_JSON_MODE,
        feature: "highschool_subject_gap_quiz",
        expectedFormat: "json",
        learnerStage: "highschool"
      }
    });
    const parsed = safeJsonParse(ai.answer);
    const normalized = Array.isArray(parsed?.questions)
      ? parsed.questions.map(normalizeGapQuestion).filter(Boolean).slice(0, questionCount)
      : [];

    if (normalized.length >= Math.min(8, questionCount)) {
      questions = normalized;
      source = "dataset_ai";
      provider = ai.provider;
      model = ai.model;
    }
  } catch (error) {
    source = "dataset_deterministic";
  }
  }

  if (!context.ok) {
    questions = [];
  }

  res.status(200).json({
    source,
    isTopicGrounded: context.ok,
    datasetScope: context.datasetScope,
    dataPendingReason: context.dataPendingReason || undefined,
    quiz: {
      title: focusTopic ? `${focusTopic} Practice` : "Subject Gap Analyzer",
      classLevel,
      subjects,
      questions
    },
    meta: {
      provider,
      model,
      aiEngine: {
        enabled: aiEngine.ok,
        reason: aiEngine.reason,
        hits: Array.isArray(aiEngine.results) ? aiEngine.results.length : 0
      }
    }
  });
});

exports.analyzeHighSchoolSubjectGap = asyncHandler(async (req, res) => {
  const questions = Array.isArray(req.body?.questions)
    ? req.body.questions.map(normalizeGapQuestion).filter(Boolean).slice(0, 20)
    : [];
  if (!questions.length) throw new ApiError(400, "questions are required");

  const answers = req.body?.answers && typeof req.body.answers === "object" ? req.body.answers : {};
  const score = scoreHighSchoolSubjectGap(questions, answers);
  const board = String(req.body?.board || req.body?.academicBoard || "SSC").trim().toUpperCase().slice(0, 20);
  const classLevel = String(req.body?.classLevel || "10").trim().slice(0, 40);
  const context = resolveStrictSsc10AcademicContext({
    board,
    classLevel,
    subjects: Array.from(new Set(questions.map((q) => normalizeSubject(q.subject)).filter(Boolean))),
    requestedTopics: []
  });
  let focusPlan = buildFallbackFocusPlan(score);
  let source = context.ok ? "dataset_deterministic" : "data_pending";
  let provider = "local";
  let model = "deterministic";
  const weakTopicNames = Array.isArray(score?.weakRows) ? score.weakRows.map((row) => String(row.label || "").trim()).filter(Boolean) : [];
  const aiEngine = context.ok
    ? await retrieveAcademicContext({
        query: `${weakTopicNames.join(" ")} ${classLevel} weak areas`,
        board,
        classLevel,
        subject: (score.subjectRows?.[0]?.label || "").trim(),
        chapter: weakTopicNames[0] || "",
        limit: 8
      })
    : { ok: false, reason: "context_not_ready", results: [] };
  const engineTopicHints = buildEngineTopicHints(aiEngine.results);

  try {
    const prompt = [
      "Create a personalized high-school subject gap focus plan from this real quiz performance data.",
      "Do not change scores. Use only the supplied weak/average/strong topic data.",
      "Return JSON only with this shape:",
      '{"praise":"short encouraging sentence","focusPlan":{"title":"Your Focus Plan","topics":["topic"],"description":"short plan","dailyPractice":"short daily task","improvementTarget":"target","steps":["step 1","step 2","step 3"]}}',
      JSON.stringify({
        overallScore: score.overallScore,
        subjectRows: score.subjectRows,
        weakRows: score.weakRows,
        averageRows: score.averageRows,
        strengthRows: score.strengthRows,
        retrievedTextbookSnippets: engineTopicHints
      })
    ].join("\n");

    const ai = await requestAiResponse({
      role: "student",
      message: prompt,
      context: {
        assistantMode: HIGH_SCHOOL_JSON_MODE,
        feature: "highschool_subject_gap_report",
        expectedFormat: "json",
        learnerStage: "highschool"
      }
    });
    const parsed = safeJsonParse(ai.answer);
    if (parsed?.focusPlan?.description) {
      focusPlan = {
        title: String(parsed.focusPlan.title || "Your Focus Plan").slice(0, 80),
        topics: Array.isArray(parsed.focusPlan.topics)
          ? parsed.focusPlan.topics.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 3)
          : focusPlan.topics,
        description: String(parsed.focusPlan.description || focusPlan.description).slice(0, 300),
        dailyPractice: String(parsed.focusPlan.dailyPractice || focusPlan.dailyPractice).slice(0, 180),
        improvementTarget: String(parsed.focusPlan.improvementTarget || focusPlan.improvementTarget).slice(0, 160),
        steps: Array.isArray(parsed.focusPlan.steps)
          ? parsed.focusPlan.steps.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 4)
          : focusPlan.steps
      };
      source = "dataset_ai";
      provider = ai.provider;
      model = ai.model;
    }
  } catch (error) {
    source = context.ok ? "dataset_deterministic" : "data_pending";
  }

  const subjects = Array.from(new Set(score.subjectRows.map((row) => normalizePlannerSubject(row.label)).filter(Boolean)));
  await Promise.all(subjects.map((activitySubject) => {
    const subjectTopics = score.topicRows.filter((row) => normalizePlannerSubject(row.subject) === activitySubject);
    const weakTopics = score.weakRows.filter((row) => normalizePlannerSubject(row.subject) === activitySubject).map((row) => row.label);
    const wrongAnswerTopics = questions
      .filter((question) => normalizePlannerSubject(question.subject) === activitySubject && String(answers?.[question.id] || "") !== String(question.correct || ""))
      .map((question) => question.topic);
    const strongTopics = score.strengthRows.filter((row) => normalizePlannerSubject(row.subject) === activitySubject).map((row) => row.label);
    const subjectRow = score.subjectRows.find((row) => normalizePlannerSubject(row.label) === activitySubject);
    return recordHighSchoolActivity(req.user.id, "subject_gap", {
      board,
      classLevel,
      subject: activitySubject,
      topics: subjectTopics.map((row) => row.label),
      weakTopics,
      wrongAnswerTopics,
      strongTopics,
      score: subjectRow?.percent,
      details: {
        overallScore: score.overallScore,
        completedQuestions: score.completedQuestions,
        focusPlan
      }
    });
  }));

  res.status(200).json({
    source,
    isTopicGrounded: context.ok,
    datasetScope: context.datasetScope,
    dataPendingReason: context.dataPendingReason || undefined,
    report: {
      ...score,
      praise:
        score.overallScore >= 85
          ? "Excellent work. Keep it up."
          : score.overallScore >= 70
            ? "Great effort. You are on track."
            : score.overallScore >= 55
              ? "Good start. Your focus plan will help."
              : "Good attempt. Let us strengthen the basics.",
      focusPlan
    },
    meta: {
      provider,
      model,
      aiEngine: {
        enabled: aiEngine.ok,
        reason: aiEngine.reason,
        hits: Array.isArray(aiEngine.results) ? aiEngine.results.length : 0
      }
    }
  });
});

exports.generateHighSchoolStudyRoadmap = asyncHandler(async (req, res) => {
  const profile = await StudentProfile.findOne({ userId: req.user.id })
    .select("learnerStage classLevel className institutionName")
    .lean();
  if (profile?.learnerStage && profile.learnerStage !== "highschool") {
    throw new ApiError(403, "Study Roadmap is available for high school learners.");
  }

  const subject = normalizeExamSubject(req.body?.subject) || "Mathematics";
  const studyGoal = String(req.body?.studyGoal || req.body?.goal || "Improve marks and complete weekly revision").trim().slice(0, 120);
  const currentLevel = String(req.body?.currentLevel || "Basics").trim().slice(0, 40);
  const timePerDay = String(req.body?.timePerDay || "1-2 hours").trim().slice(0, 40);
  const classLevel = String(req.body?.classLevel || profile?.classLevel || profile?.className || "High School").trim().slice(0, 40);
  const board = String(req.body?.board || req.body?.academicBoard || "SSC").trim().toUpperCase().slice(0, 20);
  const chapter = String(req.body?.chapter || req.body?.topic || "").trim().slice(0, 80);
  const academicTopics = collectExamAcademicTopics({
    board,
    classLevel,
    subjects: [subject],
    requestedTopics: chapter ? [chapter] : []
  });
  const lessonPlan = findAcademicLessonPlan({ board, classLevel, subject, chapter });
  const topicPlan = buildRoadmapTopicPlan(subject, chapter, academicTopics);
  const aiEngine = await retrieveAcademicContext({
    query: `${subject} ${chapter || ""} ${studyGoal}`.trim(),
    board,
    classLevel,
    subject,
    chapter: chapter || "",
    limit: 10
  });
  const engineTopicHints = buildEngineTopicHints(aiEngine.results);
  const subjectRules = roadmapMissionTemplate(subject)
    .map((item, index) => `${index + 1}. ${item.label}: ${item.practice}; proof: ${item.proof}`)
    .join("\n");

  let roadmap = lessonPlan
    ? buildLessonBackedStudyRoadmap({ subject, studyGoal, currentLevel, timePerDay, classLevel, chapter, lessonPlan })
    : buildFallbackHighSchoolStudyRoadmap({ subject, studyGoal, currentLevel, timePerDay, classLevel, chapter, academicTopics });
  let source = lessonPlan ? "lesson_dataset" : "fallback";
  let provider = "local";
  let model = "deterministic";

  if (lessonPlan) {
    const perWeek = 6;
    let quizPool = [];
    try {
      quizPool = await buildAiRoadmapQuizQuestions({
        subject,
        classLevel,
        board,
        chapter: chapter || lessonPlan?.chapter?.chapter_name || "",
        lessonPlan,
        questionCount: Math.max(18, (roadmap.steps?.length || 1) * perWeek)
      });
      if (quizPool.length >= 8) {
        source = "lesson_dataset_ai_quiz";
        provider = "ai";
      }
    } catch {}

    if (quizPool.length < 8) {
      quizPool = buildDeterministicRoadmapQuizQuestions({
        subject,
        chapter: chapter || lessonPlan?.chapter?.chapter_name || "",
        lessonPlan,
        questionCount: Math.max(18, (roadmap.steps?.length || 1) * perWeek)
      });
      if (source !== "lesson_dataset_ai_quiz") {
        source = "lesson_dataset_fallback_quiz";
        provider = "local";
      }
    }

    roadmap = {
      ...roadmap,
      steps: (Array.isArray(roadmap.steps) ? roadmap.steps : []).map((step, index) => {
        const start = index * perWeek;
        const questions = quizPool.slice(start, start + perWeek);
        return {
          ...step,
          quizQuestions: questions.length ? questions : (Array.isArray(step.quizQuestions) ? step.quizQuestions : [])
        };
      })
    };

    await recordHighSchoolActivity(req.user.id, "study_roadmap", {
      board,
      classLevel,
      subject,
      topics: (roadmap.steps || []).map((step) => step.title),
      pendingTopics: (roadmap.steps || []).filter((step) => !step.completed && step.status !== "completed").map((step) => step.title),
      completedTopics: (roadmap.steps || []).filter((step) => step.completed || step.status === "completed").map((step) => step.title),
      details: { goal: studyGoal, chapter, source }
    });

    return res.status(200).json({
      source,
      roadmap,
      meta: {
        provider,
        model,
        aiEngine: {
          enabled: aiEngine.ok,
          reason: aiEngine.reason,
          hits: Array.isArray(aiEngine.results) ? aiEngine.results.length : 0
        }
      }
    });
  }

  try {
    const prompt = [
      "Create a high-school AI Study Roadmap like a mission-based academic journey, not a timetable.",
      "Return JSON only with this exact shape:",
      '{"title":"Science Academic Mission Roadmap","goal":"Improve Science marks","summary":"short summary","steps":[{"id":"step-1","stepNumber":1,"title":"Life Processes Foundation","status":"active|locked|completed","completed":false,"canStart":true,"canSubmitProof":false,"proofRequired":true,"proofStatus":"not_submitted","startedAt":null,"completedAt":null,"missionType":"learning_mission","focus":"short focus","outcome":"what student proves","xpReward":20,"tasks":[{"id":"task-1","type":"Read|Practice|Quiz|Proof","title":"Read NCERT notes","duration":"15 min","completed":false}]}],"progress":{"completedSteps":0,"totalSteps":5,"progressPercent":0,"currentStepId":"step-1","lockHours":0},"certificatePrompt":"short prompt","reminders":["reminder"]}',
      `Class level: ${classLevel}.`,
      `Board: ${board}.`,
      `Subject: ${subject}.`,
      `Chapter/topic focus: ${chapter || "use the most important syllabus topics"}.`,
      `Dataset verification: ${topicPlan.verified ? "verified topic context available" : "verified topic context is pending or unreadable"}.`,
      lessonPlan ? `Lesson-backed weekly plan: ${lessonPlan.weeklyPlan.map((item) => item.title).join("; ")}.` : "No full lesson weekly plan exists yet.",
      `Academic dataset topics: ${topicPlan.verified ? topicPlan.topics.map((item) => `${item.chapter} > ${item.topic}${item.subtopics?.length ? ` (${item.subtopics.slice(0, 3).join(", ")})` : ""}`).join("; ") : topicPlan.pendingMessage}.`,
      engineTopicHints.length ? `Retrieved textbook snippets: ${engineTopicHints.join(" || ")}` : "Retrieved textbook snippets: unavailable",
      `Subject-specific mission rules:\n${subjectRules}`,
      `Study goal: ${studyGoal}.`,
      `Current level: ${currentLevel}.`,
      `Available time per day: ${timePerDay}.`,
      "Rules: create 5-6 sequential missions, each with proof-oriented tasks. Do not create weekly timetable rows. Prioritize Academic dataset topics when available. If verified dataset topics are not available, do not invent textbook chapter names; state that verified topic data is pending and keep tasks generic around opening the PDF/resource. Keep text concise and school-safe."
    ].join("\n");

    const ai = await requestAiResponse({
      role: "student",
      message: prompt,
      context: {
        assistantMode: HIGH_SCHOOL_JSON_MODE,
        feature: "highschool_study_roadmap",
        expectedFormat: "json",
        learnerStage: "highschool"
      }
    });
    const parsed = safeJsonParse(ai.answer);
    if (parsed?.summary && Array.isArray(parsed?.steps) && parsed.steps.length) {
      const normalizeTask = (task, fallbackId) => ({
        id: String(task?.id || fallbackId).trim().slice(0, 80),
        type: String(task?.type || "Practice").trim().slice(0, 20),
        title: String(task?.title || "Practice: 10 Questions").trim().slice(0, 100),
        duration: String(task?.duration || "15 min").trim().slice(0, 30),
        completed: Boolean(task?.completed)
      });
      const normalizeStep = (step, index) => {
        const fallbackStep = roadmap.steps[index] || {};
        const parsedTitle = cleanAcademicText(step?.title || "");
        const parsedTasks = Array.isArray(step?.tasks)
          ? step.tasks.map((task, taskIndex) => normalizeTask(task, `step-${index + 1}-task-${taskIndex + 1}`)).slice(0, 5)
          : [];
        return {
          id: String(step?.id || fallbackStep.id || `step-${index + 1}`).trim().slice(0, 80),
          stepNumber: Number(step?.stepNumber || fallbackStep.stepNumber || index + 1),
          title: (isGenericRoadmapText(parsedTitle) ? fallbackStep.title : parsedTitle || fallbackStep.title || "Core Topic Mission").slice(0, 90),
          status: ["active", "locked", "completed"].includes(String(step?.status || "").toLowerCase())
            ? String(step.status).toLowerCase()
            : fallbackStep.status || (index === 0 ? "active" : "locked"),
          completed: Boolean(step?.completed),
          canStart: index === 0,
          canSubmitProof: false,
          proofRequired: true,
          proofStatus: ["not_submitted", "submitted", "approved"].includes(String(step?.proofStatus || ""))
            ? String(step.proofStatus)
            : "not_submitted",
          startedAt: step?.startedAt || null,
          completedAt: step?.completedAt || null,
          unlockedAt: index === 0 ? new Date() : null,
          missionType: String(step?.missionType || fallbackStep.missionType || "learning_mission").trim().slice(0, 40),
          focus: String(step?.focus || fallbackStep.focus || "Complete tasks, practice, and submit proof.").trim().slice(0, 180),
          outcome: String(step?.outcome || fallbackStep.outcome || "Show your understanding with practice proof.").trim().slice(0, 180),
          xpReward: clampNumber(step?.xpReward, 10, 100, fallbackStep.xpReward || 20),
          lessonSectionIds: Array.isArray(fallbackStep.lessonSectionIds) ? fallbackStep.lessonSectionIds : [],
          quizQuestions: Array.isArray(fallbackStep.quizQuestions) ? fallbackStep.quizQuestions : [],
          tasks: parsedTasks.length ? parsedTasks : (Array.isArray(fallbackStep.tasks) ? fallbackStep.tasks : [])
        };
      };
      const steps = parsed.steps.map(normalizeStep).filter((step) => step.title).slice(0, 6);
      roadmap = {
        ...roadmap,
        title: String(parsed.title || roadmap.title).trim().slice(0, 80),
        goal: String(parsed.goal || roadmap.goal || studyGoal).trim().slice(0, 120),
        summary: String(parsed.summary || roadmap.summary).trim().slice(0, 260),
        steps,
        progress: {
          completedSteps: steps.filter((step) => step.status === "completed").length,
          totalSteps: steps.length,
          progressPercent: clampNumber(parsed.progress?.progressPercent, 0, 100, 0),
          currentStepId: steps.find((step) => step.status === "active")?.id || steps[0]?.id || "",
          lockHours: 0
        },
        certificatePrompt: String(parsed.certificatePrompt || roadmap.certificatePrompt || "").trim().slice(0, 180),
        reminders: Array.isArray(parsed.reminders)
          ? parsed.reminders.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 5)
          : roadmap.reminders
      };
      source = "ai";
      provider = ai.provider;
      model = ai.model;
    }
  } catch (error) {
    source = "fallback";
  }

  const missionTitles = Array.isArray(roadmap.steps)
    ? roadmap.steps.map((step) => String(step?.title || "").trim()).filter(Boolean)
    : [];
  if (missionTitles.length) {
    await updateJourneyGoal(
      req.user.id,
      {
        title: roadmap.goal || studyGoal,
        domain: `Class ${classLevel}`,
        subDomain: subject,
        focus: chapter || studyGoal,
        source: "assistant"
      },
      req.user.role
    );
    await updateSkillProfile(
      req.user.id,
      {
        knownSkills: [currentLevel, subject].filter(Boolean),
        missingSkills: [chapter || studyGoal].filter(Boolean),
        readinessScore: Number(roadmap.progress?.progressPercent || 0),
        level: roadmapSkillLevel(currentLevel),
        roadmapSteps: missionTitles,
        roadmapId: `highschool:${board}:${classLevel}:${subject}:${cleanAcademicText(chapter) || studyGoal}`
      },
      req.user.role
    );
  }

  await recordHighSchoolActivity(req.user.id, "study_roadmap", {
    board,
    classLevel,
    subject,
    topics: (roadmap.steps || []).map((step) => step.title),
    pendingTopics: (roadmap.steps || []).filter((step) => !step.completed && step.status !== "completed").map((step) => step.title),
    completedTopics: (roadmap.steps || []).filter((step) => step.completed || step.status === "completed").map((step) => step.title),
    details: { goal: studyGoal, chapter, source }
  });

  res.status(200).json({
    source,
    roadmap,
    meta: {
      provider,
      model,
      aiEngine: {
        enabled: aiEngine.ok,
        reason: aiEngine.reason,
        hits: Array.isArray(aiEngine.results) ? aiEngine.results.length : 0
      }
    }
  });
});

exports.generateHighSchoolStudyAssistantAnswer = asyncHandler(async (req, res) => {
  const profile = await StudentProfile.findOne({ userId: req.user.id })
    .select("learnerStage classLevel className institutionName")
    .lean();
  if (profile?.learnerStage && profile.learnerStage !== "highschool") {
    throw new ApiError(403, "Study Assistant is available for high school learners.");
  }

  const question = String(req.body?.question || "").trim().slice(0, 500);
  if (!question) throw new ApiError(400, "question is required");
  const subject = String(req.body?.subject || "Science").trim().slice(0, 40);
  const chapter = String(req.body?.chapter || req.body?.topic || "").trim().slice(0, 100);
  const answerStyle = String(req.body?.answerStyle || "simple").trim().slice(0, 20);
  const assistantMode = req.body?.assistantMode === "general" ? "general" : "academic";
  const classLevel = String(req.body?.classLevel || profile?.classLevel || profile?.className || "High School").trim().slice(0, 40);
  const board = String(req.body?.board || req.body?.academicBoard || "SSC").trim().toUpperCase().slice(0, 20);
  const classNumber = Number(String(classLevel || "").match(/\d+/)?.[0] || 10);
  const academicTopics = collectExamAcademicTopics({
    board,
    classLevel,
    subjects: [subject],
    requestedTopics: chapter ? [chapter] : []
  });
  const lessonPlan = assistantMode === "academic" && subject
    ? findAcademicLessonPlan({ board, classLevel, subject, chapter: chapter || academicTopics[0]?.chapter || "" })
    : null;
  const lessonSnippets = Array.isArray(lessonPlan?.pageRefs)
    ? lessonPlan.pageRefs.map((item) => `Page ${item.page}: ${item.preview}`).filter(Boolean).slice(0, 5)
    : [];
  const lessonQuestions = normalizeTextbookQuestionRows(lessonPlan?.textbookQuestions || lessonPlan?.chapter?.textbookQuestions, 8);
  const aiEngine = assistantMode === "academic"
    ? await retrieveAcademicContext({
        query: `${subject} ${chapter || ""} ${question}`.trim(),
        board,
        classLevel,
        subject,
        chapter: chapter || "",
        limit: 8
      })
    : { ok: false, reason: "general_mode", results: [] };
  const engineTopicHints = buildEngineTopicHints(aiEngine.results);

  let result = buildFallbackHighSchoolStudyAssistant({ question, subject, answerStyle, classLevel, assistantMode });
  let source = "fallback";
  let provider = "local";
  let model = "deterministic";

  try {
    const prompt = [
      assistantMode === "general"
        ? "Create a high-school friendly ORIN General Assistant answer. Answer any safe everyday question directly and naturally."
        : "Create a high-school ORIN Academic Study Assistant answer.",
      "Return JSON only with this exact shape:",
      '{"title":"Photosynthesis","subject":"Biology","answerStyle":"simple|steps|exam","summary":"short answer","simpleAnswer":"easy answer","stepByStep":["step"],"examAnswer":"exam format answer","keyPoints":["point"],"notes":[{"title":"Short Notes","body":"note"}],"practiceQuestions":[{"id":"q1","question":"question","options":["A","B","C","D"],"correct":"exact option","explanation":"why"}],"dashboardTools":["Short Notes"],"progress":{"questions":120,"accuracy":85,"streakDays":7,"strongTopics":["topic"],"weakTopics":["topic"]}}',
      `Class level: ${classLevel}.`,
      `Board: ${board}.`,
      assistantMode === "general" ? "Mode: General assistant. Do not force school notes if the question is casual or broad." : `Subject: ${subject}.`,
      assistantMode === "general" ? "" : `Chapter/topic context: ${chapter || "Not specified"}.`,
      assistantMode === "general" ? "Answer style: natural, useful, concise." : `Answer style: ${answerStyle}.`,
      assistantMode === "academic"
        ? `Academic dataset topics: ${academicTopics.length ? academicTopics.map((item) => `${item.chapter} > ${item.topic}`).join("; ") : "No verified dataset topics found for this selection yet. Do not invent textbook topics."}.`
        : "",
      assistantMode === "academic" && lessonSnippets.length ? `Textbook page snippets: ${lessonSnippets.join(" | ")}.` : "",
      assistantMode === "academic" && lessonQuestions.length ? `Textbook questions: ${lessonQuestions.join(" | ")}.` : "",
      assistantMode === "academic" && engineTopicHints.length ? `Retrieved textbook snippets: ${engineTopicHints.join(" || ")}.` : "",
      `Student doubt: ${question}.`,
      assistantMode === "general"
        ? "Rules: answer the actual question, use clear high-school friendly language, no silly/random content, keep mobile text concise, include practiceQuestions only if useful."
        : "Rules: clear high-school language, no random unrelated topics, answer the actual doubt from the selected textbook context, include formula/problem steps for Maths, keep Telugu/Hindi answers in the selected language when the question is in that language, include practice questions with real options."
    ].join("\n");

    const ai = await requestAiResponse({
      role: "student",
      message: prompt,
      context: {
        assistantMode: HIGH_SCHOOL_JSON_MODE,
        feature: "highschool_study_assistant",
        studyAssistantMode: assistantMode,
        expectedFormat: "json",
        learnerStage: "highschool"
      }
    });
    const parsed = safeJsonParse(ai.answer);
    if (parsed?.summary && (parsed?.simpleAnswer || parsed?.examAnswer || Array.isArray(parsed?.stepByStep))) {
      const normalizeQuestion = (item, index) => {
        const options = Array.isArray(item?.options)
          ? item.options.map((option) => String(option || "").trim()).filter(Boolean).slice(0, 4)
          : [];
        const correct = String(item?.correct || "").trim();
        if (!hasRealPracticeOptions({ options, correct })) return null;
        return {
          id: String(item?.id || `practice-${index + 1}`).trim().slice(0, 80),
          question: String(item?.question || "Practice question").trim().slice(0, 180),
          options,
          correct,
          explanation: String(item?.explanation || "Review the concept and try again.").trim().slice(0, 220)
        };
      };
      const candidate = {
        ...result,
        title: String(parsed.title || result.title).trim().slice(0, 80),
        subject: assistantMode === "general" ? String(parsed.subject || "General").trim().slice(0, 40) : normalizeExamSubject(parsed.subject || subject) || result.subject,
        answerStyle: ["simple", "steps", "exam"].includes(String(parsed.answerStyle || answerStyle).toLowerCase())
          ? String(parsed.answerStyle || answerStyle).toLowerCase()
          : result.answerStyle,
        summary: String(parsed.summary || result.summary).trim().slice(0, 500),
        simpleAnswer: String(parsed.simpleAnswer || parsed.summary || result.simpleAnswer).trim().slice(0, 700),
        stepByStep: Array.isArray(parsed.stepByStep)
          ? parsed.stepByStep.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 8)
          : result.stepByStep,
        examAnswer: String(parsed.examAnswer || result.examAnswer).trim().slice(0, 900),
        keyPoints: Array.isArray(parsed.keyPoints)
          ? parsed.keyPoints.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 6)
          : result.keyPoints,
        notes: Array.isArray(parsed.notes)
          ? parsed.notes.map((item) => ({
              title: String(item?.title || "Note").trim().slice(0, 60),
              body: String(item?.body || "").trim().slice(0, 220)
            })).filter((item) => item.body).slice(0, 5)
          : result.notes,
        practiceQuestions: Array.isArray(parsed.practiceQuestions)
          ? parsed.practiceQuestions.map(normalizeQuestion).filter(Boolean).slice(0, 5)
          : result.practiceQuestions,
        dashboardTools: Array.isArray(parsed.dashboardTools)
          ? parsed.dashboardTools.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 6)
          : result.dashboardTools,
        progress: {
          questions: clampNumber(parsed.progress?.questions, 0, 10000, result.progress.questions),
          accuracy: clampNumber(parsed.progress?.accuracy, 0, 100, result.progress.accuracy),
          streakDays: clampNumber(parsed.progress?.streakDays, 0, 365, result.progress.streakDays),
          strongTopics: Array.isArray(parsed.progress?.strongTopics)
            ? parsed.progress.strongTopics.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 5)
            : result.progress.strongTopics,
          weakTopics: Array.isArray(parsed.progress?.weakTopics)
            ? parsed.progress.weakTopics.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 5)
            : result.progress.weakTopics
        }
      };
      const hasUsableAnswer =
        (assistantMode === "general" || hasUsefulStudyKeywordOverlap(question, candidate)) &&
        String(candidate.simpleAnswer || candidate.summary || candidate.examAnswer || "").trim().length >= 40 &&
        Array.isArray(candidate.keyPoints) &&
        candidate.keyPoints.length >= 2 &&
        (assistantMode === "general" || (Array.isArray(candidate.practiceQuestions) && candidate.practiceQuestions.length >= 1));

      if (hasUsableAnswer) {
        result = candidate;
        source = "ai";
        provider = ai.provider;
        model = ai.model;
      }
    }
  } catch (error) {
    source = "fallback";
  }

  if (assistantMode === "academic") {
    await recordHighSchoolActivity(req.user.id, "study_assistant", {
      board,
      classLevel,
      subject,
      topics: [chapter, result?.title, ...(result?.progress?.weakTopics || [])],
      weakTopics: result?.progress?.weakTopics || [],
      strongTopics: result?.progress?.strongTopics || [],
      doubts: [question],
      details: { chapter, answerStyle, source }
    });
  }

  res.status(200).json({
    source,
    result,
    meta: {
      provider,
      model,
      aiEngine: {
        enabled: aiEngine.ok,
        reason: aiEngine.reason,
        hits: Array.isArray(aiEngine.results) ? aiEngine.results.length : 0
      }
    }
  });
});

exports.getHighSchoolStudyProfile = asyncHandler(async (req, res) => {
  const profile = await StudentProfile.findOne({ userId: req.user.id })
    .select("learnerStage classLevel className institutionName")
    .lean();
  if (profile?.learnerStage && profile.learnerStage !== "highschool") {
    throw new ApiError(403, "Study Profile is available for high school learners.");
  }

  const board = normalizeBoard(req.query?.board || "SSC");
  const classLevel = normalizeClassLevel(req.query?.classLevel || profile?.classLevel || profile?.className || "10");
  const subject = normalizePlannerSubject(req.query?.subject || "Science");
  const studyProfile = await buildHighSchoolStudyProfile(req.user.id, { board, classLevel, subject });

  res.status(200).json({ profile: studyProfile });
});

exports.generateHighSchoolStudyPlanner = asyncHandler(async (req, res) => {
  const profile = await StudentProfile.findOne({ userId: req.user.id })
    .select("learnerStage classLevel className institutionName")
    .lean();
  if (profile?.learnerStage && profile.learnerStage !== "highschool") {
    throw new ApiError(403, "Study Planner is available for high school learners.");
  }

  const mode = req.body?.mode === "adaptive" ? "adaptive" : "manual";
  const subject = normalizePlannerSubject(req.body?.subject || "Science").slice(0, 50);
  const goal = String(req.body?.goal || "Improve marks and complete weekly revision").trim().slice(0, 160);
  const skills = String(req.body?.skills || "basics, revision, practice tests").trim().slice(0, 240);
  const currentLevel = String(req.body?.currentLevel || "Basics").trim().slice(0, 40);
  const timePerDay = String(req.body?.timePerDay || "1-2 hours").trim().slice(0, 40);
  const classLevel = normalizeClassLevel(req.body?.classLevel || profile?.classLevel || profile?.className || "10");
  const board = normalizeBoard(req.body?.board || req.body?.academicBoard || "SSC");
  const studyProfile = mode === "adaptive"
    ? await buildHighSchoolStudyProfile(req.user.id, { board, classLevel, subject })
    : null;
  const context = resolveStrictSsc10AcademicContext({
    board,
    classLevel,
    subjects: [subject],
    requestedTopics: mode === "adaptive" ? [] : skills.split(",").map((item) => item.trim()).filter(Boolean)
  });
  const academicTopics = context.topics;
  const adaptiveTopics = mode === "adaptive" ? profilePriorityTopics(studyProfile, academicTopics) : [];
  const plannerSkills = mode === "adaptive" && adaptiveTopics.length ? adaptiveTopics.join(", ") : skills;
  const plannerGoal = mode === "adaptive"
    ? `Personalized ${subject} repair plan from learning history`
    : goal;
  const selectedChapter = cleanAcademicText(academicTopics[0]?.chapter || plannerSkills.split(",")[0] || "");
  const lessonPlan = context.ok
    ? findAcademicLessonPlan({ board: "SSC", classLevel, subject, chapter: selectedChapter })
    : null;
  const aiEngine = context.ok
    ? await retrieveAcademicContext({
        query: `${subject} ${plannerGoal} ${plannerSkills}`,
        board,
        classLevel,
        subject,
        chapter: selectedChapter,
        limit: 8
      })
    : { ok: false, reason: "context_not_ready", results: [] };
  const engineTopicHints = buildEngineTopicHints(aiEngine.results);

  let plan = buildFallbackHighSchoolStudyPlanner({
    subject,
    goal: plannerGoal,
    skills: plannerSkills,
    currentLevel,
    timePerDay,
    classLevel,
    academicTopics: mode === "adaptive" && adaptiveTopics.length
      ? academicTopics.filter((row) => topicMatchesSelection(row, adaptiveTopics))
      : academicTopics
  });
  let source = context.ok ? "dataset_deterministic" : "data_pending";
  let provider = "local";
  let model = "deterministic";

  if (mode === "adaptive" && !studyProfile?.hasUsefulHistory) {
    return res.status(200).json({
      source: "profile_empty",
      isTopicGrounded: context.ok,
      datasetScope: context.datasetScope,
      dataPendingReason: "Take Subject Gap Analyzer first to unlock Smart Plan.",
      profile: studyProfile,
      plan: null,
      meta: { provider, model }
    });
  }

  if (context.ok) {
    try {
    const prompt = [
      "Create a high-school AI Study Planner report.",
      "Return JSON only with this exact shape:",
      '{"title":"Science Study Plan","summary":"short summary","overallProgress":25,"weeks":[{"id":"week-1","week":"Week 1","title":"Matter in Our Surroundings","status":"active|locked|completed","progress":25,"focus":"short focus","tasks":[{"id":"task-1","type":"Read|Practice|Quiz|Test","title":"Read: States of Matter","duration":"15 min","completed":true}]}],"dailyTasks":[{"id":"task-1","type":"Read","title":"Read: States of Matter","duration":"15 min","completed":true}],"analytics":[{"label":"Revision","percent":35}],"adaptivePlan":{"newFocus":"Atoms & Molecules","reason":"why this focus","updatedWeeks":[{"id":"week-1","week":"Week 1","title":"Matter in Our Surroundings","status":"completed","progress":100,"focus":"done","tasks":[]}]},"reminders":["reminder"]}',
      `Class level: ${classLevel}.`,
      `Board: ${board}.`,
      `Subject: ${subject}.`,
      `Planner mode: ${mode}.`,
      `Study goal: ${plannerGoal}.`,
      `Current skills or chapters: ${plannerSkills}.`,
      mode === "adaptive" ? `Student learning profile summary: ${JSON.stringify(studyProfile)}` : "",
      mode === "adaptive" ? `Adaptive priority order: very weak Subject Gap topics, quiz wrong-answer topics, recent doubts, Exam Strategy topics, pending Roadmap topics, then textbook order.` : "",
      `Academic dataset topics: ${academicTopics.length ? academicTopics.map((item) => `${item.chapter} > ${item.topic}`).join("; ") : "No parsed SSC 6-10 topic data found for this selection yet."}.`,
      engineTopicHints.length ? `Retrieved textbook snippets: ${engineTopicHints.join(" || ")}` : "Retrieved textbook snippets: unavailable",
      `Current level: ${currentLevel}.`,
      `Available time per day: ${timePerDay}.`,
      "Rules: create topic-grounded weekly plan only from provided Academic dataset topics. Each week must include concrete chapter/topic names, worked-example practice, and 12-MCQ quiz tasks. Never output generic lines like 'read definitions' without topic context. If no dataset topics are available, avoid fake topic names and explain that this class/subject will be added later. Keep text concise and school-safe."
    ].join("\n");

    const ai = await requestAiResponse({
      role: "student",
      message: prompt,
      context: {
        assistantMode: HIGH_SCHOOL_JSON_MODE,
        feature: "highschool_study_planner",
        expectedFormat: "json",
        learnerStage: "highschool"
      }
    });
    const parsed = safeJsonParse(ai.answer);
    if (parsed?.summary && Array.isArray(parsed?.weeks) && parsed.weeks.length) {
      const normalizeTask = (task, fallbackId) => ({
        id: String(task?.id || fallbackId).trim().slice(0, 80),
        type: String(task?.type || "Practice").trim().slice(0, 20),
        title: String(task?.title || "Practice: 10 Questions").trim().slice(0, 100),
        duration: String(task?.duration || "15 min").trim().slice(0, 30),
        completed: Boolean(task?.completed)
      });
      const normalizeWeek = (week, index) => ({
        id: String(week?.id || `week-${index + 1}`).trim().slice(0, 80),
        week: String(week?.week || `Week ${index + 1}`).trim().slice(0, 30),
        title: String(week?.title || "Core Topic").trim().slice(0, 80),
        status: ["active", "locked", "completed"].includes(String(week?.status || "").toLowerCase())
          ? String(week.status).toLowerCase()
          : index === 0 ? "active" : "locked",
        progress: clampNumber(week?.progress, 0, 100, index === 0 ? 25 : 0),
        focus: String(week?.focus || "Complete tasks, practice, and quiz.").trim().slice(0, 160),
        tasks: Array.isArray(week?.tasks)
          ? week.tasks.map((task, taskIndex) => normalizeTask(task, `week-${index + 1}-task-${taskIndex + 1}`)).slice(0, 5)
          : []
      });
      const weeks = parsed.weeks.map(normalizeWeek).filter((week) => week.title).slice(0, 6);
      const candidatePlan = {
        ...plan,
        title: String(parsed.title || plan.title).trim().slice(0, 80),
        summary: String(parsed.summary || plan.summary).trim().slice(0, 260),
        overallProgress: clampNumber(parsed.overallProgress, 0, 100, plan.overallProgress),
        weeks,
        dailyTasks: Array.isArray(parsed.dailyTasks)
          ? parsed.dailyTasks.map((task, index) => normalizeTask(task, `daily-task-${index + 1}`)).slice(0, 5)
          : weeks[0]?.tasks || plan.dailyTasks,
        analytics: Array.isArray(parsed.analytics)
          ? parsed.analytics.map((item) => ({
              label: String(item?.label || "Progress").trim().slice(0, 40),
              percent: clampNumber(item?.percent, 0, 100, 25)
            })).filter((item) => item.label).slice(0, 5)
          : plan.analytics,
        adaptivePlan: {
          newFocus: String(parsed.adaptivePlan?.newFocus || plan.adaptivePlan.newFocus).trim().slice(0, 80),
          reason: String(parsed.adaptivePlan?.reason || plan.adaptivePlan.reason).trim().slice(0, 180),
          updatedWeeks: Array.isArray(parsed.adaptivePlan?.updatedWeeks)
            ? parsed.adaptivePlan.updatedWeeks.map(normalizeWeek).slice(0, 6)
            : plan.adaptivePlan.updatedWeeks
        },
        reminders: Array.isArray(parsed.reminders)
          ? parsed.reminders.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 5)
          : plan.reminders
      };
      if (hasTopicGroundedPlanner(candidatePlan.weeks, academicTopics)) {
        plan = candidatePlan;
        source = "dataset_ai";
        provider = ai.provider;
        model = ai.model;
      }
    }
  } catch (error) {
    source = "dataset_deterministic";
  }
  }
  if (!context.ok) {
    plan = {
      ...plan,
      title: `${normalizeExamSubject(subject) || subject || "Subject"} Study Plan`,
      summary: context.dataPendingReason || "Topic-aware study plan is pending for this board/class selection.",
      overallProgress: 0,
      weeks: [],
      dailyTasks: [],
      analytics: [],
      adaptivePlan: {
        newFocus: "Pending dataset verification",
        reason: context.dataPendingReason || "Please select an SSC class from 6 to 10 with scanned subject data.",
        updatedWeeks: []
      },
      reminders: ["Select SSC board and Classes 6-10 to unlock extracted-topic planning."]
    };
  } else if (lessonPlan) {
    plan = attachLessonDetailsToStudyPlan({
      plan,
      lessonPlan,
      subject,
      chapter: selectedChapter,
      academicTopics
    });
  }

  if (plan) {
    await recordHighSchoolActivity(req.user.id, "study_planner", {
      board,
      classLevel,
      subject,
      topics: (plan.weeks || []).map((week) => week.title),
      pendingTopics: (plan.weeks || []).filter((week) => week.status !== "completed").map((week) => week.title),
      completedTopics: (plan.weeks || []).filter((week) => week.status === "completed").map((week) => week.title),
      details: { mode, goal: plannerGoal, source }
    });
  }

  res.status(200).json({
    source,
    isTopicGrounded: context.ok,
    datasetScope: context.datasetScope,
    dataPendingReason: context.dataPendingReason || undefined,
    profile: studyProfile || undefined,
    plan,
    meta: {
      provider,
      model,
      aiEngine: {
        enabled: aiEngine.ok,
        reason: aiEngine.reason,
        hits: Array.isArray(aiEngine.results) ? aiEngine.results.length : 0
      }
    }
  });
});

exports.generateHighSchoolCareerExplorer = asyncHandler(async (req, res) => {
  const profile = await StudentProfile.findOne({ userId: req.user.id })
    .select("learnerStage classLevel className careerGoals")
    .lean();
  if (profile?.learnerStage && profile.learnerStage !== "highschool") {
    throw new ApiError(403, "Career Explorer is available for high school learners.");
  }

  const interest = String(req.body?.interest || "Science").trim().slice(0, 60);
  const strengths = String(req.body?.strengths || "biology, problem solving, helping people").trim().slice(0, 240);
  const academicSubjects = Array.isArray(req.body?.academicSubjects)
    ? req.body.academicSubjects.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 6)
    : [];
  const classLevel = String(req.body?.classLevel || profile?.classLevel || profile?.className || "High School").trim().slice(0, 40);
  const board = String(req.body?.board || req.body?.academicBoard || "SSC").trim().toUpperCase().slice(0, 20);
  const mappedSubjects = Array.from(
    new Set((academicSubjects.length ? academicSubjects : [interest]).map((item) => normalizeExamSubject(item)).filter(Boolean))
  ).slice(0, 6);
  const academicTopics = collectExamAcademicTopics({
    board,
    classLevel,
    subjects: mappedSubjects,
    requestedTopics: []
  });
  const aiEngine = await retrieveAcademicContext({
    query: `${interest} career path ${strengths} ${mappedSubjects.join(" ")}`.trim(),
    board,
    classLevel,
    subject: mappedSubjects[0] || interest,
    chapter: "",
    limit: 6
  });
  const engineTopicHints = buildEngineTopicHints(aiEngine.results);

  let explorer = buildFallbackHighSchoolCareerExplorer({ interest, strengths, classLevel });
  let source = "fallback";
  let provider = "local";
  let model = "deterministic";

  try {
    const prompt = [
      "Create a high-school AI Career Explorer report.",
      "Return JSON only with this exact shape:",
      '{"greeting":"Hi, Student!","summary":"short personalized summary","categories":["Science"],"careers":[{"title":"Doctor","field":"Healthcare & Medical","subjects":["Biology"],"skills":["Focus"],"nextStep":"next step","futureScope":"scope","fitScore":92,"salaryRange":"High growth"}],"featuredCareer":{"title":"Doctor","field":"Healthcare & Medical","subjects":["Biology"],"skills":["Focus"],"nextStep":"next step","futureScope":"scope","fitScore":92,"salaryRange":"High growth","overview":"career overview","workEnvironment":"Dynamic","jobSatisfaction":"Very high","roadmap":["step"],"skillRatings":[{"skill":"Communication","level":"High","percent":85}]},"compare":[{"title":"Doctor","factor":"Healthcare","salary":"High","growth":"High","satisfaction":"Very high","workLifeBalance":"Medium"}],"savedCareers":[{"title":"Doctor","field":"Healthcare"}],"progress":{"profileCompletion":72,"completed":["Interest Areas"],"pending":["Career Roadmap"]},"assistantPrompts":["prompt"],"subjectsCovered":["Physics"]}',
      `Class level: ${classLevel}.`,
      `Board: ${board}.`,
      `Interest/category: ${interest}.`,
      `Student strengths/interests: ${strengths}.`,
      `Current school subjects/favorites: ${academicSubjects.join(", ") || "Not specified"}.`,
      `Academic dataset topics: ${academicTopics.length ? academicTopics.map((item) => `${item.subject} > ${item.chapter} > ${item.topic}`).join("; ") : "No verified class-topic map available for this selection yet."}.`,
      engineTopicHints.length ? `Retrieved textbook snippets for academic alignment: ${engineTopicHints.join(" || ")}` : "Retrieved textbook snippets: unavailable.",
      `Existing career goal: ${profile?.careerGoals || "Not specified"}.`,
      "Rules: all suggestions must be school-safe, age-appropriate, India-aware where useful, and based on selected interest/strengths plus current academics. Do not return random unrelated careers."
    ].join("\n");

    const ai = await requestAiResponse({
      role: "student",
      message: prompt,
      context: {
        assistantMode: HIGH_SCHOOL_JSON_MODE,
        feature: "highschool_career_explorer",
        expectedFormat: "json",
        learnerStage: "highschool"
      }
    });
    const parsed = safeJsonParse(ai.answer);
    if (parsed?.summary && Array.isArray(parsed?.careers) && parsed.careers.length) {
      const normalizeCareer = (career, index) => ({
        title: String(career?.title || `Career ${index + 1}`).trim().slice(0, 80),
        field: String(career?.field || "Career Field").trim().slice(0, 80),
        subjects: Array.isArray(career?.subjects) ? career.subjects.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 5) : [],
        skills: Array.isArray(career?.skills) ? career.skills.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 5) : [],
        nextStep: String(career?.nextStep || "Explore subjects and build basics.").trim().slice(0, 180),
        futureScope: String(career?.futureScope || "Good long-term career scope.").trim().slice(0, 220),
        fitScore: clampNumber(career?.fitScore, 0, 100, 75),
        salaryRange: String(career?.salaryRange || "Growth depends on skills and experience.").trim().slice(0, 80)
      });
      const careers = parsed.careers.map(normalizeCareer).filter((career) => career.title).slice(0, 8);
      const baseFeatured = parsed.featuredCareer || careers[0] || explorer.featuredCareer;
      explorer = {
        ...explorer,
        greeting: String(parsed.greeting || explorer.greeting).trim().slice(0, 60),
        summary: String(parsed.summary || explorer.summary).trim().slice(0, 260),
        categories: Array.isArray(parsed.categories) ? parsed.categories.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 10) : explorer.categories,
        careers,
        featuredCareer: {
          ...normalizeCareer(baseFeatured, 0),
          overview: String(baseFeatured?.overview || explorer.featuredCareer.overview).trim().slice(0, 260),
          workEnvironment: String(baseFeatured?.workEnvironment || explorer.featuredCareer.workEnvironment).trim().slice(0, 80),
          jobSatisfaction: String(baseFeatured?.jobSatisfaction || explorer.featuredCareer.jobSatisfaction).trim().slice(0, 80),
          roadmap: Array.isArray(baseFeatured?.roadmap) ? baseFeatured.roadmap.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 8) : explorer.featuredCareer.roadmap,
          skillRatings: Array.isArray(baseFeatured?.skillRatings)
            ? baseFeatured.skillRatings.map((item) => ({
                skill: String(item?.skill || "Skill").trim().slice(0, 60),
                level: String(item?.level || "Medium").trim().slice(0, 30),
                percent: clampNumber(item?.percent, 0, 100, 70)
              })).filter((item) => item.skill).slice(0, 6)
            : explorer.featuredCareer.skillRatings
        },
        compare: Array.isArray(parsed.compare)
          ? parsed.compare.map((item) => ({
              title: String(item?.title || "Career").trim().slice(0, 80),
              factor: String(item?.factor || "Field").trim().slice(0, 80),
              salary: String(item?.salary || "Medium").trim().slice(0, 80),
              growth: String(item?.growth || "High").trim().slice(0, 60),
              satisfaction: String(item?.satisfaction || "High").trim().slice(0, 60),
              workLifeBalance: String(item?.workLifeBalance || "Good").trim().slice(0, 60)
            })).slice(0, 3)
          : explorer.compare,
        savedCareers: Array.isArray(parsed.savedCareers)
          ? parsed.savedCareers.map((item) => ({
              title: String(item?.title || "").trim().slice(0, 80),
              field: String(item?.field || "").trim().slice(0, 80)
            })).filter((item) => item.title).slice(0, 5)
          : explorer.savedCareers,
        progress: {
          profileCompletion: clampNumber(parsed.progress?.profileCompletion, 0, 100, explorer.progress.profileCompletion),
          completed: Array.isArray(parsed.progress?.completed) ? parsed.progress.completed.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 6) : explorer.progress.completed,
          pending: Array.isArray(parsed.progress?.pending) ? parsed.progress.pending.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 6) : explorer.progress.pending
        },
        assistantPrompts: Array.isArray(parsed.assistantPrompts) ? parsed.assistantPrompts.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 5) : explorer.assistantPrompts,
        subjectsCovered: Array.isArray(parsed.subjectsCovered) ? parsed.subjectsCovered.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 14) : explorer.subjectsCovered
      };
      source = "ai";
      provider = ai.provider;
      model = ai.model;
    }
  } catch (error) {
    source = "fallback";
  }

  res.status(200).json({
    source,
    explorer,
    meta: {
      provider,
      model,
      aiEngine: {
        enabled: aiEngine.ok,
        reason: aiEngine.reason,
        hits: Array.isArray(aiEngine.results) ? aiEngine.results.length : 0
      }
    }
  });
});

exports.generateHighSchoolExamStrategy = asyncHandler(async (req, res) => {
  const profile = await StudentProfile.findOne({ userId: req.user.id })
    .select("learnerStage classLevel className institutionName")
    .lean();
  if (profile?.learnerStage && profile.learnerStage !== "highschool") {
    throw new ApiError(403, "Exam Strategy Builder is available for high school learners.");
  }

  const examName = String(req.body?.examName || "Half Yearly Exam").trim().slice(0, 80);
  const examDate = String(req.body?.examDate || "").trim().slice(0, 40);
  const classLevel = String(req.body?.classLevel || profile?.classLevel || profile?.className || "Class 10").trim().slice(0, 40);
  const board = String(req.body?.board || req.body?.academicBoard || "SSC").trim().toUpperCase().slice(0, 20);
  const syllabus = String(req.body?.syllabus || "School syllabus").trim().slice(0, 120);
  const rawSubjects = Array.isArray(req.body?.subjects) ? req.body.subjects : [];
  const subjects = Array.from(new Set(rawSubjects.map(normalizeExamSubject).filter(Boolean))).slice(0, 8);
  const selectedTopics = Array.isArray(req.body?.topics) ? req.body.topics.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 40) : [];
  const context = resolveStrictSsc10AcademicContext({
    board,
    classLevel,
    subjects: subjects.length ? subjects : EXAM_SUBJECT_POOL.slice(0, 5),
    requestedTopics: selectedTopics
  });
  const academicTopics = context.topics;

  const strategySubjects = subjects.length ? subjects : EXAM_SUBJECT_POOL.slice(0, 5);
  const topicUnits = buildScopedExamTopicUnits({
    subjects: strategySubjects,
    selectedTopics,
    academicTopics
  });
  const aiEngine = context.ok
    ? await retrieveAcademicContext({
        query: `${examName} ${syllabus} ${strategySubjects.join(", ")} ${selectedTopics.join(", ")}`,
        board,
        classLevel,
        subject: strategySubjects[0] || "",
        chapter: selectedTopics[0] || "",
        limit: 10
      })
    : { ok: false, reason: "context_not_ready", results: [] };
  const engineTopicHints = buildEngineTopicHints(aiEngine.results);
  let strategy = context.ok
    ? buildDatasetExamStrategy({ examName, examDate, classLevel, syllabus, subjects: strategySubjects, selectedTopics, academicTopics })
    : buildFallbackExamStrategy({ examName, examDate, classLevel, syllabus, subjects: strategySubjects, academicTopics });
  let source = context.ok ? "dataset_deterministic" : "data_pending";
  let provider = "local";
  let model = "deterministic";

  if (context.ok) {
    try {
    const prompt = [
      "Create an AI-powered high-school Exam Strategy Builder report.",
      "Return JSON only with this exact shape:",
      '{"expectedScore":85,"summary":"short strategy","priorityCounts":{"high":0,"medium":0,"low":0},"timeAllocation":[{"subject":"Mathematics","percent":28}],"highPriorityTopics":[{"subject":"Mathematics","topic":"Quadratic Equations","priority":"high|medium|low","weightageMarks":8,"reason":"why important","tasks":["task"]}],"weeklyPlan":[{"week":"Week 1","title":"title","tasks":["task"]}],"reminders":["reminder"]}',
      `Exam: ${examName}.`,
      `Exam date: ${examDate || "Not specified"}.`,
      `Board: ${board}.`,
      `Class: ${classLevel}.`,
      `Syllabus: ${syllabus}.`,
      `Allowed subjects only: ${strategySubjects.join(", ")}.`,
      `Selected focus topics only: ${selectedTopics.length ? selectedTopics.join(", ") : "all provided topics"}.`,
      `Academic dataset topics to use: ${topicUnits.length ? topicUnits.map((item) => `${item.subject} > ${item.chapter} > ${item.topic}`).join("; ") : academicTopics.map((item) => `${item.subject} > ${item.chapter} > ${item.topic}`).join("; ") || "No enriched topics found for this class/subject yet."}.`,
      engineTopicHints.length ? `Retrieved textbook snippets: ${engineTopicHints.join(" || ")}` : "Retrieved textbook snippets: unavailable",
      selectedTopics.length ? `Student selected focus topics: ${selectedTopics.join(", ")}.` : "",
      "Rules: every highPriorityTopics item and every weeklyPlan task must stay inside the allowed subjects and selected focus topics. Do not include English, Personality Development, vocabulary, lesson reading, generic formulas, or any other subject unless it is explicitly allowed. Use concrete chapter/topic names from Academic dataset topics. If you cannot do that, return a minimal plan using only the provided topic names."
    ].join("\n");

    const ai = await requestAiResponse({
      role: "student",
      message: prompt,
      context: {
        assistantMode: HIGH_SCHOOL_JSON_MODE,
        feature: "highschool_exam_strategy",
        expectedFormat: "json",
        learnerStage: "highschool",
        classLevel,
        subjects,
        academicTopics
      }
    });
    const parsed = safeJsonParse(ai.answer);
    if (parsed?.summary && Array.isArray(parsed?.highPriorityTopics) && Array.isArray(parsed?.weeklyPlan)) {
      const candidateStrategy = {
        ...strategy,
        expectedScore: clampNumber(parsed.expectedScore, 40, 98, strategy.expectedScore),
        summary: String(parsed.summary || strategy.summary).slice(0, 260),
        priorityCounts: {
          high: clampNumber(parsed.priorityCounts?.high, 0, 100, strategy.priorityCounts.high),
          medium: clampNumber(parsed.priorityCounts?.medium, 0, 100, strategy.priorityCounts.medium),
          low: clampNumber(parsed.priorityCounts?.low, 0, 100, strategy.priorityCounts.low)
        },
        timeAllocation: parsed.timeAllocation
          .map((item) => ({
            subject: normalizeExamSubject(item?.subject),
            percent: clampNumber(item?.percent, 5, 60, 15)
          }))
          .filter((item) => item.subject)
          .slice(0, 8),
        highPriorityTopics: parsed.highPriorityTopics
          .map((item) => ({
            subject: normalizeExamSubject(item?.subject),
            topic: String(item?.topic || "Important Topic").trim().slice(0, 80),
            priority: ["high", "medium", "low"].includes(String(item?.priority || "").toLowerCase())
              ? String(item.priority).toLowerCase()
              : "high",
            weightageMarks: clampNumber(item?.weightageMarks, 1, 20, 5),
            reason: String(item?.reason || "Important for exam scoring.").trim().slice(0, 160),
            tasks: Array.isArray(item?.tasks)
              ? item.tasks.map((task) => String(task || "").trim()).filter(Boolean).slice(0, 3)
              : []
          }))
          .filter((item) => item.subject && item.topic)
          .slice(0, 16),
        weeklyPlan: parsed.weeklyPlan
          .map((item, index) => ({
            week: String(item?.week || `Week ${index + 1}`).trim().slice(0, 40),
            title: String(item?.title || "Study Focus").trim().slice(0, 80),
            tasks: Array.isArray(item?.tasks)
              ? item.tasks.map((task) => String(task || "").trim()).filter(Boolean).slice(0, 5)
              : []
          }))
          .filter((item) => item.tasks.length)
          .slice(0, 5),
        reminders: Array.isArray(parsed.reminders)
          ? parsed.reminders.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 5)
          : strategy.reminders
      };
      if (isExamStrategyScopeSafe(candidateStrategy, { subjects: strategySubjects, selectedTopics, topicUnits })) {
        strategy = candidateStrategy;
        source = "dataset_ai";
        provider = ai.provider;
        model = ai.model;
      }
    }
  } catch (error) {
    source = "dataset_deterministic";
  }
  }

  await Promise.all(strategySubjects.map((activitySubject) => recordHighSchoolActivity(req.user.id, "exam_strategy", {
    board,
    classLevel,
    subject: activitySubject,
    topics: strategy.highPriorityTopics.filter((item) => normalizePlannerSubject(item.subject) === activitySubject).map((item) => item.topic),
    selectedTopics: selectedTopics.length
      ? selectedTopics
      : strategy.highPriorityTopics.filter((item) => normalizePlannerSubject(item.subject) === activitySubject).map((item) => item.topic),
    details: { examName, examDate, source, targetScore: req.body?.targetScore, timePerDay: req.body?.timePerDay }
  })));

  res.status(200).json({
    source,
    isTopicGrounded: context.ok,
    datasetScope: context.datasetScope,
    dataPendingReason: context.dataPendingReason || undefined,
    strategy: {
      ...strategy,
      importantQuestions,
      questionExtractionStatus: importantQuestions.available ? "available" : "pending"
    },
    meta: {
      provider,
      model,
      aiEngine: {
        enabled: aiEngine.ok,
        reason: aiEngine.reason,
        hits: Array.isArray(aiEngine.results) ? aiEngine.results.length : 0
      }
    }
  });
});

exports.generateHighSchoolSchoolProjects = asyncHandler(async (req, res) => {
  const profile = await StudentProfile.findOne({ userId: req.user.id })
    .select("learnerStage classLevel className institutionName")
    .lean();
  if (profile?.learnerStage && profile.learnerStage !== "highschool") {
    throw new ApiError(403, "School Projects is available for high school learners.");
  }

  const subject = String(req.body?.subject || "Science").trim().slice(0, 60);
  const chapter = String(req.body?.chapter || req.body?.topic || "Core Concepts").trim().slice(0, 100);
  const goal = String(req.body?.goal || "Create a school-ready project with proof").trim().slice(0, 160);
  const classLevel = String(req.body?.classLevel || profile?.classLevel || profile?.className || "10").trim().slice(0, 40);
  const difficulty = String(req.body?.difficulty || "Medium").trim().slice(0, 30);
  const board = String(req.body?.board || req.body?.academicBoard || "SSC").trim().toUpperCase().slice(0, 20);
  const academicTopics = collectExamAcademicTopics({
    board,
    classLevel,
    subjects: [subject],
    requestedTopics: chapter ? [chapter] : []
  });

  let result = buildFallbackHighSchoolSchoolProjects({ subject, chapter, goal, classLevel, difficulty });
  let source = "fallback";
  let provider = "local";
  let model = "deterministic";

  try {
    const prompt = [
      "Create high-school School Projects like After 12 Project Ideas, but academic and class/subject/chapter based.",
      "Return JSON only with this exact shape:",
      '{"title":"Science School Projects","summary":"short summary","projects":[{"id":"project-1","title":"Working model","type":"Model|Research|Presentation|Experiment","difficulty":"Medium","duration":"2 days","why":"why useful","materials":["item"],"steps":["step"],"outcome":"learning outcome","proofRequired":true,"teacherFeedbackPrompt":"short prompt"}]}',
      `Class: ${classLevel}.`,
      `Board: ${board}.`,
      `Subject: ${subject}.`,
      `Chapter/topic: ${chapter}.`,
      `Academic dataset topics: ${academicTopics.length ? academicTopics.map((item) => `${item.chapter} > ${item.topic}`).join("; ") : "No parsed SSC 6-10 topic data found for this selection yet."}.`,
      `Goal: ${goal}.`,
      `Difficulty: ${difficulty}.`,
      "Rules: keep projects school-safe, low-cost, syllabus-linked, and proof-friendly. Prioritize Academic dataset topics when available. Do not invent fake syllabus topics or adult startup/project content."
    ].join("\n");

    const ai = await requestAiResponse({
      role: "student",
      message: prompt,
      context: {
        assistantMode: HIGH_SCHOOL_JSON_MODE,
        feature: "highschool_school_projects",
        expectedFormat: "json",
        learnerStage: "highschool"
      }
    });
    const parsed = safeJsonParse(ai.answer);
    if (parsed?.summary && Array.isArray(parsed?.projects) && parsed.projects.length) {
      result = {
        ...result,
        title: String(parsed.title || result.title).trim().slice(0, 100),
        summary: String(parsed.summary || result.summary).trim().slice(0, 260),
        projects: parsed.projects.map((item, index) => ({
          id: String(item?.id || `school-project-${index + 1}`).trim().slice(0, 80),
          title: String(item?.title || "School Project").trim().slice(0, 100),
          type: String(item?.type || "Project").trim().slice(0, 40),
          difficulty: String(item?.difficulty || difficulty).trim().slice(0, 30),
          duration: String(item?.duration || "1-2 days").trim().slice(0, 40),
          why: String(item?.why || "This helps improve concept clarity.").trim().slice(0, 180),
          materials: Array.isArray(item?.materials) ? item.materials.map((x) => String(x || "").trim()).filter(Boolean).slice(0, 6) : [],
          steps: Array.isArray(item?.steps) ? item.steps.map((x) => String(x || "").trim()).filter(Boolean).slice(0, 7) : [],
          outcome: String(item?.outcome || "You can explain the topic clearly.").trim().slice(0, 180),
          proofRequired: true,
          teacherFeedbackPrompt: String(item?.teacherFeedbackPrompt || "Submit this to your teacher/mentor for feedback.").trim().slice(0, 160)
        })).filter((item) => item.title).slice(0, 5)
      };
      source = "ai";
      provider = ai.provider;
      model = ai.model;
    }
  } catch {
    source = "fallback";
  }

  res.status(200).json({ source, result, meta: { provider, model } });
});

exports.getHighSchoolAssistantHistory = asyncHandler(async (req, res) => {
  const summaries = await buildConversationSummaries(req.user.id, { "context.feature": "highschool_chat_assistant" });
  res.status(200).json(summaries);
});

exports.getHighSchoolAssistantConversationMessages = asyncHandler(async (req, res) => {
  const { conversationId } = req.params;
  await ensureConversationAccessScoped(req.user.id, conversationId, { "context.feature": "highschool_chat_assistant" });

  const logs = await AiChatLog.find({
    userId: req.user.id,
    conversationId,
    "context.feature": "highschool_chat_assistant"
  })
    .select("conversationId conversationTitle assistantMode pinned prompt response provider model createdAt context")
    .sort({ createdAt: 1 })
    .lean();

  res.status(200).json({
    conversationId,
    messages: logs.map((item) => ({
      id: item._id,
      prompt: item.prompt,
      response: item.response,
      createdAt: item.createdAt
    })),
    context: logs[0]?.context?.academicContext || null
  });
});

exports.updateHighSchoolAssistantConversation = asyncHandler(async (req, res) => {
  const { conversationId } = req.params;
  await ensureConversationAccessScoped(req.user.id, conversationId, { "context.feature": "highschool_chat_assistant" });

  const update = {};
  if (Object.prototype.hasOwnProperty.call(req.body, "title")) {
    update.conversationTitle = String(req.body.title || "").trim().slice(0, 120);
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "pinned")) {
    update.pinned = Boolean(req.body.pinned);
  }

  await AiChatLog.updateMany(
    { userId: req.user.id, conversationId, "context.feature": "highschool_chat_assistant" },
    { $set: update }
  );

  const summaries = await buildConversationSummaries(req.user.id, { "context.feature": "highschool_chat_assistant" });
  const summary = summaries.find((item) => item.conversationId === conversationId) || null;
  res.status(200).json({ message: "Conversation updated", conversation: summary });
});

exports.deleteHighSchoolAssistantConversation = asyncHandler(async (req, res) => {
  const { conversationId } = req.params;
  await ensureConversationAccessScoped(req.user.id, conversationId, { "context.feature": "highschool_chat_assistant" });
  await AiChatLog.deleteMany({ userId: req.user.id, conversationId, "context.feature": "highschool_chat_assistant" });
  res.status(200).json({ message: "Conversation deleted" });
});

exports.chatWithHighSchoolAssistant = asyncHandler(async (req, res) => {
  const profile = await StudentProfile.findOne({ userId: req.user.id })
    .select("learnerStage classLevel className institutionName")
    .lean();
  if (profile?.learnerStage && profile.learnerStage !== "highschool") {
    throw new ApiError(403, "High school assistant is available for high school learners.");
  }

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const entitlement = await getSubscriptionEntitlement(req.user.id);
  const dailyLimit = entitlement.aiChatDailyLimit || aiChatDailyLimit;
  const usedToday = await AiChatLog.countDocuments({
    userId: req.user.id,
    createdAt: { $gte: startOfDay },
    "context.feature": "highschool_chat_assistant"
  });
  if (usedToday >= dailyLimit) {
    throw new ApiError(429, `Daily AI limit reached (${dailyLimit}). Try again tomorrow.`);
  }

  const message = String(req.body?.message || "").trim().slice(0, 4000);
  if (!message) throw new ApiError(400, "message is required");
  const assistantMode = req.body?.assistantMode === "academic" ? "academic" : "general";
  const conversationId = String(req.body?.conversationId || new mongoose.Types.ObjectId().toString()).trim();
  if (!conversationId) throw new ApiError(400, "conversationId is required");

  const classLevel = String(req.body?.academicContext?.classLevel || profile?.classLevel || profile?.className || "10")
    .trim()
    .slice(0, 30);
  const board = String(req.body?.academicContext?.board || req.body?.academicContext?.academicBoard || "SSC")
    .trim()
    .toUpperCase()
    .slice(0, 20);
  const subject = String(req.body?.academicContext?.subject || "").trim().slice(0, 80);
  const chapter = String(req.body?.academicContext?.chapter || "").trim().slice(0, 120);
  const isGreeting = /^(hi|hii|hello|hey|namaste|good\s*(morning|afternoon|evening)|yo)[\s!.]*$/i.test(message);
  const classNumber = Number(String(classLevel || "").match(/\d+/)?.[0] || 10);
  let academicSummary = null;
  let chatLessonPlan = null;
  if (assistantMode === "academic" && subject && classNumber >= 6 && classNumber <= 10) {
    try {
      academicSummary = summarizeAcademicContext({
        board,
        classNumber,
        subject,
        chapterName: chapter || undefined
      });
      chatLessonPlan = findAcademicLessonPlan({ board, classLevel, subject, chapter: chapter || academicSummary?.selectedChapter?.chapter_name || "" });
    } catch {
      academicSummary = null;
      chatLessonPlan = null;
    }
  }
  const chatLessonSnippets = Array.isArray(chatLessonPlan?.pageRefs)
    ? chatLessonPlan.pageRefs.map((item) => `Page ${item.page}: ${item.preview}`).filter(Boolean).slice(0, 5)
    : [];
  const chatTextbookQuestions = normalizeTextbookQuestionRows(chatLessonPlan?.textbookQuestions || chatLessonPlan?.chapter?.textbookQuestions, 6);
  const aiEngine = assistantMode === "academic"
    ? await retrieveAcademicContext({
        query: `${subject} ${chapter || ""} ${message}`.trim(),
        board,
        classLevel,
        subject,
        chapter: chapter || "",
        limit: 8
      })
    : { ok: false, reason: "general_mode", results: [] };
  const engineTopicHints = buildEngineTopicHints(aiEngine.results);

  let existingConversation = null;
  if (req.body?.conversationId) {
    existingConversation = await AiChatLog.findOne({
      userId: req.user.id,
      conversationId,
      "context.feature": "highschool_chat_assistant"
    })
      .select("conversationTitle pinned")
      .lean();
    if (!existingConversation) throw new ApiError(404, "Conversation not found");
  }

  const prompt = [
    assistantMode === "general"
      ? "You are ORIN High School General Assistant. Answer naturally, clearly, and directly to user prompt."
      : "You are ORIN High School Academic Assistant. Give concise, exam-useful answer grounded in class/subject/chapter context.",
    `Mode: ${assistantMode}`,
    `Board: ${board}`,
    `Class: ${classLevel}`,
    `Subject: ${subject || "Not specified"}`,
    `Chapter: ${chapter || "Not specified"}`,
    assistantMode === "academic"
      ? `Academic dataset topics: ${academicSummary?.syllabusPreview?.length ? academicSummary.syllabusPreview.map((item) => `${item.chapter_name}${item.topics?.length ? ` (${item.topics.join(", ")})` : ""}`).join("; ") : "No parsed SSC 6-10 topic data found for this selection yet."}`
      : "",
    assistantMode === "academic" && chatLessonSnippets.length ? `Textbook page snippets: ${chatLessonSnippets.join(" | ")}` : "",
    assistantMode === "academic" && chatTextbookQuestions.length ? `Textbook questions: ${chatTextbookQuestions.join(" | ")}` : "",
    assistantMode === "academic" && engineTopicHints.length ? `Retrieved textbook snippets: ${engineTopicHints.join(" || ")}` : "",
    `Student prompt: ${message}`,
    assistantMode === "academic"
      ? "Rules: stay on-topic, use clear headings/bullets, include key points and one short exam tip. For Maths, show formulas/equations/problem steps. For Telugu/Hindi, keep the answer in the selected language when the prompt uses that language."
      : "Rules: answer the actual prompt without random filler."
  ].join("\n");

  let answer = "";
  let source = "fallback";
  let provider = "local";
  let model = "deterministic";

  if (isGreeting) {
    answer = buildHighSchoolAssistantFallbackAnswer({ message, assistantMode, classLevel, subject, chapter });
  } else {
  try {
    const ai = await requestAiResponse({
      role: "student",
      message: prompt,
      context: {
        feature: "highschool_chat_assistant",
        assistantMode,
        learnerStage: "highschool"
      }
    });
    const candidate = String(ai.answer || "").trim();
    const hasEnoughText = assistantMode === "general" ? candidate.length >= 8 : candidate.length >= 60;
    const isRelevant = assistantMode === "general" || hasUsefulStudyKeywordOverlap(message, { summary: candidate, simpleAnswer: candidate, keyPoints: [candidate], practiceQuestions: [{ options: ["A", "B", "C", "D"], correct: "A" }] });

    if (hasEnoughText && isRelevant) {
      answer = candidate;
      source = "ai";
      provider = ai.provider;
      model = ai.model;
    } else {
      answer = buildHighSchoolAssistantFallbackAnswer({ message, assistantMode, classLevel, subject, chapter });
    }
  } catch {
    answer = buildHighSchoolAssistantFallbackAnswer({ message, assistantMode, classLevel, subject, chapter });
  }
  }

  const context = {
    feature: "highschool_chat_assistant",
    assistantMode,
    academicContext: { board, classLevel, subject, chapter },
    aiEngine: {
      enabled: aiEngine.ok,
      reason: aiEngine.reason,
      hits: Array.isArray(aiEngine.results) ? aiEngine.results.length : 0
    },
    source
  };

  await AiChatLog.create({
    userId: req.user.id,
    role: req.user.role,
    conversationId,
    conversationTitle: String(existingConversation?.conversationTitle || "").trim() || toConversationTitle(message),
    assistantMode,
    pinned: Boolean(existingConversation?.pinned),
    provider,
    model,
    prompt: message,
    response: answer,
    context
  });

  if (assistantMode === "academic" && subject) {
    await recordHighSchoolActivity(req.user.id, "study_assistant", {
      board,
      classLevel,
      subject,
      topics: [chapter],
      doubts: [message],
      details: { chapter, source, conversationId }
    });
  }

  res.status(200).json({
    answer,
    conversationId,
    source,
    provider,
    model,
    meta: {
      isPremium: entitlement.isPremium,
      planId: entitlement.planId,
      dailyLimit,
      remainingToday: Math.max(dailyLimit - usedToday - 1, 0),
      aiEngine: {
        enabled: aiEngine.ok,
        reason: aiEngine.reason,
        hits: Array.isArray(aiEngine.results) ? aiEngine.results.length : 0
      }
    }
  });
});

exports.getMyAiHistory = asyncHandler(async (req, res) => {
  const summaries = await buildConversationSummaries(req.user.id);
  res.status(200).json(summaries);
});

exports.getAiConversationMessages = asyncHandler(async (req, res) => {
  const { conversationId } = req.params;
  await ensureConversationAccess(req.user.id, conversationId);

  const logs = await AiChatLog.find({ userId: req.user.id, conversationId })
    .select("conversationId conversationTitle assistantMode pinned prompt response provider model createdAt")
    .sort({ createdAt: 1 })
    .lean();

  res.status(200).json({
    conversationId,
    messages: logs.map((item) => ({
      id: item._id,
      prompt: item.prompt,
      response: item.response,
      createdAt: item.createdAt
    }))
  });
});

exports.updateAiConversation = asyncHandler(async (req, res) => {
  const { conversationId } = req.params;
  await ensureConversationAccess(req.user.id, conversationId);

  const update = {};
  if (Object.prototype.hasOwnProperty.call(req.body, "title")) {
    update.conversationTitle = String(req.body.title || "").trim().slice(0, 120);
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "pinned")) {
    update.pinned = Boolean(req.body.pinned);
  }

  await AiChatLog.updateMany({ userId: req.user.id, conversationId }, { $set: update });
  const summaries = await buildConversationSummaries(req.user.id);
  const summary = summaries.find((item) => item.conversationId === conversationId) || null;

  res.status(200).json({
    message: "Conversation updated",
    conversation: summary
  });
});

exports.deleteAiConversation = asyncHandler(async (req, res) => {
  const { conversationId } = req.params;
  await ensureConversationAccess(req.user.id, conversationId);
  await AiChatLog.deleteMany({ userId: req.user.id, conversationId });
  res.status(200).json({ message: "Conversation deleted" });
});
