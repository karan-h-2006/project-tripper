const express = require("express");
const { protect } = require("../middleware/authMiddleware.js");
const {
  addItineraryItem,
  getItinerary,
  updateItineraryItem,
  deleteItineraryItem,
} = require("../controllers/itineraryController");

const router = express.Router();

router.post("/:tripId", protect, addItineraryItem);
router.get("/:tripId", protect, getItinerary);
router.put("/:itemId", protect, updateItineraryItem);
router.delete("/:itemId", protect, deleteItineraryItem);

module.exports = router;

/*
server.js snippet (mount at /api/itinerary):

  const itineraryRoutes = require("./routes/itineraryRoutes");
  app.use("/api/itinerary", itineraryRoutes);
*/

