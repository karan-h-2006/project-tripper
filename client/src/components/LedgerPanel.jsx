import { useCallback, useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import api from "../api/axios";
import { useAuth } from "../context/useAuth.js";

const formatCurrency = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));

const formatDate = (value) => {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const formatDateTime = (value) => {
  if (!value) return "-";
  return new Date(value).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const LedgerPanel = ({ tripId, socket, refreshTrigger }) => {
  const { user } = useAuth();
  const [ledgerData, setLedgerData] = useState({
    totalBudget: 0,
    totalSpent: 0,
    remainingBudget: 0,
    transactions: [],
    balances: [],
    personToPersonBalances: [],
    members: [],
  });
  const [expandedTxnId, setExpandedTxnId] = useState(null);
  const currentUserId = String(user?._id || "");

  const fetchLedger = useCallback(async () => {
    if (!tripId) return;
    try {
      const response = await api.get(`/ledger/${tripId}`);
      setLedgerData(response.data || {});
    } catch (error) {
      console.error("Failed to load ledger:", error);
    }
  }, [tripId]);

  useEffect(() => {
    fetchLedger();
  }, [fetchLedger, refreshTrigger]);

  useEffect(() => {
    if (!socket) return;

    socket.on("budget_updated", fetchLedger);
    return () => {
      socket.off("budget_updated", fetchLedger);
    };
  }, [socket, fetchLedger]);

  const transactions = useMemo(
    () =>
      [...(ledgerData.transactions || [])].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      ),
    [ledgerData.transactions]
  );

  const budget = Number(ledgerData.totalBudget || 0);
  const spent = Number(ledgerData.totalSpent || 0);
  const burnPercentRaw = budget > 0 ? (spent / budget) * 100 : 0;
  const burnPercent = Math.min(Math.max(burnPercentRaw, 0), 100);
  const overspent = spent > budget && budget > 0;
  const personalizedBalances = useMemo(() => {
    const rawBalances = Array.isArray(ledgerData.personToPersonBalances)
      ? ledgerData.personToPersonBalances
      : [];
    const members = Array.isArray(ledgerData.members) ? ledgerData.members : [];

    if (!currentUserId || rawBalances.length === 0) {
      return { toPay: [], toReceive: [] };
    }

    const getId = (value) => String(value?._id || value || "");

    const toPay = rawBalances
      .filter((edge) => getId(edge.from) === currentUserId)
      .map((edge) => {
        const otherUserId = getId(edge.to);
        const otherUser =
          members.find((m) => String(m._id) === otherUserId) || {
            _id: otherUserId,
            username: "Unknown Member",
          };

        return {
          user: otherUser,
          amount: Number(Number(edge.amount || 0).toFixed(2)),
        };
      })
      .filter((item) => item.amount > 0.01);

    const toReceive = rawBalances
      .filter((edge) => getId(edge.to) === currentUserId)
      .map((edge) => {
        const otherUserId = getId(edge.from);
        const otherUser =
          members.find((m) => String(m._id) === otherUserId) || {
            _id: otherUserId,
            username: "Unknown Member",
          };

        return {
          user: otherUser,
          amount: Number(Number(edge.amount || 0).toFixed(2)),
        };
      })
      .filter((item) => item.amount > 0.01);

    toPay.sort((a, b) => b.amount - a.amount);
    toReceive.sort((a, b) => b.amount - a.amount);

    return { toPay, toReceive };
  }, [ledgerData.personToPersonBalances, ledgerData.members, currentUserId]);

  return (
    <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-5 space-y-5">
      <div>
        <h2 className="text-base font-semibold text-gray-900">Trip Ledger</h2>
        <p className="text-xs text-gray-500 mt-1">Live budget and transactions</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
          <p className="text-[11px] uppercase tracking-wide text-gray-500">Total Budget</p>
          <p className="mt-1 text-lg font-semibold text-gray-900">{formatCurrency(ledgerData.totalBudget)}</p>
        </div>
        <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
          <p className="text-[11px] uppercase tracking-wide text-gray-500">Total Spent</p>
          <p className="mt-1 text-lg font-semibold text-gray-900">{formatCurrency(ledgerData.totalSpent)}</p>
        </div>
        <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
          <p className="text-[11px] uppercase tracking-wide text-gray-500">Remaining</p>
          <p className={`mt-1 text-lg font-semibold ${ledgerData.remainingBudget < 0 ? "text-red-600" : "text-emerald-600"}`}>
            {formatCurrency(ledgerData.remainingBudget)}
          </p>
        </div>
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between text-xs text-gray-600">
          <span>Budget burn</span>
          <span>{burnPercentRaw.toFixed(1)}%</span>
        </div>
        <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${overspent ? "bg-red-500" : "bg-indigo-600"}`}
            style={{ width: `${burnPercent}%` }}
          />
        </div>
        {overspent && (
          <p className="mt-2 text-xs text-red-600">
            Spending has crossed the trip budget.
          </p>
        )}
      </div>

      <div className="rounded-xl border border-gray-100 p-3">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Settlement Balances</h3>

        {personalizedBalances.toPay.length === 0 && personalizedBalances.toReceive.length === 0 ? (
          <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            You are all settled up! 🎉
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-red-100 bg-red-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-red-700">To Pay</p>
              <ul className="mt-2 space-y-2">
                {personalizedBalances.toPay.length === 0 ? (
                  <li className="text-xs text-red-600">Nothing to pay.</li>
                ) : (
                  personalizedBalances.toPay.map((item) => (
                    <li key={`pay-${item.user._id}`} className="rounded-md bg-white/80 px-2 py-1 text-sm text-gray-700">
                      You owe <span className="font-medium">{item.user.username}</span>:{" "}
                      <span className="font-semibold text-red-600">{formatCurrency(item.amount)}</span>
                    </li>
                  ))
                )}
              </ul>
            </div>

            <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">To Receive</p>
              <ul className="mt-2 space-y-2">
                {personalizedBalances.toReceive.length === 0 ? (
                  <li className="text-xs text-emerald-700">Nothing to receive.</li>
                ) : (
                  personalizedBalances.toReceive.map((item) => (
                    <li key={`receive-${item.user._id}`} className="rounded-md bg-white/80 px-2 py-1 text-sm text-gray-700">
                      <span className="font-medium">{item.user.username}</span> owes you:{" "}
                      <span className="font-semibold text-green-600">{formatCurrency(item.amount)}</span>
                    </li>
                  ))
                )}
              </ul>
            </div>
          </div>
        )}
        </div>
      

      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-2">Transaction History</h3>
        <div className="max-h-80 overflow-y-auto rounded-xl border border-gray-100 divide-y divide-gray-100">
          {transactions.length === 0 ? (
            <div className="p-4 text-sm text-gray-500">No transactions yet.</div>
          ) : (
            transactions.map((txn) => {
              const isExpanded = expandedTxnId === txn._id;
              return (
                <div key={txn._id} className="p-3">
                  <button
                    type="button"
                    onClick={() => setExpandedTxnId(isExpanded ? null : txn._id)}
                    className="w-full text-left flex items-center justify-between gap-3"
                  >
                    <div>
                      <p className="text-xs text-gray-500">{formatDate(txn.date)}</p>
                      <p className="text-sm font-medium text-gray-800">{txn.paidBy?.username || "Member"} paid</p>
                    </div>
                    <p className="text-sm font-semibold text-gray-900">{formatCurrency(txn.amount)}</p>
                  </button>

                  {isExpanded && (
                    <div className="mt-3 rounded-lg bg-gray-50 p-3 text-xs text-gray-700 space-y-1">
                      <p><span className="font-medium">Description:</span> {txn.description || "-"}</p>
                      <p><span className="font-medium">Merchant:</span> {txn.merchantName || "-"}</p>
                      <p><span className="font-medium">UTR:</span> {txn.utrReference || "-"}</p>
                      <p><span className="font-medium">Timestamp:</span> {formatDateTime(txn.date)}</p>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
};

LedgerPanel.propTypes = {
  tripId: PropTypes.string.isRequired,
  socket: PropTypes.shape({
    on: PropTypes.func,
    off: PropTypes.func,
  }),
  refreshTrigger: PropTypes.number,
};

LedgerPanel.defaultProps = {
  socket: null,
};

export default LedgerPanel;
