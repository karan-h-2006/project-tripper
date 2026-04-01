const express = require("express");
const { createTrip, getMyTrips, getTripById } = require("../controllers/tripController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/my", protect, getMyTrips);
router.get("/:id", protect, getTripById);
router.post("/create", protect, createTrip);

module.exports = router;

