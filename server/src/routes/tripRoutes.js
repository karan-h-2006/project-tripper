const express = require("express");
const { createTrip } = require("../controllers/tripController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/create", protect, createTrip);

module.exports = router;

