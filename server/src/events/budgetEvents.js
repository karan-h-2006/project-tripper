const EventEmitter = require("events");
feature/join-trip-and-splitwise
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


const eventEmitter = new EventEmitter();

eventEmitter.on("budget_critical", (tripId) => {
  console.log(
    `[ALERT] Trip ${tripId}: Budget has dropped below 20% threshold!`
  );
});

module.exports = eventEmitter;

main
