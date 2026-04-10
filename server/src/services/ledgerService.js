const crypto = require("crypto");
const Expense = require("../models/Expense");
const Trip = require("../models/Trip");
const budgetEmitter = require("../events/budgetEvents");
const { calculateBalances } = require("./splitwiseService");

const generateHash = (prevHash, amount, description, timestamp) => {
  const data = `${prevHash}|${amount}|${description}|${timestamp.toISOString()}`;
  return crypto.createHash("sha256").update(data).digest("hex");
};

const recordExpense = async (expenseData) => {
  const { tripId, paidBy, amount, description, category, io } = expenseData;

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

  const trip = await Trip.findById(tripId).select("total_budget");

  if (trip && Number(trip.total_budget) > 0) {
    const [totals] = await Expense.aggregate([
      { $match: { tripId: expense.tripId } },
      { $group: { _id: "$tripId", totalSpent: { $sum: "$amount" } } },
    ]);

    const totalBudget = Number(trip.total_budget);
    const totalSpent = Number(totals?.totalSpent || 0);
    const remainingBudget = Number((totalBudget - totalSpent).toFixed(2));
    const criticalThreshold = Number((totalBudget * 0.2).toFixed(2));

    console.log(
      `[LEDGER] Trip ${tripId}: total=${totalBudget.toFixed(
        2
      )}, spent=${totalSpent.toFixed(2)}, remaining=${remainingBudget.toFixed(2)}`
    );

    if (remainingBudget < criticalThreshold) {
      console.log(
        `[LEDGER] Emitting budget_critical for trip ${tripId} (threshold ${criticalThreshold.toFixed(
          2
        )})`
      );
      budgetEmitter.emit("budget_critical", tripId.toString(), io);
    }
  }

  const balances = await calculateBalances(tripId, expense);
  return { expense, balances };
};

const parseUpiMetadata = (description = "") => {
  const merchantMatch = description.match(/UPI payment to (.+?) \(/i);
  const utrMatch = description.match(/UTR:\s*([A-Za-z0-9-]+)/i);

  return {
    merchantName: merchantMatch ? merchantMatch[1] : null,
    utrReference: utrMatch ? utrMatch[1] : null,
  };
};

const getLedgerSummary = async (tripId) => {
  const trip = await Trip.findById(tripId)
    .select("total_budget balances")
    .populate("balances.owes", "username")
    .populate("balances.to", "username");

  if (!trip) {
    throw new Error("Trip not found");
  }

  const expenses = await Expense.find({ tripId })
    .populate("paidBy", "username profilePic")
    .sort({ timestamp: -1, _id: -1 });

  const totalSpent = Number(
    expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0).toFixed(2)
  );
  const totalBudget = Number(trip.total_budget || 0);
  const remainingBudget = Number((totalBudget - totalSpent).toFixed(2));

  const transactions = expenses.map((expense) => {
    const { merchantName, utrReference } = parseUpiMetadata(expense.description);
    return {
      _id: expense._id,
      amount: Number(expense.amount || 0),
      description: expense.description || "",
      merchantName,
      utrReference,
      date: expense.timestamp,
      timestamp: expense.timestamp,
      userId: expense.paidBy,
      paidBy: expense.paidBy,
    };
  });

  const balances = Array.isArray(trip.balances)
    ? trip.balances.map((entry) => ({
        owes: entry.owes,
        to: entry.to,
        amount: Number(entry.amount || 0),
      }))
    : [];

  return {
    totalBudget,
    totalSpent,
    remainingBudget,
    transactions,
    balances,
  };
};

module.exports = {
  recordExpense,
  getLedgerSummary,
};

