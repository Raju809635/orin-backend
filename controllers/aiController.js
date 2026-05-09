const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const AiChatLog = require("../models/AiChatLog");
const { aiChatDailyLimit } = require("../config/env");
const { getSubscriptionEntitlement } = require("../services/subscriptionService");
const { requestAiResponse } = require("../services/aiService");
const { summarizeAcademicContext, getSubjectRecord, getSubjectRecordForClass } = require("../services/academicService");
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
        .replace(/[^a-z0-9\s]/g, " ")
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
  return HIGH_SCHOOL_SUBJECTS.find((item) => item.toLowerCase() === text.toLowerCase()) || "Mathematics";
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

  return {
    id: String(item?.id || `${subject.toLowerCase()}-${index + 1}`).trim().slice(0, 80),
    subject,
    topic: String(item?.topic || "Core Concept").trim().slice(0, 80),
    question: String(item?.question || "").trim().slice(0, 500),
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
    extractionStatus,
    verificationStatus,
    message: metadata.extraction_message || metadata.source_note || ""
  };
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

function buildFallbackHighSchoolStudyPlanner({ subject, goal, skills, currentLevel, timePerDay, classLevel }) {
  const subjectName = normalizeExamSubject(subject) || "Science";
  const skillList = String(skills || "basics, revision, practice tests")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 6);
  const topics = skillList.length ? skillList : ["basics", "revision", "practice tests"];
  const planTopics = [topics[0], topics[1] || "core concepts", topics[2] || "practice tests", "weak area revision", "mock test"];
  const weeks = planTopics.map((topic, index) => ({
    id: `week-${index + 1}`,
    week: `Week ${index + 1}`,
    title: topic.replace(/\b\w/g, (char) => char.toUpperCase()),
    status: index === 0 ? "active" : "locked",
    progress: index === 0 ? 25 : 0,
    focus: index === 0 ? "Start with simple revision and a short quiz." : "Unlock after completing the previous week.",
    tasks: [
      { id: `w${index + 1}-read`, type: "Read", title: `Read: ${topic}`, duration: "15 min", completed: index === 0 },
      { id: `w${index + 1}-practice`, type: "Practice", title: "Practice: 10 Questions", duration: "15 min", completed: false },
      { id: `w${index + 1}-quiz`, type: "Quiz", title: "Quick Quiz", duration: "10 min", completed: false }
    ]
  }));

  return {
    title: `${subjectName} Study Plan`,
    subject: subjectName,
    goal,
    classLevel,
    currentLevel,
    timePerDay,
    summary: `A weekly plan for ${subjectName}: ${goal}. ORIN starts from your current chapters and updates the next focus using progress.`,
    overallProgress: 25,
    weeks,
    dailyTasks: weeks[0].tasks,
    analytics: [
      { label: "Revision", percent: 35 },
      { label: "Practice", percent: 25 },
      { label: "Tests", percent: 15 }
    ],
    adaptivePlan: {
      newFocus: weeks[1]?.title || weeks[0].title,
      reason: "Added to improve the next weak area after the first week.",
      updatedWeeks: weeks.map((week, index) => ({
        ...week,
        status: index === 0 ? "completed" : index === 1 ? "active" : week.status
      }))
    },
    reminders: ["Complete daily tasks first.", "Take one quiz after revision.", "Review wrong answers before moving ahead."]
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
  return EXAM_SUBJECT_POOL.find((item) => item.toLowerCase() === text.toLowerCase()) || text.slice(0, 40);
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

function collectExamAcademicTopics({ board, classLevel = "10", subjects = [], requestedTopics = [] }) {
  const classNumber = Number(String(classLevel || "").match(/\d+/)?.[0] || 10);
  if (classNumber !== 10) return [];
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
      if (!verification.verified || !chapters.length) {
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
          rows.push({ subject, chapter: chapterName, topic: chapterName, subtopics: [], verified: true });
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

  const filtered = requested.length
    ? rows.filter((row) => requested.some((topic) => topic.toLowerCase() === row.topic.toLowerCase() || topic.toLowerCase() === row.chapter.toLowerCase()))
    : rows;
  if (!filtered.length && rows.some((row) => row.verified === false)) {
    return rows.filter((row) => row.verified === false).slice(0, 3);
  }
  return filtered.slice(0, 80);
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
  const questionCount = clampNumber(req.body?.questionCount, 5, 15, 9);
  const classLevel = String(req.body?.classLevel || profile?.classLevel || profile?.className || "High School").trim().slice(0, 40);
  const focusTopic = String(req.body?.focusTopic || "").trim().slice(0, 80);
  const board = String(req.body?.board || req.body?.academicBoard || "SSC").trim().toUpperCase().slice(0, 20);
  const academicTopics = collectExamAcademicTopics({ board, classLevel, subjects, requestedTopics: focusTopic ? [focusTopic] : [] });

  const fallbackQuestions = buildSubjectGapFallbackQuiz({ subjects, questionCount, focusTopic });
  let source = "fallback";
  let provider = "local";
  let model = "deterministic";
  let questions = fallbackQuestions;

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

    if (normalized.length >= Math.min(5, questionCount)) {
      questions = normalized;
      source = "ai";
      provider = ai.provider;
      model = ai.model;
    }
  } catch (error) {
    source = "fallback";
  }

  res.status(200).json({
    source,
    quiz: {
      title: focusTopic ? `${focusTopic} Practice` : "Subject Gap Analyzer",
      classLevel,
      subjects,
      questions
    },
    meta: { provider, model }
  });
});

exports.analyzeHighSchoolSubjectGap = asyncHandler(async (req, res) => {
  const questions = Array.isArray(req.body?.questions)
    ? req.body.questions.map(normalizeGapQuestion).filter(Boolean).slice(0, 20)
    : [];
  if (!questions.length) throw new ApiError(400, "questions are required");

  const answers = req.body?.answers && typeof req.body.answers === "object" ? req.body.answers : {};
  const score = scoreHighSchoolSubjectGap(questions, answers);
  let focusPlan = buildFallbackFocusPlan(score);
  let source = "fallback";
  let provider = "local";
  let model = "deterministic";

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
        strengthRows: score.strengthRows
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
      source = "ai";
      provider = ai.provider;
      model = ai.model;
    }
  } catch (error) {
    source = "fallback";
  }

  res.status(200).json({
    source,
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
    meta: { provider, model }
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
  const topicPlan = buildRoadmapTopicPlan(subject, chapter, academicTopics);
  const subjectRules = roadmapMissionTemplate(subject)
    .map((item, index) => `${index + 1}. ${item.label}: ${item.practice}; proof: ${item.proof}`)
    .join("\n");

  let roadmap = buildFallbackHighSchoolStudyRoadmap({ subject, studyGoal, currentLevel, timePerDay, classLevel, chapter, academicTopics });
  let source = "fallback";
  let provider = "local";
  let model = "deterministic";

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
      `Academic dataset topics: ${topicPlan.verified ? topicPlan.topics.map((item) => `${item.chapter} > ${item.topic}${item.subtopics?.length ? ` (${item.subtopics.slice(0, 3).join(", ")})` : ""}`).join("; ") : topicPlan.pendingMessage}.`,
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

  res.status(200).json({ source, roadmap, meta: { provider, model } });
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
      assistantMode === "general" ? "Mode: General assistant. Do not force school notes if the question is casual or broad." : `Subject: ${subject}.`,
      assistantMode === "general" ? "" : `Chapter/topic context: ${chapter || "Not specified"}.`,
      assistantMode === "general" ? "Answer style: natural, useful, concise." : `Answer style: ${answerStyle}.`,
      `Student doubt: ${question}.`,
      assistantMode === "general"
        ? "Rules: answer the actual question, use clear high-school friendly language, no silly/random content, keep mobile text concise, include practiceQuestions only if useful."
        : "Rules: clear high-school language, no random unrelated topics, answer the actual doubt, include practice questions with real options, keep mobile text concise."
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

  res.status(200).json({ source, result, meta: { provider, model } });
});

exports.generateHighSchoolStudyPlanner = asyncHandler(async (req, res) => {
  const profile = await StudentProfile.findOne({ userId: req.user.id })
    .select("learnerStage classLevel className institutionName")
    .lean();
  if (profile?.learnerStage && profile.learnerStage !== "highschool") {
    throw new ApiError(403, "Study Planner is available for high school learners.");
  }

  const subject = String(req.body?.subject || "Science").trim().slice(0, 50);
  const goal = String(req.body?.goal || "Improve marks and complete weekly revision").trim().slice(0, 160);
  const skills = String(req.body?.skills || "basics, revision, practice tests").trim().slice(0, 240);
  const currentLevel = String(req.body?.currentLevel || "Basics").trim().slice(0, 40);
  const timePerDay = String(req.body?.timePerDay || "1-2 hours").trim().slice(0, 40);
  const classLevel = String(req.body?.classLevel || profile?.classLevel || profile?.className || "High School").trim().slice(0, 40);
  const board = String(req.body?.board || req.body?.academicBoard || "SSC").trim().toUpperCase().slice(0, 20);
  const academicTopics = collectExamAcademicTopics({
    board,
    classLevel,
    subjects: [subject],
    requestedTopics: skills.split(",").map((item) => item.trim()).filter(Boolean)
  });

  let plan = buildFallbackHighSchoolStudyPlanner({ subject, goal, skills, currentLevel, timePerDay, classLevel });
  let source = "fallback";
  let provider = "local";
  let model = "deterministic";

  try {
    const prompt = [
      "Create a high-school AI Study Planner report.",
      "Return JSON only with this exact shape:",
      '{"title":"Science Study Plan","summary":"short summary","overallProgress":25,"weeks":[{"id":"week-1","week":"Week 1","title":"Matter in Our Surroundings","status":"active|locked|completed","progress":25,"focus":"short focus","tasks":[{"id":"task-1","type":"Read|Practice|Quiz|Test","title":"Read: States of Matter","duration":"15 min","completed":true}]}],"dailyTasks":[{"id":"task-1","type":"Read","title":"Read: States of Matter","duration":"15 min","completed":true}],"analytics":[{"label":"Revision","percent":35}],"adaptivePlan":{"newFocus":"Atoms & Molecules","reason":"why this focus","updatedWeeks":[{"id":"week-1","week":"Week 1","title":"Matter in Our Surroundings","status":"completed","progress":100,"focus":"done","tasks":[]}]},"reminders":["reminder"]}',
      `Class level: ${classLevel}.`,
      `Board: ${board}.`,
      `Subject: ${subject}.`,
      `Study goal: ${goal}.`,
      `Current skills or chapters: ${skills}.`,
      `Academic dataset topics: ${academicTopics.length ? academicTopics.map((item) => `${item.chapter} > ${item.topic}`).join("; ") : "No parsed Class 10 topic data found for this selection yet. If class is not 10, say topics will be added later."}.`,
      `Current level: ${currentLevel}.`,
      `Available time per day: ${timePerDay}.`,
      "Rules: create subject-based weekly plan, daily tasks, quiz/practice, progress tracking, adaptive next focus. Prioritize Academic dataset topics when available. If no dataset topics are available, avoid fake topic names and explain that this class/subject will be added later. Keep text concise and school-safe."
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
      plan = {
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
      source = "ai";
      provider = ai.provider;
      model = ai.model;
    }
  } catch (error) {
    source = "fallback";
  }

  res.status(200).json({ source, plan, meta: { provider, model } });
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
      `Existing career goal: ${profile?.careerGoals || "Not specified"}.`,
      "Rules: all suggestions must be school-safe, age-appropriate, India-aware where useful, and based on selected interest/strengths. Do not return random unrelated careers."
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

  res.status(200).json({ source, explorer, meta: { provider, model } });
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
  const academicTopics = collectExamAcademicTopics({ board, classLevel, subjects, requestedTopics: selectedTopics });

  let strategy = buildFallbackExamStrategy({ examName, examDate, classLevel, syllabus, subjects, academicTopics });
  let source = "fallback";
  let provider = "local";
  let model = "deterministic";

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
      `Subjects: ${(subjects.length ? subjects : EXAM_SUBJECT_POOL.slice(0, 5)).join(", ")}.`,
      `Academic dataset topics: ${academicTopics.length ? academicTopics.map((item) => `${item.subject} > ${item.chapter} > ${item.topic}`).join("; ") : "No enriched topics found for this class/subject yet. Use subject-safe topic names only."}.`,
      selectedTopics.length ? `Student selected focus topics: ${selectedTopics.join(", ")}.` : "",
      "Rules: prioritize topics from Academic dataset topics first, use smart time allocation, no random data, school-safe language, concise mobile-friendly text."
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
      strategy = {
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
      source = "ai";
      provider = ai.provider;
      model = ai.model;
    }
  } catch (error) {
    source = "fallback";
  }

  res.status(200).json({
    source,
    strategy,
    meta: { provider, model }
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
      `Academic dataset topics: ${academicTopics.length ? academicTopics.map((item) => `${item.chapter} > ${item.topic}`).join("; ") : "No parsed Class 10 topic data found for this selection yet. If class is not 10, say topics will be added later."}.`,
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
  if (assistantMode === "academic" && subject && classNumber === 10) {
    try {
      academicSummary = summarizeAcademicContext({
        board,
        classNumber,
        subject,
        chapterName: chapter || undefined
      });
    } catch {
      academicSummary = null;
    }
  }

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
      ? `Academic dataset topics: ${academicSummary?.syllabusPreview?.length ? academicSummary.syllabusPreview.map((item) => `${item.chapter_name}${item.topics?.length ? ` (${item.topics.join(", ")})` : ""}`).join("; ") : "No parsed Class 10 topic data found for this selection yet. If class is not 10, say topics will be added later."}`
      : "",
    `Student prompt: ${message}`,
    assistantMode === "academic"
      ? "Rules: stay on-topic, use clear headings/bullets, include key points and one short exam tip."
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
      remainingToday: Math.max(dailyLimit - usedToday - 1, 0)
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
