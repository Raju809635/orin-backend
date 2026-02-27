const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/authMiddleware");
const validate = require("../middleware/validate");
const { preferencesSchema } = require("../validators/settingsValidator");
const { getPreferences, updatePreferences } = require("../controllers/settingsController");

router.get("/preferences", verifyToken, getPreferences);
router.patch("/preferences", verifyToken, validate(preferencesSchema), updatePreferences);

module.exports = router;
