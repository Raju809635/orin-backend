const express = require("express");
const {
  getAcademicBoards,
  getAcademicClasses,
  getAcademicSubjects,
  getAcademicSubject,
  getAcademicResourceLibrary
} = require("../controllers/academicController");

const router = express.Router();

router.get("/library", getAcademicResourceLibrary);
router.get("/boards", getAcademicBoards);
router.get("/:board/classes", getAcademicClasses);
router.get("/:board/class/:classNumber/subjects", getAcademicSubjects);
router.get("/:board/class/:classNumber/subject/:subject", getAcademicSubject);

module.exports = router;
