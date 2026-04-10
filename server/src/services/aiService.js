const Trip = require("../models/Trip");
const ItineraryItem = require("../models/ItineraryItem");
const Activity = require("../models/Activity");
const Expense = require("../models/Expense");

const generateCheaperAlternativesFromAI = async (items, remainingBudget) => {
  const prompt = `The user has ₹${remainingBudget} left. Generate a new list of activities. The total combined cost MUST be strictly less than ₹${remainingBudget}. Do not use the old expensive locations; suggest cheaper, realistic alternatives.`;

  console.log(`[AI] Prompt: ${prompt}`);

  // Placeholder AI simulation with strict budget cap. Replace with real LLM call later.
  const targetTotal = Math.max(0, Math.floor(remainingBudget * 0.9));
  const perItemCap =
    items.length > 0 ? Math.max(0, Math.floor(targetTotal / items.length)) : 0;

  return items.map((item, index) => {
    const nextCost =
      index === items.length - 1
        ? Math.max(
            0,
            targetTotal -
              items
                .slice(0, index)
                .reduce(
                  (sum, it) =>
                    sum +
                    Math.max(
                      0,
                      Math.min(perItemCap, Math.floor(Number(it.estimated_cost || 0) * 0.7))
                    ),
                  0
                )
          )
        : Math.max(
            0,
            Math.min(perItemCap, Math.floor(Number(item.estimated_cost || 0) * 0.7))
          );

    return {
      location_name: `${item.location_name} (Budget Alternative)`,
      location: item.location,
      scheduled_time: item.scheduled_time,
      priority_score: item.priority_score,
      day: item.day,
      activity: item.activity,
      estimated_cost: nextCost,
      visited: false,
    };
  });
};

const optimizeItinerary = async (tripId, io) => {
  try {
    console.log(`[AI] Starting itinerary optimization for trip ${tripId}`);

    const socketServer = io || arguments[1];
    const roomString = tripId.toString();

    const trip = await Trip.findById(tripId).select("total_budget");
    const pendingItems = await ItineraryItem.find({ tripId, visited: false });

    if (!trip) {
      console.error(
        `[AI] Optimization aborted: trip not found for tripId ${tripId}`
      );
      return;
    }

    const expenseTotals = await Expense.aggregate([
      { $match: { tripId: trip._id } },
      { $group: { _id: "$tripId", totalSpent: { $sum: "$amount" } } },
    ]);

    const totalSpent = Number(expenseTotals[0]?.totalSpent || 0);
    const totalBudget = Number(trip.total_budget || 0);
    const remainingBudget = totalBudget - totalSpent;
    const unvisitedCost = pendingItems.reduce(
      (sum, item) => sum + Number(item.estimated_cost || 0),
      0
    );

    if (unvisitedCost <= remainingBudget) {
      const activity = await Activity.create({
        tripId,
        text: `✅ Budget check passed: Remaining itinerary (₹${unvisitedCost}) is fully funded by the remaining budget (₹${remainingBudget}).`,
        type: "system",
      });

      if (socketServer) {
        socketServer.to(roomString).emit("receive_message", activity);
      }
      return;
    }

    if (pendingItems.length === 0) {
      return;
    }

    const newAiItems = await generateCheaperAlternativesFromAI(
      pendingItems,
      remainingBudget
    );

    // Replace unvisited itinerary rows with fresh AI suggestions.
    await ItineraryItem.deleteMany({ tripId, visited: false });
    const dbReadyItems = newAiItems.map((item) => ({
      ...item,
      tripId,
      visited: false,
    }));
    await ItineraryItem.insertMany(dbReadyItems);

    const activity = await Activity.create({
      tripId,
      text: `🤖 AI Optimization: Remaining costs exceeded our budget. Unvisited locations have been replaced with cheaper alternatives to keep us under ₹${remainingBudget}.`,
      type: "system",
    });

    if (socketServer) {
      socketServer.to(roomString).emit("itinerary_updated");
      socketServer.to(roomString).emit("receive_message", activity);
    }

    console.log(`[AI] Successfully optimized itinerary for trip ${tripId}`);
  } catch (error) {
    console.error(
      `[AI] Failed to optimize itinerary for trip ${tripId}:`,
      error.message
    );
  }
};

module.exports = { optimizeItinerary };
