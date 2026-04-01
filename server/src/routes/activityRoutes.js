const express = require("express");
const { getTripActivities } = require("../controllers/activityController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/:tripId", protect, getTripActivities);

module.exports = router;

