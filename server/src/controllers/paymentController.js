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

    // TODO: Call Vikas's ledgerService here to hash and save this expense to the Immutable Ledger, passing the utrReference as proof of transaction.

    return res.status(200).json({
      status: "success",
      message: "UPI Payment recorded pending ledger hash",
      data: {
        amount,
        utrReference,
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
