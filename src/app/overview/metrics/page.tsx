'use client';

import React, { useState } from 'react';
import { useWorkspace } from '@/components/layout/WorkspaceContext';
import {
  BookOpen,
  Search,
  Filter,
  CheckCircle,
  XCircle,
  HelpCircle,
  Calculator,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';

interface MetricDefinition {
  id: string;
  name: string;
  domain: 'Finance' | 'Productivity' | 'Cross-Domain';
  definition: string;
  formula: string;
  sourceEvents: string;
  whatCounts: string[];
  whatDoesNotCount: string[];
  periodLogic: string;
  assumptions: string[];
}

const METRIC_DICTIONARY: MetricDefinition[] = [
  {
    id: 'safe-to-spend',
    name: 'Safe-to-Spend',
    domain: 'Finance',
    definition: 'The conservative portion of liquid funds available for discretionary spending without risking upcoming commitments or earmarked reserves.',
    formula: 'Safe-to-Spend = Liquid Account Balances - Reserved Upcoming Obligations - Earmarked Savings Funds - Configured Safety Buffer',
    sourceEvents: 'Ledger journal lines in liquid asset accounts, active recurring obligations, and savings goal targets.',
    whatCounts: ['Checking account posted balances', 'Cash / wallet accounts', 'Unallocated liquid funds'],
    whatDoesNotCount: ['Available credit limits (not real funds)', 'Illiquid investments', 'Double-counted savings reserves'],
    periodLogic: 'Evaluates upcoming obligations within the next 30 rolling calendar days.',
    assumptions: ['Credit card balances are treated as liabilities to be settled, not spendable liquidity.'],
  },
  {
    id: 'net-worth',
    name: 'Net Worth',
    domain: 'Finance',
    definition: 'Total monetary valuation of all owned economic assets minus all outstanding liabilities.',
    formula: 'Net Worth = Sum(Valued Assets) - Sum(Valued Liabilities)',
    sourceEvents: 'All posted ledger journal lines grouped by account classification (Asset vs Liability).',
    whatCounts: ['Liquid bank deposits', 'Investment accounts', 'Cash equivalents', 'Physical assets with verified valuations'],
    whatDoesNotCount: ['Projected future earnings', 'Unrealized speculative income', 'Duplicate account-linked savings balances'],
    periodLogic: 'Point-in-time calculation as of the latest posted ledger timestamp.',
    assumptions: ['Foreign currency balances are converted using the explicit rate snapshot recorded in the system.'],
  },
  {
    id: 'operating-cashflow',
    name: 'Operating Income & Expense Cashflow',
    domain: 'Finance',
    definition: 'Net true economic flow into and out of the household or individual across an accounting interval.',
    formula: 'Net Cashflow = Sum(Eligible Income Lines) - [Sum(Eligible Expense Lines) - Associated Refunds]',
    sourceEvents: 'Journal lines assigned to Income and Expense accounts.',
    whatCounts: ['External payroll and revenue receipts', 'Direct merchant spending', 'Vendor refunds (netted against expense)'],
    whatDoesNotCount: ['Internal transfers between checking and savings', 'Credit card payoff settlements (balance transfers)', 'Reconciliation balance adjustments'],
    periodLogic: 'Monthly, quarterly, or custom selected calendar date range.',
    assumptions: ['Transfers never fabricate income or expense.'],
  },
  {
    id: 'budget-actual-remaining',
    name: 'Budget Actual & Remaining Balance',
    domain: 'Finance',
    definition: 'Progress of actual category spending against allocated period spending caps, including configured rollovers.',
    formula: 'Remaining = Budget Cap + Prior Rollover - (Sum of Category Posted Expenses - Refunds)',
    sourceEvents: 'Journal lines assigned to the budgeted category within the active budget period.',
    whatCounts: ['Posted category expenses', 'Netted vendor refunds'],
    whatDoesNotCount: ['Pending transactions until posted', 'Transfers into or out of linked bank accounts'],
    periodLogic: 'Matches active budget period cycle (monthly, weekly, or annual).',
    assumptions: ['Negative remaining values reflect an overspent state.'],
  },
  {
    id: 'habit-streak',
    name: 'Habit Current & Best Streak',
    domain: 'Productivity',
    definition: 'The continuous sequence of scheduled days on which a habit has verified qualifying completion logs.',
    formula: 'Current Streak = Count of consecutive past scheduled days with status == "completed" or "excused"',
    sourceEvents: 'Verified habit log rows in habit_logs table.',
    whatCounts: ['Logs explicitly recorded as completed', 'Days explicitly marked excused/paused'],
    whatDoesNotCount: ['Unrecorded days (never silently assumed completed)', 'Logs with zero value when target is quantitative'],
    periodLogic: 'Evaluated retroactively day-by-day from yesterday back, plus today if already completed.',
    assumptions: ['If a habit was paused, the pause does not break the streak nor falsely increment it.'],
  },
  {
    id: 'project-progress-weighted',
    name: 'Weighted Task Project Progress',
    domain: 'Productivity',
    definition: 'Project completion percentage taking into account varying task effort durations rather than raw task counts.',
    formula: 'Progress % = [Sum of estimated durations of completed tasks / Sum of estimated durations of all tasks] * 100',
    sourceEvents: 'Tasks associated with the project containing non-null estimated_duration values.',
    whatCounts: ['Completed tasks weighted by estimated duration in minutes'],
    whatDoesNotCount: ['Soft-deleted tasks', 'Cancelled tasks excluded from project scope'],
    periodLogic: 'Continuous aggregation based on current task statuses.',
    assumptions: ['If a task has no estimate specified, it defaults to 1 standard weight unit.'],
  },
  {
    id: 'goal-progress-directional',
    name: 'Directional Goal Target Progress',
    domain: 'Productivity',
    definition: 'Normalized percentage of goal completion respecting ascending (growth) or descending (reduction) targets.',
    formula: 'Ascending: (Current - Start) / (Target - Start) * 100 | Descending: (Start - Current) / (Start - Target) * 100',
    sourceEvents: 'Goal measurement entries and current recorded value.',
    whatCounts: ['Verified historical measurement logs', 'Explicit current value updates'],
    whatDoesNotCount: ['Interpolated fictional measurements'],
    periodLogic: 'From goal start date to configured deadline date.',
    assumptions: ['Handles zero denominators and boundary clamps cleanly (clamped between 0% and 100%).'],
  },
];

export default function MetricDictionaryPage() {
  const { setSelectedExplainer } = useWorkspace();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDomain, setSelectedDomain] = useState<'All' | 'Finance' | 'Productivity'>('All');

  const filteredMetrics = METRIC_DICTIONARY.filter(m => {
    const matchesDomain = selectedDomain === 'All' || m.domain === selectedDomain;
    const matchesSearch =
      m.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.definition.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.formula.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesDomain && matchesSearch;
  });

  const inspectMetricInDrawer = (metric: MetricDefinition) => {
    setSelectedExplainer({
      metricName: metric.name,
      definition: metric.definition,
      formula: metric.formula,
      dateRange: { label: metric.periodLogic },
      currency: metric.domain === 'Finance' ? 'Exact Decimal' : 'N/A',
      includedEntities: metric.whatCounts,
      excludedEntities: metric.whatDoesNotCount,
      assumptions: metric.assumptions,
      inputs: {
        sourceEvents: metric.sourceEvents,
        policyDomain: metric.domain,
      },
      lastCalculatedAt: new Date().toISOString(),
    });
  };

  return (
    <div className="w-full px-8 py-6 space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-indigo-400" />
            <span>Metric & Calculation Dictionary</span>
          </h1>
          <p className="text-xs text-zinc-400">
            Authoritative, searchable contracts for every calculated figure in Personal OS. No speculative estimations.
          </p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-xl flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search metric definitions, formulas, or rules (e.g. Safe-to-Spend, Transfers, Streaks)..."
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-9 pr-3 py-2 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div className="flex items-center gap-1.5 self-end sm:self-center">
          {(['All', 'Finance', 'Productivity'] as const).map(domain => (
            <button
              key={domain}
              onClick={() => setSelectedDomain(domain)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                selectedDomain === domain
                  ? 'bg-indigo-600 text-white'
                  : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {domain}
            </button>
          ))}
        </div>
      </div>

      {/* Metric Cards List */}
      <div className="space-y-4">
        {filteredMetrics.map(metric => (
          <div
            key={metric.id}
            className="p-5 bg-zinc-900 border border-zinc-800 rounded-xl space-y-4 hover:border-zinc-700 transition-colors"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <span className="text-base font-bold text-zinc-100">{metric.name}</span>
                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                    metric.domain === 'Finance'
                      ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800/50'
                      : 'bg-indigo-950/60 text-indigo-400 border-indigo-800/50'
                  }`}
                >
                  {metric.domain}
                </span>
              </div>

              <button
                onClick={() => inspectMetricInDrawer(metric)}
                className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 font-medium self-start sm:self-center"
              >
                <HelpCircle className="w-3.5 h-3.5" />
                <span>Open in Explainer Drawer</span>
              </button>
            </div>

            <p className="text-xs text-zinc-300 leading-relaxed">{metric.definition}</p>

            <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-lg">
              <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider block mb-1">
                Deterministic Formula
              </span>
              <code className="text-xs font-mono text-emerald-400">{metric.formula}</code>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs pt-1">
              <div className="space-y-1.5">
                <span className="text-[11px] font-semibold text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle className="w-3.5 h-3.5" /> What Counts
                </span>
                <ul className="space-y-1 text-zinc-400 list-disc list-inside">
                  {metric.whatCounts.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>

              <div className="space-y-1.5">
                <span className="text-[11px] font-semibold text-rose-400 flex items-center gap-1.5">
                  <XCircle className="w-3.5 h-3.5" /> What Does NOT Count
                </span>
                <ul className="space-y-1 text-zinc-400 list-disc list-inside">
                  {metric.whatDoesNotCount.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="pt-2 border-t border-zinc-800/60 flex flex-col sm:flex-row justify-between gap-2 text-[11px] text-zinc-500">
              <span>Source: {metric.sourceEvents}</span>
              <span>Cadence: {metric.periodLogic}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
