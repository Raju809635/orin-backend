const express = require("express");
const { recordAppMetricEvent } = require("../controllers/appMetricsController");

const router = express.Router();

router.post("/event", recordAppMetricEvent);

module.exports = router;
