'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useWorkspace } from '@/components/layout/WorkspaceContext';
import {
  HelpCircle,
  ArrowRight,
  Plus,
  FileSpreadsheet,
  Landmark,
  Receipt,
  PieChart,
  BarChart3,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';

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
    <div className="w-full max-w-[1720px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* 1. Swiss Financial Statement Header */}
      <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-4 border-b border-white/[0.06] pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs text-zinc-500 font-medium">
            <span>Deterministic Accounting</span>
            <span>•</span>
            <span className="text-zinc-400 font-mono tabular-nums">
              Liquid Capital: ${totalLiquid.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </span>
          </div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-100 mt-1">
            Financial Reality
          </h1>
          <p className="text-xs text-zinc-400 max-w-xl">
            Double-entry balanced accounting ledger with mathematical proof contracts.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Link href="/finance/import">
            <Button
              variant="outline"
              size="sm"
              icon={<FileSpreadsheet className="w-3.5 h-3.5 text-zinc-400" />}
            >
              Import CSV
            </Button>
          </Link>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setIsQuickAddOpen(true)}
            icon={<Plus className="w-3.5 h-3.5" />}
          >
            New Entry
          </Button>
        </div>
      </div>

      {/* 2. Hero Safe-to-Spend Feature (The Primary Financial Truth) */}
      {safeToSpend && (() => {
        const pendingItem = safeToSpend.breakdown?.find((b: any) => b.label.toLowerCase().includes('pending'));
        const pendingAmt = pendingItem?.amount || safeToSpend.pendingExpenses || '0.00';
        const hasPending = parseFloat(pendingAmt) > 0;

        return (
          <div className="p-5 rounded-xl border border-white/[0.08] bg-zinc-900/40 relative">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    Safe-To-Spend Horizon
                  </span>
                  <button
                    onClick={() => setSelectedExplainer(safeToSpend.explainer)}
                    className="text-zinc-500 hover:text-zinc-300 p-0.5 rounded transition-colors inline-flex items-center gap-1"
                    title="Inspect Safe-to-spend inputs"
                    aria-label="Inspect Safe-to-spend inputs"
                  >
                    <HelpCircle className="w-3.5 h-3.5" />
                    <span className="text-[10px] underline decoration-dotted text-zinc-500">Explain calculation</span>
                  </button>
                  <span className="text-[11px] font-mono text-zinc-400 bg-zinc-950 px-2 py-0.5 rounded border border-white/[0.06]">
                    Rolling {safeToSpend.daysHorizon} Days
                  </span>
                  <span className="text-[10px] text-zinc-500 bg-zinc-950/80 px-2 py-0.5 rounded border border-white/[0.04]">
                    Base: {safeToSpend.currency} (No live FX)
                  </span>
                </div>

                <div className="flex items-baseline gap-3 mt-1.5">
                  <div className="text-3xl sm:text-4xl font-semibold tracking-tight text-zinc-100 font-mono tabular-nums">
                    ${safeToSpend.safeToSpendAmount}
                  </div>
                  {safeToSpend.isDeficit ? (
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-rose-500/20 text-rose-400 border border-rose-500/30">
                      Funding Deficit: -${safeToSpend.fundingDeficit} (Zero-Floored)
                    </span>
                  ) : (
                    <span className="text-xs font-mono text-emerald-400/80">
                      Fully Funded
                    </span>
                  )}
                </div>
                <p className="text-xs text-zinc-400 mt-1 max-w-xl leading-relaxed">
                  Uncommitted discretionary funds remaining after reserving for scheduled upcoming obligations, earmarked goals, uncleared deductions, and safety cushion.
                </p>
              </div>

              {/* Six-part transparent breakdown */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 lg:border-l lg:border-white/[0.06] lg:pl-6 text-xs shrink-0">
                <div className="p-2.5 bg-zinc-950/60 rounded-lg border border-white/[0.04]">
                  <span className="text-zinc-500 block text-[10px] uppercase font-medium">Liquid Cash</span>
                  <span className="font-mono text-zinc-200 tabular-nums font-semibold text-xs">
                    ${safeToSpend.liquidFunds}
                  </span>
                </div>
                <div className="p-2.5 bg-zinc-950/60 rounded-lg border border-white/[0.04]">
                  <span className="text-zinc-500 block text-[10px] uppercase font-medium">Pending Deductions</span>
                  <span className={`font-mono tabular-nums font-semibold text-xs ${hasPending ? 'text-amber-400' : 'text-zinc-400'}`}>
                    -${pendingAmt}
                  </span>
                </div>
                <div className="p-2.5 bg-zinc-950/60 rounded-lg border border-white/[0.04]">
                  <span className="text-zinc-500 block text-[10px] uppercase font-medium">Upcoming Recurring</span>
                  <span className="font-mono text-amber-400 tabular-nums font-semibold text-xs">
                    -${safeToSpend.upcomingObligations}
                  </span>
                </div>
                <div className="p-2.5 bg-zinc-950/60 rounded-lg border border-white/[0.04]">
                  <span className="text-zinc-500 block text-[10px] uppercase font-medium">Earmarked Savings</span>
                  <span className="font-mono text-sky-400 tabular-nums font-semibold text-xs">
                    -${safeToSpend.earmarkedSavings || '0.00'}
                  </span>
                </div>
                <div className="p-2.5 bg-zinc-950/60 rounded-lg border border-white/[0.04]">
                  <span className="text-zinc-500 block text-[10px] uppercase font-medium">Safety Buffer</span>
                  <span className="font-mono text-zinc-400 tabular-nums font-semibold text-xs">
                    -${safeToSpend.safetyBuffer}
                  </span>
                </div>
                <div className="p-2.5 bg-zinc-950/60 rounded-lg border border-white/[0.04]">
                  <span className="text-zinc-500 block text-[10px] uppercase font-medium">Funding Deficit</span>
                  <span className={`font-mono tabular-nums font-semibold text-xs ${safeToSpend.isDeficit ? 'text-rose-400' : 'text-zinc-500'}`}>
                    {safeToSpend.isDeficit ? `-$${safeToSpend.fundingDeficit}` : '$0.00'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 3. Secondary Balance Sheet & Budget Pulse Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Net Worth Snapshot */}
        {netWorth && (
          <div className="p-5 rounded-xl border border-white/[0.06] bg-zinc-900/30 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                  <BarChart3 className="w-3.5 h-3.5 text-zinc-500" />
                  <span>Net Worth</span>
                  {netWorth?.explainer && (
                    <button
                      onClick={() => setSelectedExplainer(netWorth.explainer)}
                      className="text-zinc-500 hover:text-zinc-300 p-0.5 rounded transition-colors inline-flex items-center"
                      title="Inspect Net Worth inputs"
                      aria-label="Inspect Net Worth inputs"
                    >
                      <HelpCircle className="w-3.5 h-3.5" />
                    </button>
                  )}
                </span>
                <Link href="/finance/net-worth" className="text-xs text-zinc-400 hover:text-zinc-200 font-medium">
                  Assets & Debts →
                </Link>
              </div>
              <div className="mt-3">
                <p className="text-2xl font-semibold tracking-tight text-zinc-100 font-mono tabular-nums">
                  ${netWorth.netWorth}
                </p>
                <p className="text-xs text-zinc-500 mt-0.5">Valued economic assets minus liabilities</p>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-white/[0.04] flex items-center justify-between text-xs">
              <span className="text-zinc-500">
                Assets: <strong className="text-zinc-300 font-mono tabular-nums font-normal">${netWorth.totalAssets}</strong>
              </span>
              <span className="text-zinc-500">
                Liabilities: <strong className="text-rose-400 font-mono tabular-nums font-normal">-${netWorth.totalLiabilities}</strong>
              </span>
            </div>
          </div>
        )}

        {/* Monthly Budget Pulse */}
        {budget && (
          <div className="p-5 rounded-xl border border-white/[0.06] bg-zinc-900/30 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                  <PieChart className="w-3.5 h-3.5 text-zinc-500" />
                  <span>Monthly Budget</span>
                  {budget?.explainer && (
                    <button
                      onClick={() => setSelectedExplainer(budget.explainer)}
                      className="text-zinc-500 hover:text-zinc-300 p-0.5 rounded transition-colors inline-flex items-center"
                      title="Inspect Budget calculation inputs"
                      aria-label="Inspect Budget calculation inputs"
                    >
                      <HelpCircle className="w-3.5 h-3.5" />
                    </button>
                  )}
                </span>
                <Link href="/finance/budgets" className="text-xs text-zinc-400 hover:text-zinc-200 font-medium">
                  Envelopes →
                </Link>
              </div>
              <div className="mt-3">
                <p className="text-2xl font-semibold tracking-tight text-zinc-100 font-mono tabular-nums">
                  ${budget.totalRemaining}
                </p>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Remaining of ${budget.totalAllocated} allocated
                </p>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-white/[0.04] space-y-1.5">
              <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-zinc-300 rounded-full transition-all duration-300"
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

      {/* 4. Detail Grid: Recent Ledger Rows & Liquid Accounts */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column (7 cols): Recent Ledger Transactions */}
        <div className="lg:col-span-7 rounded-xl border border-white/[0.06] bg-zinc-900/30 overflow-hidden">
          <div className="p-4 border-b border-white/[0.05] flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
              <Receipt className="w-3.5 h-3.5" />
              <span>Recent Ledger Entries</span>
            </h2>
            <Link
              href="/finance/transactions"
              className="text-xs text-zinc-400 hover:text-zinc-200 font-medium transition-colors"
            >
              Full Ledger →
            </Link>
          </div>

          <div className="divide-y divide-white/[0.04]">
            {recentTx.length === 0 ? (
              <div className="p-8 text-center text-xs text-zinc-500 space-y-2">
                <p>No ledger transactions recorded yet.</p>
                <Link
                  href="/finance/transactions"
                  className="inline-block px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded text-xs transition-colors"
                >
                  Record First Entry →
                </Link>
              </div>
            ) : (
              recentTx.map(tx => {
                const isIncome = tx.transaction_type === 'income' || tx.transaction_type === 'refund';
                return (
                  <div
                    key={tx.id}
                    className="p-3.5 flex items-center justify-between hover:bg-white/[0.02] transition-colors"
                  >
                    <div className="min-w-0 pr-4">
                      <p className="text-xs font-medium text-zinc-200 truncate">
                        {tx.description}
                      </p>
                      <p className="text-[11px] text-zinc-500 mt-0.5 truncate">
                        {tx.account_name} • {tx.date} {tx.category_name && `• ${tx.category_name}`}
                      </p>
                    </div>

                    <div className="text-right shrink-0">
                      <span
                        className={`text-xs font-mono font-semibold tabular-nums ${
                          isIncome ? 'text-emerald-400' : 'text-zinc-200'
                        }`}
                      >
                        {isIncome ? '+' : '-'}${tx.amount}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column (5 cols): Accounts & Balances */}
        <div className="lg:col-span-5 rounded-xl border border-white/[0.06] bg-zinc-900/30 overflow-hidden">
          <div className="p-4 border-b border-white/[0.05] flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
              <Landmark className="w-3.5 h-3.5" />
              <span>Accounts & Balances</span>
            </h2>
            <Link
              href="/finance/accounts"
              className="text-xs text-zinc-400 hover:text-zinc-200 font-medium transition-colors"
            >
              Reconcile →
            </Link>
          </div>

          <div className="divide-y divide-white/[0.04]">
            {balances.length === 0 ? (
              <div className="p-8 text-center text-xs text-zinc-500">
                No accounts registered yet.
              </div>
            ) : (
              balances.map(acc => {
                const isDebt = acc.accountType === 'credit_card' || acc.accountType === 'loan';
                const balNum = parseFloat(acc.currentBalance);
                return (
                  <div key={acc.accountId} className="p-3.5 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-zinc-200">{acc.accountName}</p>
                      <p className="text-[11px] text-zinc-500 capitalize">{acc.accountType.replace('_', ' ')}</p>
                    </div>
                    <div className="text-right font-mono text-xs font-semibold tabular-nums">
                      {isDebt && balNum < 0 ? (
                        <span className="text-amber-400 font-medium">
                          ${Math.abs(balNum).toFixed(2)} <span className="text-[10px] uppercase font-sans text-amber-500/80">owed</span>
                        </span>
                      ) : balNum < 0 ? (
                        <span className="text-rose-400 font-medium">
                          -${Math.abs(balNum).toFixed(2)} <span className="text-[10px] uppercase font-sans text-rose-500/80">overdraft</span>
                        </span>
                      ) : (
                        <span className="text-zinc-200">
                          ${balNum.toFixed(2)}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
