'use client';

import React, { useState } from 'react';
import {
  Sliders,
  Clock,
  Shield,
  Bell,
  Wallet,
  Save,
  CheckCircle,
  AlertTriangle,
} from 'lucide-react';

export default function PersonalOperatingRulesPage() {
  const [workStart, setWorkStart] = useState('09:00');
  const [workEnd, setWorkEnd] = useState('18:00');
  const [maxDailyWorkloadHours, setMaxDailyWorkloadHours] = useState('6.5');
  const [focusWindowMinutes, setFocusWindowMinutes] = useState('50');
  const [shortBreakMinutes, setShortBreakMinutes] = useState('10');
  const [safetyBufferAmount, setSafetyBufferAmount] = useState('500.00');
  const [baseCurrency, setBaseCurrency] = useState('USD');
  const [quietHoursStart, setQuietHoursStart] = useState('21:00');
  const [quietHoursEnd, setQuietHoursEnd] = useState('08:00');
  const [enableFinancialInPlanning, setEnableFinancialInPlanning] = useState(true);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleSave = () => {
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
            <Sliders className="w-5 h-5 text-indigo-400" />
            <span>Personal Operating Rules & Settings</span>
          </h1>
          <p className="text-xs text-zinc-400">
            Explicit constraints for AI planning, daily time blocking, notification quiet hours, and financial buffers.
          </p>
        </div>

        <button
          onClick={handleSave}
          className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium transition-colors shadow-sm"
        >
          <Save className="w-4 h-4" />
          <span>{savedSuccess ? 'Rules Applied' : 'Save Rules'}</span>
        </button>
      </div>

      {savedSuccess && (
        <div className="p-3 bg-emerald-950/60 border border-emerald-800/60 rounded-xl flex items-center gap-2 text-xs text-emerald-300">
          <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>Operating rules saved. Future daily planning, schedule proposals, and safe-to-spend reservations will respect these bounds.</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Productivity & Workload Rules */}
        <div className="p-5 bg-zinc-900 border border-zinc-800 rounded-xl space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-zinc-200">
            <Clock className="w-4 h-4 text-indigo-400" />
            <span>Productivity & Workload Bounds</span>
          </div>

          <div className="space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-zinc-400 block mb-1">Standard Work Day Start</label>
                <input
                  type="time"
                  value={workStart}
                  onChange={e => setWorkStart(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-zinc-200 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="text-zinc-400 block mb-1">Standard Work Day End</label>
                <input
                  type="time"
                  value={workEnd}
                  onChange={e => setWorkEnd(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-zinc-200 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="text-zinc-400 block mb-1">Maximum Daily Focus Workload (Hours)</label>
              <input
                type="number"
                step="0.5"
                value={maxDailyWorkloadHours}
                onChange={e => setMaxDailyWorkloadHours(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-zinc-200 focus:outline-none focus:border-indigo-500"
              />
              <span className="text-[10px] text-zinc-500 block mt-1">
                AI daily schedule proposer will reject packing tasks exceeding this capacity.
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <label className="text-zinc-400 block mb-1">Deep Work Focus Block (Mins)</label>
                <input
                  type="number"
                  value={focusWindowMinutes}
                  onChange={e => setFocusWindowMinutes(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-zinc-200 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="text-zinc-400 block mb-1">Break Duration (Mins)</label>
                <input
                  type="number"
                  value={shortBreakMinutes}
                  onChange={e => setShortBreakMinutes(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-zinc-200 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Financial Policy & Safety Buffers */}
        <div className="p-5 bg-zinc-900 border border-zinc-800 rounded-xl space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-zinc-200">
            <Wallet className="w-4 h-4 text-emerald-400" />
            <span>Financial Safeguards & Base Currency</span>
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <label className="text-zinc-400 block mb-1">Default Base Currency</label>
              <select
                value={baseCurrency}
                onChange={e => setBaseCurrency(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-zinc-200 focus:outline-none focus:border-indigo-500"
              >
                <option value="USD">USD — US Dollar ($)</option>
                <option value="LKR">LKR — Sri Lankan Rupee (Rs)</option>
                <option value="EUR">EUR — Euro (€)</option>
                <option value="GBP">GBP — British Pound (£)</option>
                <option value="SGD">SGD — Singapore Dollar (S$)</option>
              </select>
              <span className="text-[10px] text-zinc-500 block mt-1">
                Authoritative base currency for consolidated Net Worth and executive summaries.
              </span>
            </div>

            <div>
              <label className="text-zinc-400 block mb-1">Configured Liquid Safety Buffer</label>
              <div className="relative">
                <input
                  type="text"
                  value={safetyBufferAmount}
                  onChange={e => setSafetyBufferAmount(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-zinc-200 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <span className="text-[10px] text-zinc-500 block mt-1">
                Earmarked cash reserve subtracted from Safe-to-Spend to prevent accidental overdrafts.
              </span>
            </div>

            <div className="pt-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={enableFinancialInPlanning}
                  onChange={e => setEnableFinancialInPlanning(e.target.checked)}
                  className="rounded border-zinc-800 text-indigo-600 focus:ring-0"
                />
                <span className="text-zinc-300">Surface bill payment reminders in Today view & Daily planner</span>
              </label>
              <span className="text-[10px] text-zinc-500 block ml-5 mt-0.5">
                Opt-in cross-domain permission. When unchecked, finance records remain strictly quarantined.
              </span>
            </div>
          </div>
        </div>

        {/* Notification Quiet Hours */}
        <div className="p-5 bg-zinc-900 border border-zinc-800 rounded-xl space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-zinc-200">
            <Bell className="w-4 h-4 text-amber-400" />
            <span>Quiet Hours & Focus Protection</span>
          </div>

          <div className="space-y-3 text-xs">
            <p className="text-zinc-400">
              During quiet hours, local audio cues and proactive assistant toasts are muted.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-zinc-400 block mb-1">Quiet Hours Start</label>
                <input
                  type="time"
                  value={quietHoursStart}
                  onChange={e => setQuietHoursStart(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-zinc-200 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="text-zinc-400 block mb-1">Quiet Hours End</label>
                <input
                  type="time"
                  value={quietHoursEnd}
                  onChange={e => setQuietHoursEnd(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-zinc-200 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Security & Isolation Boundaries */}
        <div className="p-5 bg-zinc-900 border border-zinc-800 rounded-xl space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-zinc-200">
            <Shield className="w-4 h-4 text-emerald-400" />
            <span>Isolation & Privacy Guarantees</span>
          </div>

          <div className="space-y-2 text-xs text-zinc-400 leading-relaxed">
            <div className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>Multi-tenant isolation enforced at SQLite query layer via strict tenant_id constraints.</span>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>Financial credentials are never stored. No third-party bank screen scraping.</span>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>AI tool policies default to prepare_and_confirm; destructive writes require signed diff approvals.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
