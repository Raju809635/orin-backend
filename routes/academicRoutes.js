const express = require("express");
const {
  getAcademicBoards,
  getAcademicClasses,
  getAcademicSubjects,
  getAcademicSubjectsForClass,
  getAcademicSubject,
  getAcademicSubjectForClass,
  getAcademicTopicsForClassSubject,
  getAcademicResourceLibrary
} = require("../controllers/academicController");

const router = express.Router();

router.get("/library", getAcademicResourceLibrary);
router.get("/boards", getAcademicBoards);
router.get("/class/:classNumber/subjects", getAcademicSubjectsForClass);
router.get("/class/:classNumber/subject/:subject/topics", getAcademicTopicsForClassSubject);
router.get("/class/:classNumber/subject/:subject", getAcademicSubjectForClass);
router.get("/:board/classes", getAcademicClasses);
router.get("/:board/class/:classNumber/subjects", getAcademicSubjects);
router.get("/:board/class/:classNumber/subject/:subject", getAcademicSubject);

module.exports = router;
