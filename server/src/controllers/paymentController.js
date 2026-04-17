const { recordExpense } = require("../services/ledgerService");
const Activity = require("../models/Activity");
const Trip = require("../models/Trip");
const { runBudgetOptimizer } = require("../services/budgetOptimizer");

const recordUpiPayment = async (req, res) => {
  try {
    const {
      tripId,
      merchantUpiId,
      merchantName,
      amount,
      utrReference,
    } = req.body;

    const userId = req.user && req.user.id ? req.user.id : req.user?._id;

    if (
      !merchantUpiId ||
      !merchantName ||
      !amount ||
      !utrReference ||
      !tripId ||
      !userId
    ) {
      return res
        .status(400)
        .json({ message: "Missing required payment fields" });
    }

    const numericAmount = Number(amount);

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return res
        .status(400)
        .json({ message: "Amount must be a positive number" });
    }

    const description = `UPI payment to ${merchantName} (${merchantUpiId}), UTR: ${utrReference}`;

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

    const { expense, balances } = await recordExpense({
      tripId,
      paidBy: userId,
      amount: numericAmount,
      description,
      category: "UPI_PAYMENT",
      io,
    });

    const activity = await Activity.create({
      tripId,
      userId,
      text: `${req.user.username} paid ₹${numericAmount}`,
      type: "system",
    });

    await activity.populate("userId", "username profilePic");

    const roomString = tripId.toString();
    io.to(roomString).emit("receive_message", activity);
    io.to(roomString).emit("budget_updated", {
      message: `${req.user.username} just added an expense of ₹${amount}`,
      amountAdded: amount,
    });

    await runBudgetOptimizer(tripId, req.app.get("io"));
    return res.status(200).json({
      status: "success",
      message: "UPI payment recorded in immutable ledger",
      data: {
        expense,
        balances,
      },
    });
  } catch (error) {
    console.error("Error recording UPI payment:", error);
    return res
      .status(500)
      .json({ message: "Failed to record UPI payment transaction" });
  }
};

module.exports = {
  recordUpiPayment,
};
