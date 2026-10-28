'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useWorkspace } from '@/components/layout/WorkspaceContext';
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  PieChart,
  Landmark,
  Receipt,
  HelpCircle,
  ArrowRight,
  ShieldCheck,
  Plus,
  FileSpreadsheet,
  Calendar,
  AlertCircle,
} from 'lucide-react';

export default function FinanceDashboard() {
  const { setSelectedExplainer, setIsQuickAddOpen } = useWorkspace();
  const [balances, setBalances] = useState<any[]>([]);
  const [safeToSpend, setSafeToSpend] = useState<any | null>(null);
  const [budget, setBudget] = useState<any | null>(null);
  const [netWorth, setNetWorth] = useState<any | null>(null);
  const [recentTx, setRecentTx] = useState<any[]>([]);
  const [upcomingBills, setUpcomingBills] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    Promise.all([
      fetch('/api/finance/accounts').then(r => r.json()),
      fetch('/api/finance/safe-to-spend').then(r => r.json()),
      fetch('/api/finance/budgets').then(r => r.json()),
      fetch('/api/finance/net-worth').then(r => r.json()),
      fetch('/api/finance/transactions?limit=6').then(r => r.json()),
      fetch('/api/finance/recurring').then(r => r.json()),
    ])
      .then(([accData, stsData, bgtData, nwData, txData, recData]) => {
        setBalances(accData.accounts || []);
        setSafeToSpend(stsData.safeToSpend);
        setBudget(bgtData.budget);
        setNetWorth(nwData.netWorth);
        setRecentTx((txData.transactions || []).slice(0, 5));
        setUpcomingBills((recData.recurringRules || []).slice(0, 4));
      })
      .finally(() => setIsLoading(false));
  }, []);

  const totalLiquid = balances
    .filter(a => a.accountType === 'checking' || a.accountType === 'cash' || a.accountType === 'savings')
    .reduce((sum, a) => sum + Math.max(0, parseFloat(a.currentBalance)), 0);

  return (
    <div className="w-full px-8 py-6 space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 bg-gradient-to-r from-zinc-900 via-zinc-900 to-emerald-950/40 border border-zinc-800 rounded-xl">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">Finance Workspace</span>
            <span className="text-zinc-600">•</span>
            <span className="text-xs text-zinc-400">Deterministic Balanced Ledger</span>
          </div>
          <h1 className="text-xl font-bold text-zinc-100">Financial Reality & Clarity</h1>
          <p className="text-xs text-zinc-400">
            Total liquid funds: ${totalLiquid.toFixed(2)} USD • Every calculation is explainable & backed by ledger lines.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Link
            href="/finance/import"
            className="flex items-center gap-1.5 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 rounded-lg text-xs font-medium transition-all"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
            <span>Import CSV</span>
          </Link>
          <button
            onClick={() => setIsQuickAddOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow-sm transition-all shadow-emerald-600/20 active:scale-95"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Transaction</span>
          </button>
        </div>
      </div>

      {/* Primary KPI Row: Safe to Spend & Net Worth & Liquid Funds */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Safe-to-Spend Feature Card */}
        {safeToSpend && (
          <div className="p-5 bg-gradient-to-b from-zinc-900 to-zinc-900/60 border border-zinc-800 rounded-xl space-y-3 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                Safe-To-Spend Projection
              </span>
              <button
                onClick={() => setSelectedExplainer(safeToSpend.explainer)}
                className="text-zinc-500 hover:text-emerald-400 transition-colors"
                title="Inspect Safe-to-spend calculation inputs"
              >
                <HelpCircle className="w-4 h-4" />
              </button>
            </div>
            <div>
              <p className="text-3xl font-extrabold text-zinc-100 font-mono tracking-tight">
                ${safeToSpend.safeToSpendAmount}
              </p>
              <p className="text-[11px] text-zinc-400 mt-1">
                Uncommitted spending money for next {safeToSpend.daysHorizon} days
              </p>
            </div>

            <div className="pt-2 border-t border-zinc-800/80 space-y-1 text-xs">
              <div className="flex items-center justify-between text-zinc-400">
                <span>Liquid Funds:</span>
                <span className="font-mono text-zinc-200">${safeToSpend.liquidFunds}</span>
              </div>
              <div className="flex items-center justify-between text-zinc-400">
                <span>Upcoming Obligations:</span>
                <span className="font-mono text-amber-400">-${safeToSpend.upcomingObligations}</span>
              </div>
              <div className="flex items-center justify-between text-zinc-400">
                <span>Safety Buffer Cushion:</span>
                <span className="font-mono text-zinc-400">-${safeToSpend.safetyBuffer}</span>
              </div>
            </div>
          </div>
        )}

        {/* Net Worth Card */}
        {netWorth && (
          <div className="p-5 bg-zinc-900 border border-zinc-800 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-400">
                Net Worth Snapshot
              </span>
              <button
                onClick={() => setSelectedExplainer(netWorth.explainer)}
                className="text-zinc-500 hover:text-blue-400 transition-colors"
                title="Inspect Net Worth calculation"
              >
                <HelpCircle className="w-4 h-4" />
              </button>
            </div>
            <div>
              <p className="text-3xl font-extrabold text-zinc-100 font-mono tracking-tight">
                ${netWorth.netWorth}
              </p>
              <p className="text-[11px] text-zinc-400 mt-1">Valued Assets minus Liabilities</p>
            </div>

            <div className="pt-2 border-t border-zinc-800/80 space-y-1 text-xs">
              <div className="flex items-center justify-between text-zinc-400">
                <span>Total Assets:</span>
                <span className="font-mono text-emerald-400">+${netWorth.totalAssets}</span>
              </div>
              <div className="flex items-center justify-between text-zinc-400">
                <span>Total Liabilities:</span>
                <span className="font-mono text-red-400">-${netWorth.totalLiabilities}</span>
              </div>
            </div>
          </div>
        )}

        {/* Budget Pulse Card */}
        {budget && (
          <div className="p-5 bg-zinc-900 border border-zinc-800 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-purple-400">
                Monthly Budget Pulse
              </span>
              <button
                onClick={() => setSelectedExplainer(budget.explainer)}
                className="text-zinc-500 hover:text-purple-400 transition-colors"
                title="Inspect Budget calculations"
              >
                <HelpCircle className="w-4 h-4" />
              </button>
            </div>
            <div>
              <p className="text-3xl font-extrabold text-zinc-100 font-mono tracking-tight">
                ${budget.totalRemaining}
              </p>
              <p className="text-[11px] text-zinc-400 mt-1">
                Remaining out of ${budget.totalAllocated} budgeted
              </p>
            </div>

            <div className="pt-2 border-t border-zinc-800/80 space-y-1">
              <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    parseFloat(budget.overallPercentUsed) > 90 ? 'bg-red-500' : 'bg-purple-500'
                  }`}
                  style={{ width: `${Math.min(100, parseFloat(budget.overallPercentUsed))}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[11px] text-zinc-500">
                <span>{budget.overallPercentUsed}% Spent</span>
                <span>{budget.periodStart} to {budget.periodEnd}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Main Grid: Accounts Balances & Recent Ledger Transactions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 Cols): Transactions Ledger */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-sm">
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Receipt className="w-4 h-4 text-emerald-400" />
                <h2 className="font-semibold text-sm text-zinc-100">Recent Ledger Transactions</h2>
              </div>
              <Link href="/finance/transactions" className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-medium">
                <span>Full Ledger</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="divide-y divide-zinc-800/60">
              {recentTx.length === 0 ? (
                <div className="p-8 text-center text-xs text-zinc-500">
                  No transactions recorded yet. Use Quick Add or CSV Import to populate your ledger.
                </div>
              ) : (
                recentTx.map(tx => {
                  const isIncome = tx.transaction_type === 'income' || tx.transaction_type === 'refund';
                  return (
                    <div
                      key={tx.id}
                      className="p-3.5 flex items-center justify-between hover:bg-zinc-800/40 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs ${
                            isIncome
                              ? 'bg-emerald-500/20 text-emerald-400'
                              : 'bg-zinc-800 text-zinc-300'
                          }`}
                        >
                          {isIncome ? '+' : '-'}
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-zinc-200">{tx.description}</p>
                          <p className="text-[11px] text-zinc-500">
                            {tx.account_name} • {tx.date} {tx.category_name ? `• ${tx.category_name}` : ''}
                          </p>
                        </div>
                      </div>

                      <div className="text-right">
                        <span
                          className={`text-xs font-mono font-bold ${
                            isIncome ? 'text-emerald-400' : 'text-zinc-100'
                          }`}
                        >
                          {isIncome ? '+' : '-'}${tx.amount}
                        </span>
                        <span className="block text-[10px] text-zinc-500 uppercase">{tx.status}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Upcoming Bills Strip */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-amber-400" />
                <h2 className="text-sm font-semibold text-zinc-100">Upcoming Bills & Obligations</h2>
              </div>
              <Link href="/finance/recurring" className="text-xs text-emerald-400 hover:text-emerald-300">
                All Subscriptions →
              </Link>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {upcomingBills.map(bill => (
                <div key={bill.id} className="p-3 bg-zinc-950 border border-zinc-800 rounded-lg flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-zinc-200">{bill.name}</p>
                    <p className="text-[11px] text-zinc-500">Due {bill.next_due_date} • {bill.account_name}</p>
                  </div>
                  <span className="font-mono text-xs font-bold text-amber-400">
                    ${bill.expected_amount}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Account Balances */}
        <div className="space-y-6">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-sm">
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Landmark className="w-4 h-4 text-emerald-400" />
                <h2 className="font-semibold text-sm text-zinc-100">Account Balances</h2>
              </div>
              <Link href="/finance/accounts" className="text-xs text-emerald-400 hover:text-emerald-300">
                Manage →
              </Link>
            </div>

            <div className="p-3 divide-y divide-zinc-800/40">
              {balances.map(acc => (
                <div key={acc.accountId} className="py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div
                      className="w-2.5 h-8 rounded-full"
                      style={{ backgroundColor: acc.displayColor || '#10b981' }}
                    />
                    <div>
                      <div className="flex items-center gap-1.5">
                        <p className="text-xs font-semibold text-zinc-200">{acc.accountName}</p>
                        <button
                          onClick={() => setSelectedExplainer(acc.explainer)}
                          className="text-zinc-600 hover:text-zinc-300"
                          title="Inspect calculation inputs"
                        >
                          <HelpCircle className="w-3 h-3" />
                        </button>
                      </div>
                      <p className="text-[10px] text-zinc-500 uppercase font-mono">{acc.accountType} • {acc.currency}</p>
                    </div>
                  </div>

                  <span className="font-mono text-xs font-bold text-zinc-100">
                    ${acc.currentBalance}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
