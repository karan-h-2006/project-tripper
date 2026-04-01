const mongoose = require("mongoose");

const itineraryItemSchema = new mongoose.Schema(
  {
    tripId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Trip",
      required: true,
      index: true,
    },
    location_name: {
      type: String,
      required: true,
      trim: true,
    },
    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number],
        required: true,
      },
    },
    estimated_cost: {
      type: Number,
      default: 0,
    },
    priority_score: {
      type: Number,
      enum: [1, 2, 3, 4, 5],
      default: 3,
    },
    scheduled_time: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true }
);

itineraryItemSchema.index({ location: "2dsphere" });

const ItineraryItem = mongoose.model("ItineraryItem", itineraryItemSchema);

module.exports = ItineraryItem;

