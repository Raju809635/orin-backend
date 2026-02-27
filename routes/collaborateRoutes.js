const express = require("express");
const router = express.Router();
const validate = require("../middleware/validate");
const { collaborateApplySchema } = require("../validators/collaborateValidator");
const { applyCollaborate } = require("../controllers/collaborateController");

router.post("/apply", validate(collaborateApplySchema), applyCollaborate);

module.exports = router;

