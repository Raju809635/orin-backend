const express = require("express");
const { verifyToken, authorizeRoles } = require("../middleware/authMiddleware");
const { getNewsByCategory, getNewsCategories } = require("../controllers/newsController");

const router = express.Router();

router.use(verifyToken, authorizeRoles("student", "mentor", "admin"));
router.get("/categories", getNewsCategories);
router.get("/:category", getNewsByCategory);

module.exports = router;
