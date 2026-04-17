const Trip = require("../models/Trip");
const ItineraryItem = require("../models/ItineraryItem");
const Activity = require("../models/Activity");
const Expense = require("../models/Expense");

const runBudgetOptimizer = async (tripId, io) => {
  try {
    console.log(`[Budget Optimizer] Starting optimization for trip ${tripId}`);

    const socketServer = io || arguments[1];
    const roomString = tripId.toString();

    // Fetch the Trip to get totalBudget (cast to Number())
    const trip = await Trip.findById(tripId).select("total_budget");
    if (!trip) {
      console.error(
        `[Budget Optimizer] Optimization aborted: trip not found for tripId ${tripId}`
      );
      return;
    }

    // Fetch all expenses for the trip to calculate remainingBudget
    const expenseTotals = await Expense.aggregate([
      { $match: { tripId: trip._id } },
      { $group: { _id: "$tripId", totalSpent: { $sum: "$amount" } } },
    ]);

    const totalSpent = Number(expenseTotals[0]?.totalSpent || 0);
    const totalBudget = Number(trip.total_budget || 0);
    const remainingBudget = totalBudget - totalSpent;

    // Fetch ALL ItineraryItems for this trip where visited: false
    const items = await ItineraryItem.find({ tripId, visited: false });

    // Reset State: Set item.isSkipped = false on ALL fetched items
    let totalUnvisitedCost = 0;
    for (let item of items) {
      item.isSkipped = false;
      totalUnvisitedCost += Number(item.estimated_cost || 0);
    }

    if (items.length === 0) {
      return;
    }

    // Sort the items array by estimated_cost DESCENDING (most expensive first)
    items.sort((a, b) => Number(b.estimated_cost || 0) - Number(a.estimated_cost || 0));

    const skippedNames = [];
    let currentCost = totalUnvisitedCost;

    // The Deterministic While Loop
    for (let item of items) {
      if (currentCost <= remainingBudget) break;
      
      item.isSkipped = true;
      currentCost -= Number(item.estimated_cost || 0);
      skippedNames.push(item.location_name);
    }

    // Save to DB: FORCE the database to commit the flags before moving on
    await Promise.all(items.map((item) => item.save()));

    // The Broadcast
    if (socketServer) {
        let text = "";
        if (skippedNames.length > 0) {
            text = `⚙️ Budget Optimizer: Removed ${skippedNames.join(', ')} from the timeline to stay under the ₹${remainingBudget} remaining budget.`;
        } else if (totalUnvisitedCost <= remainingBudget) {
            text = `✅ Budget Optimizer: We can afford the rest of the itinerary!`;
        }

        if (text !== "") {
            const activity = await Activity.create({
                tripId,
                text,
                type: "system",
            });
            socketServer.to(roomString).emit("itinerary_updated");
            socketServer.to(roomString).emit("receive_message", activity);
        } else {
             socketServer.to(roomString).emit("itinerary_updated");
        }
    }

    console.log(`[Budget Optimizer] Successfully optimized budget for trip ${tripId}`);
  } catch (error) {
    console.error(
      `[Budget Optimizer] Failed to optimize budget for trip ${tripId}:`,
      error.message
    );
  }
};

module.exports = { runBudgetOptimizer };
