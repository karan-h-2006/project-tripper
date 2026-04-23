const { mapSupabaseError } = require("../lib/legacyCompat");
const { getLedgerSummary } = require("../services/ledgerService");
const { calculateBalances } = require("../services/splitwiseService");
const { fetchTripSnapshot, mapTripMembersAsUsers } = require("../services/tripDataService");

const getLedger = async (req, res) => {
  try {
    const { tripId } = req.params;

    if (!tripId) {
      return res.status(400).json({ message: "tripId is required" });
    }

    const ledger = await getLedgerSummary(tripId);
    const tripRow = await fetchTripSnapshot(tripId);
    if (!tripRow) {
      return res.status(404).json({ message: "Trip not found" });
    }

    const { exactBalances } = await calculateBalances(tripId);

    return res.status(200).json({
      totalBudget: ledger.totalBudget,
      totalSpent: ledger.totalSpent,
      remainingBudget: ledger.remainingBudget,
      transactions: ledger.transactions,
      balances: ledger.balances,
      personToPersonBalances: exactBalances || [],
      members: mapTripMembersAsUsers(tripRow, { compact: true }),
    });
  } catch (error) {
    if (error.message === "Trip not found") {
      return res.status(404).json({ message: "Trip not found" });
    }

    console.error("Get ledger error:", error);
    const mapped = mapSupabaseError(error);
    return res.status(mapped.status).json({ message: mapped.message });
  }
};

module.exports = {
  getLedger,
};
