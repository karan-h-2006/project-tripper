const mongoose = require("mongoose");
const Trip = require("../models/Trip");
const Expense = require("../models/Expense");

/**
 * Calculate and persist simplified balances for a trip.
 *
 * @param {string|mongoose.Types.ObjectId} tripId - The trip identifier.
 * @param {Object} [newExpense] - Optional newly created expense to include in the calculation.
 * @returns {Promise<Array>} An array of simplified balances of the form:
 *   [{ owes: ObjectId, to: ObjectId, amount: Number }]
 */
const calculateBalances = async (tripId, newExpense) => {
  // Normalize tripId to a Mongoose ObjectId
  const normalizedTripId =
    typeof tripId === "string" ? new mongoose.Types.ObjectId(tripId) : tripId;

  // 1. Load the trip with members so we know who participates
  const trip = await Trip.findById(normalizedTripId).populate("members", "_id");

  if (!trip) {
    throw new Error("Trip not found");
  }

  // 2. Load all persisted expenses for this trip
  const expenses = await Expense.find({ tripId: normalizedTripId });

  // Optionally include the just-created expense if caller passes it
  if (newExpense) {
    expenses.push(newExpense);
  }

  // 3. Build a net balance map for each member.
  //    Convention:
  //      net[user] > 0  => user should receive money overall
  //      net[user] < 0  => user owes money overall
  const memberIds = trip.members.map((m) => m._id.toString());
  const net = {};
  memberIds.forEach((id) => {
    net[id] = 0;
  });

  // We assume each expense is split equally among ALL trip members.
  // If later you support per-expense participants/shares, adapt this loop.
  for (const expense of expenses) {
    const payerId = expense.paidBy.toString();

    // Guard: only consider expenses where the payer is part of the trip
    if (!net.hasOwnProperty(payerId)) {
      continue;
    }

    const share = expense.amount / memberIds.length;

    // For each member:
    //  - decrease their net by their fair share (they "consume" this amount)
    //  - increase payer's net by that same share
    for (const memberId of memberIds) {
      net[memberId] -= share;
      net[payerId] += share;
    }
  }

  // 4. Convert net balances into a simplified set of directed debts.
  //    - Collect creditors (net > 0) and debtors (net < 0).
  //    - Greedily match largest debtor with largest creditor, paying off
  //      as much as possible each step. This minimizes the number of edges
  //      in the debt graph while preserving correctness.
  const creditors = [];
  const debtors = [];

  Object.entries(net).forEach(([userId, amount]) => {
    const rounded = Number(amount.toFixed(2));
    if (rounded > 0.01) {
      creditors.push({ userId, amount: rounded });
    } else if (rounded < -0.01) {
      debtors.push({ userId, amount: -rounded }); // store as positive "owes" amount
    }
  });

  // Sort so we always match the largest amounts first (helps keep graph small)
  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);

  const simplifiedBalances = [];
  let i = 0;
  let j = 0;

  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];

    const amount = Math.min(debtor.amount, creditor.amount);

    if (amount > 0.01) {
      simplifiedBalances.push({
        owes: new mongoose.Types.ObjectId(debtor.userId),
        to: new mongoose.Types.ObjectId(creditor.userId),
        amount: Number(amount.toFixed(2)),
      });
    }

    debtor.amount -= amount;
    creditor.amount -= amount;

    if (debtor.amount <= 0.01) {
      i += 1;
    }
    if (creditor.amount <= 0.01) {
      j += 1;
    }
  }

  // 5. Persist the simplified balances on the Trip document
  trip.balances = simplifiedBalances;
  await trip.save();

  return simplifiedBalances;
};

module.exports = {
  calculateBalances,
};

