const { recordExpense } = require("../services/ledgerService");

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

    const { expense, balances } = await recordExpense({
      tripId,
      paidBy: userId,
      amount: numericAmount,
      description,
      category: "UPI_PAYMENT",
    });

  // ... existing validation and ledger TODO comment ...
  // --- NEW SOCKET CODE ---
  const io = req.app.get('io');
  // Broadcast to everyone currently viewing this specific trip
  io.to(tripId).emit('budget_updated', { 
      message: `${req.user.username} just added an expense of ₹${amount}`,
      amountAdded: amount 
  });
  // -----------------------

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
