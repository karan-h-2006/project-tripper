const { getSupabase } = require("../lib/supabase");
const { EXPENSE_SELECT, parseAmount } = require("../lib/legacyCompat");
const { fetchTripSnapshot, mapTripMembersAsUsers } = require("./tripDataService");

const loadTripExpenses = async (tripId) => {
  const { data, error } = await getSupabase()
    .from("expenses")
    .select(EXPENSE_SELECT)
    .eq("trip_id", tripId)
    .order("occurred_at", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  return data || [];
};

const calculateBalances = async (tripId) => {
  const tripRow = await fetchTripSnapshot(tripId);
  if (!tripRow) {
    throw new Error("Trip not found");
  }

  const members = mapTripMembersAsUsers(tripRow, { compact: true });
  const memberIds = members.map((member) => String(member._id));
  const net = {};
  const debtMatrix = {};

  memberIds.forEach((memberId) => {
    net[memberId] = 0;
    debtMatrix[memberId] = {};
  });

  const expenses = await loadTripExpenses(tripId);
  for (const expense of expenses) {
    const payerId = String(expense.paid_by);
    const splits = Array.isArray(expense.expense_splits) ? expense.expense_splits : [];

    if (!memberIds.includes(payerId)) {
      continue;
    }

    splits.forEach((split) => {
      const splitUserId = String(split.user_id);
      const shareAmount = parseAmount(split.share_amount);

      if (!memberIds.includes(splitUserId) || shareAmount <= 0) {
        return;
      }

      net[splitUserId] -= shareAmount;
      net[payerId] += shareAmount;

      if (splitUserId !== payerId) {
        debtMatrix[splitUserId][payerId] =
          parseAmount((debtMatrix[splitUserId][payerId] || 0) + shareAmount);
      }
    });
  }

  const exactBalances = [];
  const processedPairs = new Set();

  for (const debtorId of memberIds) {
    for (const creditorId of memberIds) {
      if (debtorId === creditorId) {
        continue;
      }

      const pairKey = [debtorId, creditorId].sort().join("|");
      if (processedPairs.has(pairKey)) {
        continue;
      }
      processedPairs.add(pairKey);

      const forward = parseAmount(debtMatrix[debtorId]?.[creditorId] || 0);
      const reverse = parseAmount(debtMatrix[creditorId]?.[debtorId] || 0);
      const netAmount = parseAmount(forward - reverse);

      if (netAmount > 0.01) {
        exactBalances.push({ from: debtorId, to: creditorId, amount: netAmount });
      } else if (netAmount < -0.01) {
        exactBalances.push({
          from: creditorId,
          to: debtorId,
          amount: parseAmount(Math.abs(netAmount)),
        });
      }
    }
  }

  const creditors = [];
  const debtors = [];

  Object.entries(net).forEach(([userId, amount]) => {
    const rounded = parseAmount(amount);
    if (rounded > 0.01) {
      creditors.push({ userId, amount: rounded });
    } else if (rounded < -0.01) {
      debtors.push({ userId, amount: parseAmount(Math.abs(rounded)) });
    }
  });

  creditors.sort((left, right) => right.amount - left.amount);
  debtors.sort((left, right) => right.amount - left.amount);

  const simplifiedBalances = [];
  let debtorIndex = 0;
  let creditorIndex = 0;

  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex];
    const creditor = creditors[creditorIndex];
    const amount = parseAmount(Math.min(debtor.amount, creditor.amount));

    if (amount > 0.01) {
      simplifiedBalances.push({
        owes: debtor.userId,
        to: creditor.userId,
        amount,
      });
    }

    debtor.amount = parseAmount(debtor.amount - amount);
    creditor.amount = parseAmount(creditor.amount - amount);

    if (debtor.amount <= 0.01) {
      debtorIndex += 1;
    }
    if (creditor.amount <= 0.01) {
      creditorIndex += 1;
    }
  }

  return { simplifiedBalances, exactBalances };
};

module.exports = {
  calculateBalances,
  loadTripExpenses,
};
