const express = require("express");
const {
  getAcademicBoards,
  getAcademicClasses,
  getAcademicSubjects,
  getAcademicSubjectsForClass,
  getAcademicSubject,
  getAcademicSubjectForClass,
  getAcademicTopicsForClassSubject,
  getAcademicTopicsForBoardClassSubject,
  getAcademicLessonForBoardClassSubjectChapter,
  getAcademicPdfsForClassSubject,
  getAcademicPdfsForBoardClassSubject,
  getAcademicResourceLibrary,
  openAcademicPdf
} = require("../controllers/academicController");

const router = express.Router();

router.get("/library", getAcademicResourceLibrary);
router.get("/pdf", openAcademicPdf);
router.get("/boards", getAcademicBoards);
router.get("/class/:classNumber/subjects", getAcademicSubjectsForClass);
router.get("/class/:classNumber/subject/:subject/pdfs", getAcademicPdfsForClassSubject);
router.get("/class/:classNumber/subject/:subject/topics", getAcademicTopicsForClassSubject);
router.get("/class/:classNumber/subject/:subject", getAcademicSubjectForClass);
router.get("/:board/classes", getAcademicClasses);
router.get("/:board/class/:classNumber/subjects", getAcademicSubjects);
router.get("/:board/class/:classNumber/subject/:subject/chapter/:chapter/lesson", getAcademicLessonForBoardClassSubjectChapter);
router.get("/:board/class/:classNumber/subject/:subject/topics", getAcademicTopicsForBoardClassSubject);
router.get("/:board/class/:classNumber/subject/:subject/pdfs", getAcademicPdfsForBoardClassSubject);
router.get("/:board/class/:classNumber/subject/:subject", getAcademicSubject);

module.exports = router;
