const express = require("express");
const { joinTrip } = require("../controllers/userController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/join", protect, joinTrip);

module.exports = router;

