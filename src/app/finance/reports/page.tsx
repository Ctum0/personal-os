'use client';

import React, { useState, useEffect } from 'react';
import { useWorkspace } from '@/components/layout/WorkspaceContext';
import { toISODate } from "@/lib/time";
import {
  Sliders,
  TrendingUp,
  TrendingDown,
  PieChart,
  HelpCircle,
  Calendar,
} from 'lucide-react';

export default function FinanceReportsPage() {
  const { setSelectedExplainer } = useWorkspace();
  const [reports, setReports] = useState<any | null>(null);
  const [startDate, setStartDate] = useState('2026-10-01');
  const [endDate, setEndDate] = useState('2026-10-31');

  useEffect(() => {
    const now = new Date();
    setStartDate(now.toISOString().slice(0, 7) + '-01');
    setEndDate(toISODate(now));
  }, []);

  const loadReports = () => {
    fetch(`/api/finance/reports?startDate=${startDate}&endDate=${endDate}`)
      .then(r => r.json())
      .then(data => setReports(data.reports));
  };

  useEffect(() => {
    loadReports();
  }, [startDate, endDate]);

  return (
    <div className="w-full max-w-[1720px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
            <Sliders className="w-5 h-5 text-emerald-400" />
            <span>Financial Reports & Forecasts</span>
          </h1>
          <p className="text-xs text-zinc-400">
            Operating income, expenses, and category distributions verified by ledger lines.
          </p>
        </div>

        {reports && (
          <button
            onClick={() => setSelectedExplainer(reports.explainer)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-medium border border-zinc-700 transition-colors"
          >
            <HelpCircle className="w-3.5 h-3.5 text-emerald-400" />
            <span>How Report Is Calculated</span>
          </button>
        )}
      </div>

      {/* Date Filter & Preset Bar */}
      <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-3">
          <span className="text-zinc-400 font-medium">Period:</span>
          <input
            type="date"
            aria-label="Reporting start date"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
            className="bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1 text-zinc-200"
          />
          <span className="text-zinc-500">to</span>
          <input
            type="date"
            aria-label="Reporting end date"
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
            className="bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1 text-zinc-200"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              const now = new Date();
              setStartDate(now.toISOString().slice(0, 7) + '-01');
              setEndDate(toISODate(now));
            }}
            className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-md text-[11px] font-medium transition-colors"
          >
            This Month
          </button>
          <button
            type="button"
            onClick={() => {
              const now = new Date();
              const prev = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
              setStartDate(toISODate(prev));
              setEndDate(toISODate(now));
            }}
            className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-md text-[11px] font-medium transition-colors"
          >
            Last 30 Days
          </button>
          <button
            type="button"
            onClick={() => {
              const now = new Date();
              setStartDate(`${now.getFullYear()}-01-01`);
              setEndDate(toISODate(now));
            }}
            className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-md text-[11px] font-medium transition-colors"
          >
            Year to Date
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      {reports && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="p-5 bg-zinc-900 border border-zinc-800 rounded-xl space-y-1">
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span>Total Operating Income</span>
              <TrendingUp className="w-4 h-4 text-emerald-400" />
            </div>
            <p className="text-3xl font-extrabold text-emerald-400 font-mono">${reports.totalIncome}</p>
            <p className="text-[11px] text-zinc-500">Excludes internal transfers</p>
          </div>

          <div className="p-5 bg-zinc-900 border border-zinc-800 rounded-xl space-y-1">
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span>Total Net Expenses</span>
              <TrendingDown className="w-4 h-4 text-red-400" />
            </div>
            <p className="text-3xl font-extrabold text-red-400 font-mono">${reports.totalExpenses}</p>
            <p className="text-[11px] text-zinc-500">Includes period refunds offset</p>
          </div>

          <div className="p-5 bg-zinc-900 border border-zinc-800 rounded-xl space-y-1">
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span>Net Savings & Rate</span>
              <PieChart className="w-4 h-4 text-purple-400" />
            </div>
            <p className="text-3xl font-extrabold text-zinc-100 font-mono">${reports.netSavings}</p>
            <p className="text-[11px] text-zinc-400 font-semibold">{reports.savingsRatePercent}% Savings Rate</p>
          </div>
        </div>
      )}

      {/* Transfer Neutrality Callout */}
      <div className="p-3.5 bg-zinc-900 border border-zinc-800 rounded-xl flex items-start gap-3">
        <HelpCircle className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
        <div className="text-xs text-zinc-300">
          <span className="font-semibold text-zinc-200">Transfer-Neutrality Verification: </span>
          Internal transfers between ledger accounts are net-zero balance movements and are strictly excluded from Operating Income and Expense totals to prevent false cash-flow inflation.
        </div>
      </div>

      {/* Category Breakdowns: Income & Expenses Side-by-Side */}
      {reports && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Income Breakdown */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h2 className="text-sm font-bold text-zinc-200 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-400" />
                <span>Operating Income Sources</span>
              </h2>
              <span className="text-xs font-mono font-bold text-emerald-400">${reports.totalIncome}</span>
            </div>

            {(!reports.incomeByCategory || reports.incomeByCategory.length === 0) ? (
              <div className="py-8 text-center text-xs text-zinc-500">
                No operating income transactions recorded in this period.
              </div>
            ) : (
              <div className="space-y-3">
                {reports.incomeByCategory.map((cat: any) => (
                  <div key={cat.categoryId} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-zinc-200">{cat.categoryName}</span>
                      <span className="font-mono text-emerald-400 font-semibold">
                        ${cat.amount} ({cat.percentage}%)
                      </span>
                    </div>
                    <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${cat.percentage}%`,
                          backgroundColor: cat.color || '#10b981',
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Expense Breakdown */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h2 className="text-sm font-bold text-zinc-200 flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-red-400" />
                <span>Spending by Category</span>
              </h2>
              <span className="text-xs font-mono font-bold text-red-400">${reports.totalExpenses}</span>
            </div>

            {(!reports.expenseByCategory || reports.expenseByCategory.length === 0) ? (
              <div className="py-8 text-center text-xs text-zinc-500">
                No operating expense transactions recorded in this period.
              </div>
            ) : (
              <div className="space-y-3">
                {reports.expenseByCategory.map((cat: any) => (
                  <div key={cat.categoryId} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-zinc-200">{cat.categoryName}</span>
                      <span className="font-mono text-zinc-300 font-semibold">
                        ${cat.amount} ({cat.percentage}%)
                      </span>
                    </div>
                    <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${cat.percentage}%`,
                          backgroundColor: cat.color || '#ef4444',
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
