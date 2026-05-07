const fs = require("fs");
const path = require("path");
const ApiError = require("../utils/ApiError");

const BACKEND_DATASET_DIR = path.resolve(process.cwd(), "data/academics/final_dataset");
const PIPELINE_DATASET_DIR = path.resolve(process.cwd(), "../acadamics/orin-data-pipeline/final_dataset");
const DEFAULT_DATASET_DIR = fs.existsSync(BACKEND_DATASET_DIR) ? BACKEND_DATASET_DIR : PIPELINE_DATASET_DIR;
const BACKEND_MANUAL_PDF_DIR = path.resolve(process.cwd(), "data/academics/manual_pdfs");
const PIPELINE_MANUAL_PDF_DIR = path.resolve(process.cwd(), "../acadamics/orin-data-pipeline/raw_data/manual_pdfs");
const MANUAL_PDF_DIR = fs.existsSync(BACKEND_MANUAL_PDF_DIR) ? BACKEND_MANUAL_PDF_DIR : PIPELINE_MANUAL_PDF_DIR;
const DATASET_DIR = process.env.ACADEMICS_DATASET_DIR
  ? path.resolve(process.env.ACADEMICS_DATASET_DIR)
  : DEFAULT_DATASET_DIR;
const AGGREGATE_DATASET_PATHS = [
  process.env.ACADEMICS_AGGREGATE_DATASET,
  path.resolve(process.cwd(), "data/academics/orin_academic_dataset.json"),
  path.resolve(process.cwd(), "../acadamics/orin-data-pipeline/final_dataset/orin_academic_dataset.json")
].filter(Boolean);

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

function findAggregateDatasetPath() {
  return AGGREGATE_DATASET_PATHS.find((filePath) => fs.existsSync(filePath) && fs.statSync(filePath).isFile()) || "";
}

function readAggregateDataset() {
  const filePath = findAggregateDatasetPath();
  if (!filePath) return null;
  return readJson(filePath);
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

function subjectMatches(slug, record, requestedSubject) {
  const requested = subjectSlug(requestedSubject);
  const names = [
    slug,
    record?.metadata?.subject,
    record?.subject,
    titleFromSlug(slug)
  ].map(subjectSlug);
  const aliases = {
    maths: "mathematics",
    math: "mathematics",
    social_studies: "social_science",
    social: "social_science",
    computer: "computer_applications"
  };
  const requestedOptions = new Set([requested, aliases[requested]].filter(Boolean));
  return names.some((name) => requestedOptions.has(name) || requestedOptions.has(aliases[name]));
}

function namesMatchSubject(value, requestedSubject) {
  return subjectMatches(value, { metadata: { subject: value } }, requestedSubject);
}

function recordMetadata(record) {
  return record?.metadata || record?.subject?.metadata || {};
}

function isExtractionPending(record) {
  const metadata = recordMetadata(record);
  const status = String(metadata.extraction_status || metadata.verification_status || "").trim().toLowerCase();
  return ["pending_ocr", "needs_ocr", "extraction_pending"].includes(status);
}

function isSubjectUnavailable(record) {
  const metadata = recordMetadata(record);
  const sourceType = String(metadata.source_type || "").trim().toLowerCase();
  const extractionStatus = String(metadata.extraction_status || "").trim().toLowerCase();
  const verificationStatus = String(metadata.verification_status || "").trim().toLowerCase();

  if (isExtractionPending(record)) return true;
  if (["needs_review", "review_required"].includes(extractionStatus)) return true;
  if (["needs_review", "review_required", "pending"].includes(verificationStatus)) return true;
  if (["generated_fallback", "curated_fallback"].includes(sourceType)) {
    const classNumber = metadata.class || record?.classNumber;
    const subject = metadata.subject || record?.subjectKey;
    if (classNumber && subject && getManualPdfsForClassSubject(classNumber, subject, metadata.board).length > 0) return false;
    return true;
  }
  return false;
}

function pendingMessage(record) {
  const metadata = recordMetadata(record);
  const sourceType = String(metadata.source_type || "").trim().toLowerCase();
  if (["generated_fallback", "curated_fallback"].includes(sourceType)) {
    return "Academic topics for this subject are awaiting verified PDF extraction. Topics will appear after review.";
  }
  return (
    metadata.extraction_message ||
    metadata.source_note ||
    "Academic PDF uploaded, extraction pending. Topics will appear after OCR is completed."
  );
}

function normalizeBoard(board) {
  return String(board || "").trim().toUpperCase();
}

function classDirName(classNumber) {
  return `class_${Number(classNumber)}`;
}

function getBoards() {
  const aggregate = readAggregateDataset();
  if (!existsDir(DATASET_DIR) && aggregate) return Object.keys(aggregate).sort();
  if (!existsDir(DATASET_DIR)) return [];
  return fs
    .readdirSync(DATASET_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function getClasses(board) {
  const boardDir = path.join(DATASET_DIR, normalizeBoard(board));
  const aggregate = readAggregateDataset();
  if (!existsDir(boardDir) && aggregate?.[normalizeBoard(board)]) {
    return Object.keys(aggregate[normalizeBoard(board)])
      .map((classKey) => Number(String(classKey).replace("class_", "")))
      .filter(Number.isFinite)
      .sort((a, b) => a - b);
  }
  if (!existsDir(boardDir)) return [];
  return fs
    .readdirSync(boardDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^class_\d+$/.test(entry.name))
    .map((entry) => Number(entry.name.replace("class_", "")))
    .sort((a, b) => a - b);
}

function getSubjects(board, classNumber) {
  const classDir = path.join(DATASET_DIR, normalizeBoard(board), classDirName(classNumber));
  const aggregate = readAggregateDataset();
  const aggregateClass = aggregate?.[normalizeBoard(board)]?.[classDirName(classNumber)];
  if (!existsDir(classDir) && aggregateClass) {
    return Object.entries(aggregateClass)
      .map(([slug, record]) => {
        const name = record?.metadata?.subject || titleFromSlug(slug);
        return {
          slug,
          key: slug,
          name,
          subject: name,
          available: !isSubjectUnavailable(record),
          extractionStatus: recordMetadata(record).extraction_status || "",
          message: isSubjectUnavailable(record) ? pendingMessage(record) : "",
          verificationStatus: record?.metadata?.verification_status || "unknown",
          chapterCount: Array.isArray(record?.chapters) ? record.chapters.length : 0
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }
  if (!existsDir(classDir)) return [];
  return fs
    .readdirSync(classDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => {
      const slug = entry.name.replace(/\.json$/, "");
      const record = readJson(path.join(classDir, entry.name));
      const name = record?.metadata?.subject || titleFromSlug(slug);
      return {
        slug,
        key: slug,
        name,
        subject: name,
        available: !isSubjectUnavailable(record),
        extractionStatus: recordMetadata(record).extraction_status || "",
        message: isSubjectUnavailable(record) ? pendingMessage(record) : "",
        verificationStatus: record?.metadata?.verification_status || "unknown",
        chapterCount: Array.isArray(record?.chapters) ? record.chapters.length : 0
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function getSubjectsForClass(classNumber) {
  const boards = getBoards();
  const seen = new Map();
  const preferredBoards = ["SSC", "CBSE", "ICSE"];
  const sortedBoards = boards.sort((a, b) => {
    const ai = preferredBoards.indexOf(a);
    const bi = preferredBoards.indexOf(b);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi) || a.localeCompare(b);
  });

  sortedBoards.forEach((board) => {
    getSubjects(board, classNumber).forEach((subject) => {
      const key = subjectSlug(subject.name || subject.subject || subject.slug || subject.key);
      if (!key) return;
      const existing = seen.get(key);
      const candidate = { ...subject, board };
      if (!existing || (existing.available === false && candidate.available !== false)) {
        seen.set(key, candidate);
      }
    });
  });

  return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function getSubjectRecord(board, classNumber, subject) {
  const filePath = path.join(DATASET_DIR, normalizeBoard(board), classDirName(classNumber), `${subjectSlug(subject)}.json`);
  if (!fs.existsSync(filePath)) {
    const aggregate = readAggregateDataset();
    const record = aggregate?.[normalizeBoard(board)]?.[classDirName(classNumber)]?.[subjectSlug(subject)];
    if (record) {
      return {
        board: normalizeBoard(board),
        classNumber: Number(classNumber),
        subjectKey: subjectSlug(subject),
        subject: record
      };
    }
  }
  return readJson(filePath);
}

function getSubjectRecordForClass(classNumber, subject) {
  const boards = getBoards();
  const preferredBoards = ["SSC", "CBSE", "ICSE"];
  const sortedBoards = boards.sort((a, b) => {
    const ai = preferredBoards.indexOf(a);
    const bi = preferredBoards.indexOf(b);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi) || a.localeCompare(b);
  });

  const matches = [];

  for (const board of sortedBoards) {
    const classDir = path.join(DATASET_DIR, normalizeBoard(board), classDirName(classNumber));
    const aggregate = readAggregateDataset();
    const aggregateClass = aggregate?.[normalizeBoard(board)]?.[classDirName(classNumber)];

    if (existsDir(classDir)) {
      const fileNames = fs
        .readdirSync(classDir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
        .map((entry) => entry.name);
      for (const fileName of fileNames) {
        const slug = fileName.replace(/\.json$/, "");
        const record = readJson(path.join(classDir, fileName));
        if (subjectMatches(slug, record, subject)) {
          matches.push({
            board: normalizeBoard(board),
            classNumber: Number(classNumber),
            subjectKey: slug,
            subject: record
          });
        }
      }
    }

    if (aggregateClass) {
      for (const [slug, record] of Object.entries(aggregateClass)) {
        if (subjectMatches(slug, record, subject)) {
          matches.push({
            board: normalizeBoard(board),
            classNumber: Number(classNumber),
            subjectKey: slug,
            subject: record
          });
        }
      }
    }
  }

  const availableMatch = matches.find((record) => !isSubjectUnavailable(record));
  if (availableMatch) return availableMatch;
  if (matches.length) return matches[0];

  throw new ApiError(404, "Academic resource not found");
}

function getChaptersFromRecord(record) {
  if (Array.isArray(record?.chapters)) return record.chapters;
  if (Array.isArray(record?.subject?.chapters)) return record.subject.chapters;
  return [];
}

function chapterTitle(chapter) {
  return String(chapter?.chapter_name || chapter?.title || chapter?.name || "").trim();
}

function topicTitle(topic) {
  return String(topic?.topic_name || topic?.title || topic?.name || topic || "").trim();
}

function getTopicsForClassSubject(classNumber, subject) {
  const record = getSubjectRecordForClass(classNumber, subject);
  if (isSubjectUnavailable(record)) {
    return {
      ...record,
      available: false,
      message: pendingMessage(record),
      chapters: []
    };
  }
  const chapters = getChaptersFromRecord(record.subject || record);
  return {
    ...record,
    chapters: chapters.map((chapter) => ({
      chapter_no: chapter.chapter_no,
      chapter_name: chapterTitle(chapter),
      topics: (Array.isArray(chapter.topics) ? chapter.topics : [])
        .map((topic) => ({
          topic_name: topicTitle(topic),
          subtopics: Array.isArray(topic?.subtopics) ? topic.subtopics : []
        }))
        .filter((topic) => topic.topic_name)
    }))
  };
}

function getResourceLibrary() {
  return {
    datasetRoot: existsDir(DATASET_DIR) ? DATASET_DIR : findAggregateDatasetPath(),
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
  if (!classNumber || !subject) return null;

  const record = board ? getSubjectRecord(board, classNumber, subject) : getSubjectRecordForClass(classNumber, subject);
  if (isSubjectUnavailable(record)) return null;
  const subjectRecord = record.subject || record;
  const chapters = getChaptersFromRecord(subjectRecord);
  const selectedChapter =
    chapterName && chapters.find((chapter) => chapterTitle(chapter).toLowerCase() === String(chapterName).toLowerCase());
  const selectedTopics = selectedChapter
    ? selectedChapter.topics || []
    : chapters.slice(0, 8).flatMap((chapter) => (chapter.topics || []).slice(0, 2));

  return {
    board: record.board || board,
    classNumber: Number(classNumber),
    subjectKey: record.subjectKey || subjectSlug(subject),
    metadata: subjectRecord.metadata,
    selectedChapter: selectedChapter
      ? {
          chapter_no: selectedChapter.chapter_no,
          chapter_name: chapterTitle(selectedChapter),
          topics: selectedChapter.topics || []
        }
      : null,
    selectedTopic: topicName
      ? selectedTopics.find((topic) => topicTitle(topic).toLowerCase() === String(topicName).toLowerCase()) || null
      : null,
    syllabusPreview: chapters.slice(0, 12).map((chapter) => ({
      chapter_no: chapter.chapter_no,
      chapter_name: chapterTitle(chapter),
      topics: (chapter.topics || []).slice(0, 2).map(topicTitle).filter(Boolean)
    }))
  };
}

function normalizeManualBoard(folderName) {
  const value = String(folderName || "").trim().toUpperCase();
  if (value.startsWith("SSC")) return "SSC";
  if (value.startsWith("CBSE")) return "CBSE";
  if (value.startsWith("ICSE")) return "ICSE";
  return value;
}

function manualPdfSubject(relativeParts, filePath) {
  if (relativeParts.length >= 4) return titleFromSlug(subjectSlug(relativeParts[2]));
  return titleFromSlug(subjectSlug(path.basename(filePath, ".pdf")));
}

function walkPdfFiles(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const nextPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) return walkPdfFiles(nextPath);
    return entry.isFile() && entry.name.toLowerCase().endsWith(".pdf") ? [nextPath] : [];
  });
}

function getManualPdfsForClassSubject(classNumber, subject, boardFilter = "") {
  if (!fs.existsSync(MANUAL_PDF_DIR)) return [];
  const requestedClass = Number(classNumber);
  const requestedBoard = normalizeBoard(boardFilter);
  return walkPdfFiles(MANUAL_PDF_DIR)
    .map((filePath) => {
      const relativePath = path.relative(MANUAL_PDF_DIR, filePath);
      const parts = relativePath.split(path.sep);
      if (parts.length < 3) return null;
      const board = normalizeManualBoard(parts[0]);
      const detectedClass = Number(String(parts[1] || "").match(/\d+/)?.[0] || 0);
      const detectedSubject = manualPdfSubject(parts, filePath);
      if (requestedBoard && board !== requestedBoard) return null;
      if (detectedClass !== requestedClass || !namesMatchSubject(detectedSubject, subject)) return null;
      const encodedPath = encodeURIComponent(relativePath.replace(/\\/g, "/"));
      return {
        id: `${board}-${detectedClass}-${subjectSlug(detectedSubject)}-${path.basename(filePath)}`,
        board,
        classNumber: detectedClass,
        subject: detectedSubject,
        title: path.basename(filePath, ".pdf").replace(/[_-]+/g, " ").trim(),
        fileName: path.basename(filePath),
        relativePath: relativePath.replace(/\\/g, "/"),
        pdfUrl: `/api/academics/pdf?path=${encodedPath}`,
        sizeBytes: fs.statSync(filePath).size
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.fileName.localeCompare(b.fileName, undefined, { numeric: true }));
}

function resolveManualPdf(relativePath) {
  const cleanRelativePath = String(relativePath || "").replace(/^[/\\]+/, "");
  const resolvedPath = path.resolve(MANUAL_PDF_DIR, cleanRelativePath);
  if (!resolvedPath.startsWith(MANUAL_PDF_DIR) || path.extname(resolvedPath).toLowerCase() !== ".pdf") {
    throw new ApiError(400, "Invalid academic PDF path");
  }
  if (!fs.existsSync(resolvedPath) || !fs.statSync(resolvedPath).isFile()) {
    throw new ApiError(404, "Academic PDF not found");
  }
  return resolvedPath;
}

module.exports = {
  getBoards,
  getClasses,
  getSubjects,
  getSubjectsForClass,
  getSubjectRecord,
  getSubjectRecordForClass,
  getTopicsForClassSubject,
  getResourceLibrary,
  getManualPdfsForClassSubject,
  resolveManualPdf,
  summarizeAcademicContext
};
