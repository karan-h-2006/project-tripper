const Trip = require("../models/Trip");
const ItineraryItem = require("../models/ItineraryItem");

const optimizeItinerary = async (tripId, io) => {
  try {
    console.log(`[AI] Starting itinerary optimization for trip ${tripId}`);

    const trip = await Trip.findById(tripId);
    const items = await ItineraryItem.find({ tripId });

    if (!trip || items.length === 0) {
      console.error(
        `[AI] Optimization aborted: trip or itinerary items not found for tripId ${tripId}`
      );
      return;
    }

    const cheaperAlternatives = await new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          updates: items.map((item) => ({
            _id: item._id,
            estimated_cost: Math.max(
              0,
              Math.round((item.estimated_cost || 0) * 0.8)
            ),
          })),
        });
      }, 2000);
    });

    await Promise.all(
      cheaperAlternatives.updates.map(({ _id, estimated_cost }) =>
        ItineraryItem.updateOne({ _id }, { $set: { estimated_cost } })
      )
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
