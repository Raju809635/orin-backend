const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/authMiddleware");
const { softDeleteMe } = require("../controllers/accountController");

router.delete("/me", verifyToken, softDeleteMe);

module.exports = router;
