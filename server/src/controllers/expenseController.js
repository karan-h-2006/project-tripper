const { getRequesterId, getRequesterName, isUuid, toLegacyTripStatus } = require("../lib/legacyCompat");
const { createAndEmitActivity } = require("../services/activityFeedService");
const { recordExpense } = require("../services/ledgerService");
const { runBudgetOptimizer } = require("../services/budgetOptimizer");
const { fetchTripSnapshot, getMembershipForUser } = require("../services/tripDataService");

const createExpense = async (req, res) => {
  try {
    const { tripId, amount, description, category } = req.body;
    const userId = getRequesterId(req);

    if (!tripId || typeof amount !== "number" || !description) {
      return res.status(400).json({
        message: "tripId, amount (number), and description are required",
      });
    }

    if (!userId || !isUuid(userId)) {
      return res.status(401).json({ message: "Not authorized" });
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

    const result = await recordExpense({
      tripId,
      paidBy: userId,
      amount,
      description,
      category,
      io,
    });

    await createAndEmitActivity({
      io,
      tripId,
      userId,
      text: `${getRequesterName(req)} added an expense of INR ${amount} for ${description || "the trip"}`,
      type: "system",
    });

    io?.to(String(tripId)).emit("budget_updated", {
      message: "Expense added manually",
      amountAdded: amount,
    });

    await runBudgetOptimizer(tripId, io);
    return res.status(201).json(result);
  } catch (error) {
    console.error("Create expense error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  createExpense,
};
