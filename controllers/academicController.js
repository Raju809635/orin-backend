const asyncHandler = require("../utils/asyncHandler");
const {
  getBoards,
  getClasses,
  getSubjects,
  getSubjectsForClass,
  getSubjectRecord,
  getSubjectRecordForClass,
  getTopicsForClassSubject,
  getTopicsForBoardClassSubject,
  getLessonForBoardClassSubjectChapter,
  getResourceLibrary,
  getManualPdfsForClassSubject,
  resolveManualPdf,
  getManualPdfUrl
} = require("../services/academicService");

exports.getAcademicBoards = asyncHandler(async (req, res) => {
  res.status(200).json({ boards: getBoards() });
});

exports.getAcademicClasses = asyncHandler(async (req, res) => {
  res.status(200).json({ classes: getClasses(req.params.board) });
});

exports.getAcademicSubjects = asyncHandler(async (req, res) => {
  res.status(200).json({
    subjects: getSubjects(req.params.board, req.params.classNumber)
  });
});

exports.getAcademicSubjectsForClass = asyncHandler(async (req, res) => {
  const subjects = Number(req.params.classNumber) === 10 ? getSubjectsForClass(req.params.classNumber) : [];
  res.status(200).json({
    classNumber: Number(req.params.classNumber),
    available: subjects.length > 0,
    message: subjects.length ? "" : "Academic topics for this class will be added later.",
    subjects
  });
});

exports.getAcademicSubject = asyncHandler(async (req, res) => {
  res.status(200).json(
    getSubjectRecord(req.params.board, req.params.classNumber, req.params.subject)
  );
});

exports.getAcademicSubjectForClass = asyncHandler(async (req, res) => {
  if (Number(req.params.classNumber) !== 10) {
    return res.status(200).json({
      classNumber: Number(req.params.classNumber),
      subjectKey: req.params.subject,
      available: false,
      message: "Academic topics for this class will be added later.",
      subject: { metadata: { class: Number(req.params.classNumber), subject: req.params.subject }, chapters: [] }
    });
  }
  res.status(200).json(getTopicsForClassSubject(req.params.classNumber, req.params.subject));
});

exports.getAcademicTopicsForClassSubject = asyncHandler(async (req, res) => {
  if (Number(req.params.classNumber) !== 10) {
    return res.status(200).json({
      classNumber: Number(req.params.classNumber),
      subjectKey: req.params.subject,
      available: false,
      message: "Academic topics for this class will be added later.",
      chapters: []
    });
  }
  res.status(200).json(getTopicsForClassSubject(req.params.classNumber, req.params.subject));
});

exports.getAcademicTopicsForBoardClassSubject = asyncHandler(async (req, res) => {
  res.status(200).json(getTopicsForBoardClassSubject(req.params.board, req.params.classNumber, req.params.subject));
});

exports.getAcademicLessonForBoardClassSubjectChapter = asyncHandler(async (req, res) => {
  res.status(200).json(
    getLessonForBoardClassSubjectChapter(
      req.params.board,
      req.params.classNumber,
      req.params.subject,
      req.params.chapter
    )
  );
});

exports.getAcademicResourceLibrary = asyncHandler(async (req, res) => {
  res.status(200).json(getResourceLibrary());
});

exports.getAcademicPdfsForClassSubject = asyncHandler(async (req, res) => {
  if (Number(req.params.classNumber) !== 10) {
    return res.status(200).json({
      classNumber: Number(req.params.classNumber),
      subjectKey: req.params.subject,
      available: false,
      message: "Academic PDFs for this class will be added later.",
      pdfs: []
    });
  }
  const pdfs = getManualPdfsForClassSubject(req.params.classNumber, req.params.subject);
  res.status(200).json({
    classNumber: Number(req.params.classNumber),
    subjectKey: req.params.subject,
    available: pdfs.length > 0,
    message: pdfs.length ? "" : "No real PDF files are connected for this subject yet.",
    pdfs
  });
});

exports.getAcademicPdfsForBoardClassSubject = asyncHandler(async (req, res) => {
  const pdfs = getManualPdfsForClassSubject(req.params.classNumber, req.params.subject, req.params.board);
  res.status(200).json({
    board: String(req.params.board || "").toUpperCase(),
    classNumber: Number(req.params.classNumber),
    subjectKey: req.params.subject,
    available: pdfs.length > 0,
    message: pdfs.length ? "" : "No real PDF files are connected for this subject yet.",
    pdfs
  });
});

exports.openAcademicPdf = asyncHandler(async (req, res) => {
  const redirectUrl = getManualPdfUrl(req.query.path);
  if (redirectUrl) {
    return res.redirect(302, redirectUrl);
  }

  const filePath = resolveManualPdf(req.query.path);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(require("path").basename(filePath))}"`);
  res.sendFile(filePath);
});
