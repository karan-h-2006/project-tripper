const EventEmitter = require("events");

const eventEmitter = new EventEmitter();

eventEmitter.on("budget_critical", (tripId) => {
  console.log(
    `[ALERT] Trip ${tripId}: Budget has dropped below 20% threshold!`
  );
});

module.exports = eventEmitter;

