const crypto = require("crypto");
const Expense = require("../models/Expense");

const generateHash = (prevHash, amount, description, timestamp) => {
  const data = `${prevHash}|${amount}|${description}|${timestamp.toISOString()}`;
  return crypto.createHash("sha256").update(data).digest("hex");
};

const recordExpense = async (expenseData) => {
  const { tripId, paidBy, amount, description, category } = expenseData;

  if (!tripId || !paidBy || typeof amount !== "number" || !description) {
    throw new Error("Missing required expense fields");
  }

  const lastExpense = await Expense.findOne({ tripId }).sort({
    timestamp: -1,
    _id: -1,
  });

  const prevHash = lastExpense ? lastExpense.currHash : "0";
  const timestamp = new Date();
  const currHash = generateHash(prevHash, amount, description, timestamp);

  const expense = await Expense.create({
    tripId,
    paidBy,
    amount,
    description,
    category,
    prevHash,
    currHash,
    timestamp,
  });

  return expense;
};

module.exports = {
  recordExpense,
};

