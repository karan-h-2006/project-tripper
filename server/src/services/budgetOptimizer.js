const { parseAmount, parseTripMeta } = require("../lib/legacyCompat");
const { createAndEmitActivity } = require("./activityFeedService");
const { fetchActivityRecord, fetchItineraryItems, updateItineraryItem } = require("./itineraryDataService");
const { loadTripExpenses } = require("./splitwiseService");
const { fetchTripSnapshot } = require("./tripDataService");

const runBudgetOptimizer = async (tripId, io) => {
  try {
    console.log(`[Budget Optimizer] Starting optimization for trip ${tripId}`);

    const tripRow = await fetchTripSnapshot(tripId);
    if (!tripRow) {
      console.error(`[Budget Optimizer] Optimization aborted: trip not found for ${tripId}`);
      return;
    }

    const expenses = await loadTripExpenses(tripId);
    const totalSpent = parseAmount(
      expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0)
    );
    const totalBudget = parseAmount(parseTripMeta(tripRow.cover_image_key).totalBudget);
    const remainingBudget = parseAmount(totalBudget - totalSpent);

    const items = await fetchItineraryItems(tripId);
    const pendingItems = items.filter((item) => !item.visited);
    let currentCost = parseAmount(
      pendingItems.reduce((sum, item) => sum + Number(item.estimated_cost || 0), 0)
    );

    const sortedItems = [...pendingItems].sort(
      (left, right) => Number(right.estimated_cost || 0) - Number(left.estimated_cost || 0)
    );

    const newlySkipped = [];
    const newlyRestored = [];

    for (const item of sortedItems) {
      const previouslySkipped = Boolean(item.isSkipped);
      let currentlySkipped = false;

      if (currentCost > remainingBudget) {
        currentlySkipped = true;
        currentCost = parseAmount(currentCost - Number(item.estimated_cost || 0));
      }

      if (!previouslySkipped && currentlySkipped) {
        newlySkipped.push(item.location_name);
      } else if (previouslySkipped && !currentlySkipped) {
        newlyRestored.push(item.location_name);
      }

      if (previouslySkipped !== currentlySkipped) {
        const record = await fetchActivityRecord(item._id);
        if (record) {
          await updateItineraryItem(record, { isSkipped: currentlySkipped });
        }
      }
    }

    if (io) {
      io.to(String(tripId)).emit("itinerary_updated");

      if (newlySkipped.length > 0) {
        await createAndEmitActivity({
          io,
          tripId,
          text: `Budget Optimizer: Removed ${newlySkipped.join(", ")} from the timeline to stay under the INR ${remainingBudget} remaining budget.`,
          type: "system",
        });
      } else if (newlyRestored.length > 0) {
        await createAndEmitActivity({
          io,
          tripId,
          text: `Budget Optimizer: Budget recovered! Restored ${newlyRestored.join(", ")} to the timeline.`,
          type: "system",
        });
      }
    }

    console.log(`[Budget Optimizer] Successfully optimized budget for trip ${tripId}`);
  } catch (error) {
    console.error(`[Budget Optimizer] Failed to optimize budget for trip ${tripId}:`, error.message);
  }
};

module.exports = { runBudgetOptimizer };
