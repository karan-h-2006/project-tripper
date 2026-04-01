const mongoose = require("mongoose");

const activitySchema = new mongoose.Schema({
  tripId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Trip",
    required: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null,
  },
  text: {
    type: String,
    required: true,
    trim: true,
  },
  type: {
    type: String,
    enum: ["chat", "system"],
    default: "chat",
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const Activity = mongoose.model("Activity", activitySchema);

module.exports = Activity;

