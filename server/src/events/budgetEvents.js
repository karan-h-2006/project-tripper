const EventEmitter = require("events");
const { optimizeItinerary } = require("../services/aiService");

const budgetEmitter = new EventEmitter();

budgetEmitter.on("budget_critical", async (tripId, io) => {
  try {
    console.warn(
      `[Budget] Critical budget trigger fired for tripId ${tripId}`
    );
    await optimizeItinerary(tripId, io);
  } catch (error) {
    console.error(
      `[Budget] Failed to process critical budget event for tripId ${tripId}:`,
      error.message
    );
  }
});

module.exports = budgetEmitter;
