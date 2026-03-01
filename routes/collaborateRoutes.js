const express = require("express");
const router = express.Router();
const validate = require("../middleware/validate");
const {
  collaborateApplySchema,
  collaborateStatusQuerySchema
} = require("../validators/collaborateValidator");
const {
  applyCollaborate,
  getCollaborateStatusByEmail
} = require("../controllers/collaborateController");

router.post("/apply", validate(collaborateApplySchema), applyCollaborate);
router.get("/status", validate(collaborateStatusQuerySchema, "query"), getCollaborateStatusByEmail);

module.exports = router;
