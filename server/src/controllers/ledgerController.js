const { getLedgerSummary } = require("../services/ledgerService");
const Trip = require("../models/Trip");
const { calculateBalances } = require("../services/splitwiseService");

const getLedger = async (req, res) => {
  try {
    const { tripId } = req.params;

    if (!tripId) {
      return res.status(400).json({ message: "tripId is required" });
    }

    const ledger = await getLedgerSummary(tripId);
    const trip = await Trip.findById(tripId).populate(
      "members",
      "username profilePic"
    );

    if (!trip) {
      return res.status(404).json({ message: "Trip not found" });
    }

    const {
      totalBudget,
      totalSpent,
      remainingBudget,
      transactions,
      balances,
    } = ledger;
    const { exactBalances } = await calculateBalances(tripId);

    return res.status(200).json({
      totalBudget,
      totalSpent,
      remainingBudget,
      transactions,
      balances,
      personToPersonBalances: exactBalances || [],
      members: trip.members || [],
    });
  } catch (error) {
    if (error.message === "Trip not found") {
      return res.status(404).json({ message: "Trip not found" });
    }

    console.error("Get ledger error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  getLedger,
};
