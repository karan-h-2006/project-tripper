const { recordExpense } = require("../services/ledgerService");
const Activity = require("../models/Activity");
const Trip = require("../models/Trip");

const createExpense = async (req, res) => {
  try {
    const { tripId, amount, description, category } = req.body;

    const userId = req.user && req.user.id ? req.user.id : req.user?._id;

    if (!tripId || typeof amount !== "number" || !description) {
      return res.status(400).json({
        message: "tripId, amount (number), and description are required",
      });
    }

    if (!userId) {
      return res.status(401).json({ message: "Not authorized" });
    }

    const io = req.app.get("io");
    const trip = await Trip.findById(tripId).select("status");

    if (!trip) {
      return res.status(404).json({ message: "Trip not found" });
    }

    if (trip.status === "ended") {
      return res.status(403).json({
        message: "This trip has ended. No further transactions are allowed.",
      });
    }

    const result = await recordExpense({
      tripId,
      paidBy: userId,
      amount,
      description,
      category,
      io,
    });

    const activity = await Activity.create({
      tripId,
      userId: req.user.id,
      text: `${req.user.username} added an expense of ₹${amount} for ${description || "the trip"}`,
      type: "system",
    });

    await activity.populate("userId", "username profilePic");

    if (io) {
      const roomString = tripId.toString();
      io.to(roomString).emit("receive_message", activity);
      io.to(roomString).emit("budget_updated", {
        message: "Expense added manually",
        amountAdded: amount,
      });
    }

    return res.status(201).json(result);
  } catch (error) {
    console.error("Create expense error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  createExpense,
};

