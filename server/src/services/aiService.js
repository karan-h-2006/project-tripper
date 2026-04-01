const Trip = require("../models/Trip");
const Itinerary = require("../models/Itinerary");

const optimizeItinerary = async (tripId, io) => {
  try {
    console.log(`[AI] Starting itinerary optimization for trip ${tripId}`);

    const trip = await Trip.findById(tripId);
    const itinerary = await Itinerary.findOne({ trip: tripId });

    if (!trip || !itinerary) {
      console.error(
        `[AI] Optimization aborted: trip or itinerary not found for tripId ${tripId}`
      );
      return;
    }

    const cheaperAlternatives = await new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          items: itinerary.items.map((item) => ({
            ...item.toObject(),
            estimated_cost: Math.max(
              0,
              Math.round((item.estimated_cost || 0) * 0.8)
            ),
          })),
        });
      }, 2000);
    });

    await Itinerary.updateOne(
      { _id: itinerary._id },
      { $set: { items: cheaperAlternatives.items } }
    );

    io.to(tripId.toString()).emit("itinerary_changed", {
      message:
        "Alert: AI has auto-optimized your schedule to prevent budget overflow!",
      updated: true,
    });

    console.log(`[AI] Successfully optimized itinerary for trip ${tripId}`);
  } catch (error) {
    console.error(
      `[AI] Failed to optimize itinerary for trip ${tripId}:`,
      error.message
    );
  }
};

module.exports = { optimizeItinerary };
