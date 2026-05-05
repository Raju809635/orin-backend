const asyncHandler = require("../utils/asyncHandler");
const {
  getBoards,
  getClasses,
  getSubjects,
  getSubjectRecord,
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

exports.getAcademicSubject = asyncHandler(async (req, res) => {
  res.status(200).json(
    getSubjectRecord(req.params.board, req.params.classNumber, req.params.subject)
  );
});

exports.getAcademicResourceLibrary = asyncHandler(async (req, res) => {
  res.status(200).json(getResourceLibrary());
});
