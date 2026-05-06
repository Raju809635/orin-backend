const asyncHandler = require("../utils/asyncHandler");
const {
  getBoards,
  getClasses,
  getSubjects,
  getSubjectsForClass,
  getSubjectRecord,
  getSubjectRecordForClass,
  getTopicsForClassSubject,
  getResourceLibrary
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
  const record = getSubjectRecordForClass(req.params.classNumber, req.params.subject);
  res.status(200).json({ ...record, available: true });
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
  res.status(200).json({ ...getTopicsForClassSubject(req.params.classNumber, req.params.subject), available: true });
});

exports.getAcademicResourceLibrary = asyncHandler(async (req, res) => {
  res.status(200).json(getResourceLibrary());
});
