const express = require("express");
const {
  createTrip,
  getMyTrips,
  getTripById,
  promoteToAdmin,
  demoteFromAdmin,
  kickMember,
} = require("../controllers/tripController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/my", protect, getMyTrips);
router.get("/:id", protect, getTripById);
router.post("/create", protect, createTrip);
router.put("/:tripId/promote/:userId", protect, promoteToAdmin);
router.put("/:tripId/demote/:userId", protect, demoteFromAdmin);
router.delete("/:tripId/kick/:userId", protect, kickMember);

module.exports = router;

