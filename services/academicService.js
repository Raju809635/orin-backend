const fs = require("fs");
const path = require("path");
const ApiError = require("../utils/ApiError");

const DEFAULT_DATASET_DIR = path.resolve(process.cwd(), "../../acadamics/orin-data-pipeline/final_dataset");
const DATASET_DIR = process.env.ACADEMICS_DATASET_DIR
  ? path.resolve(process.env.ACADEMICS_DATASET_DIR)
  : DEFAULT_DATASET_DIR;

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new ApiError(404, "Academic resource not found");
    }
    throw error;
  }
}

function existsDir(dirPath) {
  return fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory();
}

function titleFromSlug(value) {
  return String(value || "")
    .split("_")
    .filter(Boolean)
    .map((part) => (part.toLowerCase() === "ict" ? "ICT" : part.charAt(0).toUpperCase() + part.slice(1)))
    .join(" ");
}

function subjectSlug(subject) {
  return String(subject || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeBoard(board) {
  return String(board || "").trim().toUpperCase();
}

function classDirName(classNumber) {
  return `class_${Number(classNumber)}`;
}

function getBoards() {
  if (!existsDir(DATASET_DIR)) return [];
  return fs
    .readdirSync(DATASET_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function getClasses(board) {
  const boardDir = path.join(DATASET_DIR, normalizeBoard(board));
  if (!existsDir(boardDir)) return [];
  return fs
    .readdirSync(boardDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^class_\d+$/.test(entry.name))
    .map((entry) => Number(entry.name.replace("class_", "")))
    .sort((a, b) => a - b);
}

function getSubjects(board, classNumber) {
  const classDir = path.join(DATASET_DIR, normalizeBoard(board), classDirName(classNumber));
  if (!existsDir(classDir)) return [];
  return fs
    .readdirSync(classDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => {
      const slug = entry.name.replace(/\.json$/, "");
      const record = readJson(path.join(classDir, entry.name));
      return {
        slug,
        name: record?.metadata?.subject || titleFromSlug(slug),
        verificationStatus: record?.metadata?.verification_status || "unknown",
        chapterCount: Array.isArray(record?.chapters) ? record.chapters.length : 0
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function getSubjectRecord(board, classNumber, subject) {
  const filePath = path.join(DATASET_DIR, normalizeBoard(board), classDirName(classNumber), `${subjectSlug(subject)}.json`);
  return readJson(filePath);
}

function getResourceLibrary() {
  return {
    datasetRoot: DATASET_DIR,
    boards: getBoards().map((board) => ({
      board,
      classes: getClasses(board).map((classNumber) => ({
        class: classNumber,
        subjects: getSubjects(board, classNumber)
      }))
    }))
  };
}

function summarizeAcademicContext(context = {}) {
  const { board, classNumber, subject, chapterName, topicName } = context;
  if (!board || !classNumber || !subject) return null;

  const record = getSubjectRecord(board, classNumber, subject);
  const chapters = Array.isArray(record.chapters) ? record.chapters : [];
  const selectedChapter =
    chapterName && chapters.find((chapter) => chapter.chapter_name.toLowerCase() === String(chapterName).toLowerCase());
  const selectedTopics = selectedChapter
    ? selectedChapter.topics || []
    : chapters.slice(0, 8).flatMap((chapter) => (chapter.topics || []).slice(0, 2));

  return {
    metadata: record.metadata,
    selectedChapter: selectedChapter
      ? {
          chapter_no: selectedChapter.chapter_no,
          chapter_name: selectedChapter.chapter_name,
          topics: selectedChapter.topics || []
        }
      : null,
    selectedTopic: topicName
      ? selectedTopics.find((topic) => topic.topic_name.toLowerCase() === String(topicName).toLowerCase()) || null
      : null,
    syllabusPreview: chapters.slice(0, 12).map((chapter) => ({
      chapter_no: chapter.chapter_no,
      chapter_name: chapter.chapter_name,
      topics: (chapter.topics || []).slice(0, 2).map((topic) => topic.topic_name)
    }))
  };
}

module.exports = {
  getBoards,
  getClasses,
  getSubjects,
  getSubjectRecord,
  getResourceLibrary,
  summarizeAcademicContext
};
