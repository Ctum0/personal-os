'use client';

import React, { useState, useEffect } from 'react';
import { useWorkspace } from '@/components/layout/WorkspaceContext';
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
    setEndDate(now.toISOString().slice(0, 10));
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
    <div className="p-6 max-w-7xl mx-auto space-y-6">
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

      {/* Date Filter Bar */}
      <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-xl flex items-center gap-3 text-xs">
        <span className="text-zinc-400 font-medium">Reporting Period:</span>
        <input
          type="date"
          value={startDate}
          onChange={e => setStartDate(e.target.value)}
          className="bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1 text-zinc-200"
        />
        <span className="text-zinc-500">to</span>
        <input
          type="date"
          value={endDate}
          onChange={e => setEndDate(e.target.value)}
          className="bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1 text-zinc-200"
        />
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

      {/* Category Expense Breakdown */}
      {reports && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-bold text-zinc-200">Spending Breakdown by Category</h2>
          <div className="space-y-3">
            {reports.expenseByCategory?.map((cat: any) => (
              <div key={cat.categoryId} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-zinc-200">{cat.categoryName}</span>
                  <span className="font-mono text-zinc-300 font-semibold">
                    ${cat.amount} ({cat.percentage}%)
                  </span>
                </div>
                <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${cat.percentage}%`,
                      backgroundColor: cat.color || '#6366f1',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
