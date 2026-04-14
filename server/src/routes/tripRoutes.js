const express = require("express");
const {
  createTrip,
  getMyTrips,
  getTripById,
  promoteToAdmin,
  demoteFromAdmin,
  kickMember,
  updateTripBudget,
  endTrip,
} = require("../controllers/tripController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/my", protect, getMyTrips);
router.get("/:tripId", protect, getTripById);
router.post("/create", protect, createTrip);
router.put("/:tripId/promote/:userId", protect, promoteToAdmin);
router.put("/:tripId/demote/:userId", protect, demoteFromAdmin);
router.delete("/:tripId/kick/:userId", protect, kickMember);
router.put("/:tripId/budget", protect, updateTripBudget);
router.put("/:tripId/end", protect, endTrip);

module.exports = router;

