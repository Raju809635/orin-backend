const express = require("express");
const router = express.Router();

const { verifyToken } = require("../middleware/authMiddleware");
const { getDomainTree } = require("../controllers/metaController");

// Domain Guide taxonomy used across AI modules and UI selectors.
router.get("/domain-tree", verifyToken, getDomainTree);

module.exports = router;

