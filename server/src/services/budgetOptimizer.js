const Trip = require("../models/Trip");
const ItineraryItem = require("../models/ItineraryItem");
const Activity = require("../models/Activity");
const Expense = require("../models/Expense");

const runBudgetOptimizer = async (tripId, io) => {
  try {
    console.log(`[Budget Optimizer] Starting optimization for trip ${tripId}`);

    const socketServer = io || arguments[1];
    const roomString = tripId.toString();

    // 1. Calculate Remaining Budget safely
    const trip = await Trip.findById(tripId).select("total_budget");
    if (!trip) {
      console.error(
        `[Budget Optimizer] Optimization aborted: trip not found for tripId ${tripId}`
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

    // 2. Fetch Unvisited Items
    const items = await ItineraryItem.find({ tripId, visited: false });

    // 3. Calculate Total Initial Cost
    let currentCost = 0;
    items.forEach(item => { currentCost += Number(item.estimated_cost || 0); });

    // 4. Sort descending (most expensive first)
    items.sort((a, b) => Number(b.estimated_cost || 0) - Number(a.estimated_cost || 0));

    // 5. The State-Aware Loop
    const newlySkipped = [];
    const newlyRestored = [];

    for (let item of items) {
      const previouslySkipped = item.isSkipped;
      let currentlySkipped = false;
      
      // If the running cost exceeds our budget, we must skip this item
      if (currentCost > remainingBudget) {
        currentlySkipped = true;
        currentCost -= Number(item.estimated_cost || 0); // Remove its cost from the running total
      }
      
      // Track exact state changes for the Activity feed
      if (previouslySkipped === false && currentlySkipped === true) {
        newlySkipped.push(item.location_name);
      } else if (previouslySkipped === true && currentlySkipped === false) {
        newlyRestored.push(item.location_name);
      }
      
      // Apply the new state
      item.isSkipped = currentlySkipped;
    }

    // 6. Save DB and Emit
    await Promise.all(items.map((item) => item.save()));

    if (socketServer) {
      socketServer.to(roomString).emit("itinerary_updated");
      
      // ONLY emit if state actually changed
      if (newlySkipped.length > 0) {
        const act = await Activity.create({ 
          tripId, 
          text: `⚙️ Budget Optimizer: Removed ${newlySkipped.join(', ')} from the timeline to stay under the ₹${remainingBudget} remaining budget.`, 
          type: "system" 
        });
        socketServer.to(roomString).emit("receive_message", act);
      } else if (newlyRestored.length > 0) {
        const act = await Activity.create({ 
          tripId, 
          text: `✅ Budget Optimizer: Budget recovered! Restored ${newlyRestored.join(', ')} to the timeline.`, 
          type: "system" 
        });
        socketServer.to(roomString).emit("receive_message", act);
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
