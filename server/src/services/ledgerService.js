const crypto = require("crypto");
const { getSupabase } = require("../lib/supabase");
const {
  EXPENSE_SELECT,
  parseAmount,
  parseExpenseMeta,
  parseTripMeta,
  serializeExpenseMeta,
} = require("../lib/legacyCompat");
const budgetEmitter = require("../events/budgetEvents");
const { calculateBalances, loadTripExpenses } = require("./splitwiseService");
const { fetchTripSnapshot } = require("./tripDataService");

const generateHash = (prevHash, amount, description, timestamp) => {
  const data = `${prevHash}|${amount}|${description}|${timestamp.toISOString()}`;
  return crypto.createHash("sha256").update(data).digest("hex");
};

const parseUpiMetadata = (description = "") => {
  const merchantMatch = description.match(/UPI payment to (.+?) \(/i);
  const utrMatch = description.match(/UTR:\s*([A-Za-z0-9-]+)/i);

  return {
    merchantName: merchantMatch ? merchantMatch[1] : null,
    utrReference: utrMatch ? utrMatch[1] : null,
  };
};

const mapLegacyExpense = (expenseRow) => {
  const meta = parseExpenseMeta(expenseRow.notes);
  return {
    _id: expenseRow.id,
    tripId: expenseRow.trip_id,
    paidBy: expenseRow.payer
      ? {
          _id: expenseRow.payer.id,
          username: expenseRow.payer.display_name || "Unknown user",
          profilePic: expenseRow.payer.avatar_url || null,
        }
      : expenseRow.paid_by,
    amount: parseAmount(expenseRow.amount),
    description: meta.description || expenseRow.title || "",
    category: expenseRow.category || meta.category || null,
    prevHash: meta.prevHash || "0",
    currHash: meta.currHash || "",
    timestamp: expenseRow.occurred_at,
  };
};

const recordExpense = async (expenseData) => {
  const { tripId, paidBy, amount, description, category, io } = expenseData;

  if (!tripId || !paidBy || typeof amount !== "number" || !description) {
    throw new Error("Missing required expense fields");
  }

  const tripRow = await fetchTripSnapshot(tripId);
  if (!tripRow) {
    throw new Error("Trip not found");
  }

  const members = (tripRow.trip_members || []).filter((member) => !member.removed_at);
  if (members.length === 0) {
    throw new Error("Trip has no active members");
  }

  const latestExpenses = await loadTripExpenses(tripId);
  const latestExpense = latestExpenses[latestExpenses.length - 1] || null;
  const latestMeta = latestExpense ? parseExpenseMeta(latestExpense.notes) : null;
  const prevHash = latestMeta?.currHash || "0";
  const timestamp = new Date();
  const currHash = generateHash(prevHash, amount, description, timestamp);
  const expenseId = crypto.randomUUID();

  const { data: expenseRows, error: expenseError } = await getSupabase()
    .from("expenses")
    .insert({
      id: expenseId,
      trip_id: tripId,
      paid_by: paidBy,
      title: description,
      amount: parseAmount(amount),
      currency: "INR",
      amount_base: parseAmount(amount),
      split_strategy: "EQUAL",
      category: category || null,
      notes: serializeExpenseMeta({
        description,
        prevHash,
        currHash,
        category: category || null,
      }),
      occurred_at: timestamp.toISOString(),
    })
    .select(EXPENSE_SELECT);

  if (expenseError) {
    throw expenseError;
  }

  const shareAmount = parseAmount(amount / members.length);
  const splitRows = members.map((member, index) => {
    const isLast = index === members.length - 1;
    const adjustedShare = isLast
      ? parseAmount(amount - shareAmount * (members.length - 1))
      : shareAmount;

    return {
      id: crypto.randomUUID(),
      expense_id: expenseId,
      user_id: member.user_id,
      share_amount: adjustedShare,
      share_ratio: Number((adjustedShare / amount).toFixed(8)),
      is_paid: String(member.user_id) === String(paidBy),
    };
  });

  const { error: splitError } = await getSupabase().from("expense_splits").insert(splitRows);
  if (splitError) {
    await getSupabase().from("expenses").delete().eq("id", expenseId);
    throw splitError;
  }

  const { data: insertedExpenseRows, error: refetchError } = await getSupabase()
    .from("expenses")
    .select(EXPENSE_SELECT)
    .eq("id", expenseId)
    .single();

  if (refetchError) {
    throw refetchError;
  }

  const budgetMeta = parseTripMeta(tripRow.cover_image_key);
  const totalBudget = parseAmount(budgetMeta.totalBudget);
  const allExpenses = await loadTripExpenses(tripId);
  const totalSpent = parseAmount(
    allExpenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0)
  );

  if (totalBudget > 0) {
    const remainingBudget = parseAmount(totalBudget - totalSpent);
    const criticalThreshold = parseAmount(totalBudget * 0.2);

    if (remainingBudget < criticalThreshold) {
      budgetEmitter.emit("budget_critical", String(tripId), io);
    }
  }

  const { simplifiedBalances, exactBalances } = await calculateBalances(tripId);
  return {
    expense: mapLegacyExpense(insertedExpenseRows),
    balances: simplifiedBalances,
    personToPersonBalances: exactBalances,
  };
};

const getLedgerSummary = async (tripId) => {
  const tripRow = await fetchTripSnapshot(tripId);
  if (!tripRow) {
    throw new Error("Trip not found");
  }

  const expenses = await loadTripExpenses(tripId);
  const totalSpent = parseAmount(
    expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0)
  );
  const tripMeta = parseTripMeta(tripRow.cover_image_key);
  const totalBudget = parseAmount(tripMeta.totalBudget);
  const remainingBudget = parseAmount(totalBudget - totalSpent);
  const { simplifiedBalances } = await calculateBalances(tripId);

  const transactions = expenses
    .map((expense) => {
      const meta = parseExpenseMeta(expense.notes);
      const description = meta.description || expense.title || "";
      const { merchantName, utrReference } = parseUpiMetadata(description);

      return {
        _id: expense.id,
        amount: parseAmount(expense.amount),
        description,
        merchantName,
        utrReference,
        date: expense.occurred_at,
        timestamp: expense.occurred_at,
        userId: expense.payer
          ? {
              _id: expense.payer.id,
              username: expense.payer.display_name || "Unknown user",
              profilePic: expense.payer.avatar_url || null,
            }
          : expense.paid_by,
        paidBy: expense.payer
          ? {
              _id: expense.payer.id,
              username: expense.payer.display_name || "Unknown user",
              profilePic: expense.payer.avatar_url || null,
            }
          : expense.paid_by,
      };
    })
    .sort((left, right) => new Date(right.date) - new Date(left.date));

  return {
    totalBudget,
    totalSpent,
    remainingBudget,
    transactions,
    balances: simplifiedBalances,
  };
};

module.exports = {
  getLedgerSummary,
  mapLegacyExpense,
  parseUpiMetadata,
  recordExpense,
};
