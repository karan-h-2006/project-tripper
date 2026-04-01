const { recordExpense } = require("../services/ledgerService");

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

    const result = await recordExpense({
      tripId,
      paidBy: userId,
      amount,
      description,
      category,
    });

    return res.status(201).json(result);
  } catch (error) {
    console.error("Create expense error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  createExpense,
};

