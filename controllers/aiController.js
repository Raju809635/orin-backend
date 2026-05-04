const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const AiChatLog = require("../models/AiChatLog");
const { aiChatDailyLimit } = require("../config/env");
const { requestAiResponse } = require("../services/aiService");
const User = require("../models/User");
const StudentProfile = require("../models/StudentProfile");
const { updateJourneyGoal } = require("../services/journeyStateService");
const mongoose = require("mongoose");

const HIGH_SCHOOL_SUBJECTS = ["Mathematics", "Science", "English"];
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

function buildFallbackHighSchoolStudyRoadmap({ subject, studyGoal, currentLevel, timePerDay, classLevel }) {
  const subjectName = normalizeSubject(subject);
  const topicTemplates = {
    Mathematics: ["Numbers & Basics", "Algebra", "Geometry", "Fractions", "Revision Test"],
    Science: ["Matter in Our Surroundings", "Atoms & Molecules", "Life Processes", "Electricity", "Revision Test"],
    English: ["Reading Skills", "Grammar", "Vocabulary", "Writing Skills", "Revision Test"]
  };
  const topics = topicTemplates[subjectName] || topicTemplates.Mathematics;
  const minutes = String(timePerDay || "").includes("2") ? 35 : String(timePerDay || "").includes("3") ? 45 : 25;
  const weeks = topics.map((topic, index) => ({
    id: `week-${index + 1}`,
    week: `Week ${index + 1}`,
    title: topic,
    status: index === 0 ? "active" : "locked",
    progress: index === 0 ? 25 : 0,
    focus: index === 0 ? "Start with concept clarity and short practice." : "Unlock after completing the previous week.",
    tasks: [
      { id: `w${index + 1}-read`, type: "Read", title: `Read: ${topic}`, duration: `${Math.max(10, minutes - 10)} min`, completed: index === 0 },
      { id: `w${index + 1}-watch`, type: "Watch", title: "Watch: Explanation Video", duration: "20 min", completed: index === 0 },
      { id: `w${index + 1}-practice`, type: "Practice", title: "Practice: 10 Questions", duration: "15 min", completed: false },
      { id: `w${index + 1}-quiz`, type: "Quiz", title: "Quick Quiz", duration: "10 min", completed: false }
    ]
  }));

  return {
    title: `${subjectName} Weekly Study Roadmap`,
    subject: subjectName,
    classLevel,
    studyGoal,
    currentLevel,
    timePerDay,
    summary: `A weekly ${subjectName} plan built around ${studyGoal}. Complete daily tasks, take quick quizzes, and update focus from performance.`,
    overallProgress: 25,
    activeWeek: weeks[0],
    weeks,
    dailyTasks: weeks[0].tasks,
    progressAnalytics: [
      { label: subjectName, percent: 40 },
      { label: "Practice", percent: 25 },
      { label: "Tests", percent: 15 }
    ],
    adaptivePlan: {
      newFocus: topics[1] || topics[0],
      reason: "Added to improve the next weak area after your current week.",
      updatedWeeks: weeks.map((week, index) => ({
        ...week,
        status: index === 0 ? "completed" : index === 1 ? "active" : week.status
      }))
    },
    reminders: ["Finish daily tasks before quiz.", "Review wrong answers the same day.", "Retake weak topics every weekend."]
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

function buildFallbackExamStrategy({ examName, examDate, classLevel, syllabus, subjects }) {
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
    const topics = topicTemplates[subject] || ["Core Concepts", "Important Questions", "Revision Notes"];
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

async function buildConversationSummaries(userId) {
  const rows = await AiChatLog.find({ userId })
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

exports.chatWithAi = asyncHandler(async (req, res) => {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const usedToday = await AiChatLog.countDocuments({
    userId: req.user.id,
    createdAt: { $gte: startOfDay }
  });

  if (usedToday >= aiChatDailyLimit) {
    throw new ApiError(429, `Daily AI limit reached (${aiChatDailyLimit}). Try again tomorrow.`);
  }

  const assistantMode = req.body?.context?.assistantMode === "personalized" ? "personalized" : "general";
  const conversationId = String(req.body?.conversationId || new mongoose.Types.ObjectId().toString()).trim();
  if (!conversationId) throw new ApiError(400, "conversationId is required");

  let existingConversation = null;
  if (req.body?.conversationId) {
    existingConversation = await AiChatLog.findOne({ userId: req.user.id, conversationId }).select("conversationTitle pinned").lean();
    if (!existingConversation) throw new ApiError(404, "Conversation not found");
  }

  const { answer, provider, model } = await requestAiResponse({
    role: req.user.role,
    message: req.body.message,
    context: req.body.context || {}
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
    context: req.body.context || {}
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
      remainingToday: Math.max(aiChatDailyLimit - usedToday - 1, 0)
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
      `Subjects: ${subjects.join(", ")}.`,
      focusTopic ? `Focus topic: ${focusTopic}.` : "Mix foundational topics across the selected subjects.",
      `Create exactly ${questionCount} questions.`,
      "Rules: school-safe content, no adult career/marketplace content, each correct value must exactly match one option, concise explanations.",
      "Do not use placeholder options like A, B, C, D. Options must be the actual answer text."
    ].join("\n");

    const ai = await requestAiResponse({
      role: "student",
      message: prompt,
      context: {
        assistantMode: "general",
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
        assistantMode: "general",
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

  const subject = normalizeSubject(req.body?.subject);
  const studyGoal = String(req.body?.studyGoal || "Improve marks and complete weekly revision").trim().slice(0, 120);
  const currentLevel = String(req.body?.currentLevel || "Basics").trim().slice(0, 40);
  const timePerDay = String(req.body?.timePerDay || "1-2 hours").trim().slice(0, 40);
  const classLevel = String(req.body?.classLevel || profile?.classLevel || profile?.className || "High School").trim().slice(0, 40);

  let roadmap = buildFallbackHighSchoolStudyRoadmap({ subject, studyGoal, currentLevel, timePerDay, classLevel });
  let source = "fallback";
  let provider = "local";
  let model = "deterministic";

  try {
    const prompt = [
      "Create a high-school AI Study Roadmap like a smart adaptive study planner.",
      "Return JSON only with this exact shape:",
      '{"title":"Science Weekly Study Roadmap","summary":"short summary","overallProgress":25,"weeks":[{"id":"week-1","week":"Week 1","title":"Matter in Our Surroundings","status":"active|locked|completed","progress":25,"focus":"short focus","tasks":[{"id":"task-1","type":"Read|Watch|Practice|Quiz|Test","title":"Read: States of Matter","duration":"15 min","completed":true}]}],"dailyTasks":[{"id":"task-1","type":"Read","title":"Read: States of Matter","duration":"15 min","completed":true}],"progressAnalytics":[{"label":"Physics","percent":40}],"adaptivePlan":{"newFocus":"Atoms & Molecules","reason":"why this focus","updatedWeeks":[{"id":"week-1","week":"Week 1","title":"Matter in Our Surroundings","status":"completed","progress":100,"focus":"done","tasks":[]}]},"reminders":["reminder"]}',
      `Class level: ${classLevel}.`,
      `Subject: ${subject}.`,
      `Study goal: ${studyGoal}.`,
      `Current level: ${currentLevel}.`,
      `Available time per day: ${timePerDay}.`,
      "Rules: subject based roadmap, skill level adaptation, goal based plan, daily tasks, quiz/practice, progress tracking, adaptive learning. Keep text concise and school-safe. Do not invent random unrelated data."
    ].join("\n");

    const ai = await requestAiResponse({
      role: "student",
      message: prompt,
      context: {
        assistantMode: "general",
        feature: "highschool_study_roadmap",
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
      roadmap = {
        ...roadmap,
        title: String(parsed.title || roadmap.title).trim().slice(0, 80),
        summary: String(parsed.summary || roadmap.summary).trim().slice(0, 260),
        overallProgress: clampNumber(parsed.overallProgress, 0, 100, roadmap.overallProgress),
        activeWeek: weeks[0] || roadmap.activeWeek,
        weeks,
        dailyTasks: Array.isArray(parsed.dailyTasks)
          ? parsed.dailyTasks.map((task, index) => normalizeTask(task, `daily-task-${index + 1}`)).slice(0, 5)
          : weeks[0]?.tasks || roadmap.dailyTasks,
        progressAnalytics: Array.isArray(parsed.progressAnalytics)
          ? parsed.progressAnalytics.map((item) => ({
              label: String(item?.label || subject).trim().slice(0, 40),
              percent: clampNumber(item?.percent, 0, 100, 25)
            })).filter((item) => item.label).slice(0, 5)
          : roadmap.progressAnalytics,
        adaptivePlan: {
          newFocus: String(parsed.adaptivePlan?.newFocus || roadmap.adaptivePlan.newFocus).trim().slice(0, 80),
          reason: String(parsed.adaptivePlan?.reason || roadmap.adaptivePlan.reason).trim().slice(0, 180),
          updatedWeeks: Array.isArray(parsed.adaptivePlan?.updatedWeeks)
            ? parsed.adaptivePlan.updatedWeeks.map(normalizeWeek).slice(0, 6)
            : roadmap.adaptivePlan.updatedWeeks
        },
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

  res.status(200).json({ source, roadmap, meta: { provider, model } });
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
  const syllabus = String(req.body?.syllabus || "School syllabus").trim().slice(0, 120);
  const rawSubjects = Array.isArray(req.body?.subjects) ? req.body.subjects : [];
  const subjects = Array.from(new Set(rawSubjects.map(normalizeExamSubject).filter(Boolean))).slice(0, 8);

  let strategy = buildFallbackExamStrategy({ examName, examDate, classLevel, syllabus, subjects });
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
      `Class: ${classLevel}.`,
      `Syllabus: ${syllabus}.`,
      `Subjects: ${(subjects.length ? subjects : EXAM_SUBJECT_POOL.slice(0, 5)).join(", ")}.`,
      "Rules: prioritize high-weightage topics, smart time allocation, no random data, school-safe language, concise mobile-friendly text."
    ].join("\n");

    const ai = await requestAiResponse({
      role: "student",
      message: prompt,
      context: {
        assistantMode: "general",
        feature: "highschool_exam_strategy",
        expectedFormat: "json",
        learnerStage: "highschool"
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
