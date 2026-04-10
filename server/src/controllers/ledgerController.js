const { getLedgerSummary } = require("../services/ledgerService");

const getLedger = async (req, res) => {
  try {
    const { tripId } = req.params;

    if (!tripId) {
      return res.status(400).json({ message: "tripId is required" });
    }

    const ledger = await getLedgerSummary(tripId);
    return res.status(200).json(ledger);
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
