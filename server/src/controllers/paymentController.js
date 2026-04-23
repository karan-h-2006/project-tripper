const { getRequesterId, getRequesterName, isUuid, toLegacyTripStatus } = require("../lib/legacyCompat");
const { createAndEmitActivity } = require("../services/activityFeedService");
const { recordExpense } = require("../services/ledgerService");
const { runBudgetOptimizer } = require("../services/budgetOptimizer");
const { fetchTripSnapshot, getMembershipForUser } = require("../services/tripDataService");

const recordUpiPayment = async (req, res) => {
  try {
    const { tripId, merchantUpiId, merchantName, amount, utrReference } = req.body;
    const userId = getRequesterId(req);

    if (
      !merchantUpiId ||
      !merchantName ||
      !amount ||
      !utrReference ||
      !tripId ||
      !userId
    ) {
      return res.status(400).json({ message: "Missing required payment fields" });
    }

    if (!isUuid(userId) || !isUuid(tripId)) {
      return res.status(400).json({ message: "Missing required payment fields" });
    }

    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({ message: "Amount must be a positive number" });
    }

    const io = req.app.get("io");
    const tripRow = await fetchTripSnapshot(tripId);
    if (!tripRow) {
      return res.status(404).json({ message: "Trip not found" });
    }

    if (!getMembershipForUser(tripRow, userId)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    if (toLegacyTripStatus(tripRow.status) === "ended") {
      return res.status(403).json({
        message: "This trip has ended. No further transactions are allowed.",
      });
    }

    const description = `UPI payment to ${merchantName} (${merchantUpiId}), UTR: ${utrReference}`;
    const { expense, balances } = await recordExpense({
      tripId,
      paidBy: userId,
      amount: numericAmount,
      description,
      category: "UPI_PAYMENT",
      io,
    });

    await createAndEmitActivity({
      io,
      tripId,
      userId,
      text: `${getRequesterName(req)} paid INR ${numericAmount}`,
      type: "system",
    });

    io?.to(String(tripId)).emit("budget_updated", {
      message: `${getRequesterName(req)} just added an expense of INR ${numericAmount}`,
      amountAdded: numericAmount,
    });

    await runBudgetOptimizer(tripId, io);
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
