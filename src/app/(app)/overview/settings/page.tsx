'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, RotateCcw, Sliders } from 'lucide-react';
import { apiFetch, apiSend, errorText } from '@/lib/api/client';

/**
 * Operating rules editor.
 *
 * The save path is the interesting part: preferences drive the planner's work
 * window and safe-to-spend's buffer, so a silent failure here changes real
 * numbers. The page therefore only reports success when the server confirmed the
 * write, and shows the server's message otherwise.
 */

interface Preferences {
  workStart?: string;
  workEnd?: string;
  /** Legacy keys written by earlier builds; still honoured on read. */
  workHoursStart?: string;
  workHoursEnd?: string;
  currency?: string;
  maxDailyWorkloadHours?: string | number;
  focusWindowMinutes?: string | number;
  shortBreakMinutes?: string | number;
  safetyBufferAmount?: string | number;
  baseCurrency?: string;
  quietHoursStart?: string;
  quietHoursEnd?: string;
  enableFinancialInPlanning?: boolean;
}

interface NumberFieldProps {
  id: string;
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  step?: string;
  min?: string;
}

function NumberField({ id, label, hint, value, onChange, step, min }: NumberFieldProps) {
  return (
    <label htmlFor={id} className="block">
      <span className="block text-[11px] font-medium text-zinc-300 mb-1">{label}</span>
      <input
        id={id}
        type="number"
        step={step}
        min={min}
        value={value}
        onChange={event => onChange(event.target.value)}
        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-100 font-mono tabular-nums focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
      />
      {hint && <span className="block text-[10px] text-zinc-500 mt-1">{hint}</span>}
    </label>
  );
}

interface TextFieldProps {
  id: string;
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  type?: 'text' | 'time';
}

function TextField({ id, label, hint, value, onChange, type = 'text' }: TextFieldProps) {
  return (
    <label htmlFor={id} className="block">
      <span className="block text-[11px] font-medium text-zinc-300 mb-1">{label}</span>
      <input
        id={id}
        type={type}
        value={value}
        onChange={event => onChange(event.target.value)}
        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-100 font-mono focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
      />
      {hint && <span className="block text-[10px] text-zinc-500 mt-1">{hint}</span>}
    </label>
  );
}

export default function SettingsPage() {
  const [workStart, setWorkStart] = useState('09:00');
  const [workEnd, setWorkEnd] = useState('18:00');
  const [maxDailyWorkloadHours, setMaxDailyWorkloadHours] = useState('6.5');
  const [focusWindowMinutes, setFocusWindowMinutes] = useState('50');
  const [shortBreakMinutes, setShortBreakMinutes] = useState('10');
  const [safetyBufferAmount, setSafetyBufferAmount] = useState('500.00');
  const [baseCurrency, setBaseCurrency] = useState('USD');
  const [quietHoursStart, setQuietHoursStart] = useState('21:00');
  const [quietHoursEnd, setQuietHoursEnd] = useState('08:00');
  const [enableFinancialInPlanning, setEnableFinancialInPlanning] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // True once the operator has touched any field. A slow initial GET must never
  // overwrite what they are typing — that silently reverted their edit and saved
  // the stale values back.
  const editedRef = useRef(false);
  const markEdited = () => {
    editedRef.current = true;
  };

  const applyPreferences = useCallback((preferences: Preferences, force = false) => {
    if (editedRef.current && !force) return;
    const start = preferences.workStart ?? preferences.workHoursStart;
    const end = preferences.workEnd ?? preferences.workHoursEnd;
    if (start) setWorkStart(start);
    if (end) setWorkEnd(end);
    if (preferences.maxDailyWorkloadHours !== undefined) setMaxDailyWorkloadHours(String(preferences.maxDailyWorkloadHours));
    if (preferences.focusWindowMinutes !== undefined) setFocusWindowMinutes(String(preferences.focusWindowMinutes));
    if (preferences.shortBreakMinutes !== undefined) setShortBreakMinutes(String(preferences.shortBreakMinutes));
    if (preferences.safetyBufferAmount !== undefined) setSafetyBufferAmount(String(preferences.safetyBufferAmount));
    const currency = preferences.baseCurrency ?? preferences.currency;
    if (currency) setBaseCurrency(currency);
    if (preferences.quietHoursStart) setQuietHoursStart(preferences.quietHoursStart);
    if (preferences.quietHoursEnd) setQuietHoursEnd(preferences.quietHoursEnd);
    if (typeof preferences.enableFinancialInPlanning === 'boolean') {
      setEnableFinancialInPlanning(preferences.enableFinancialInPlanning);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await apiFetch<{ preferences: Preferences }>('/api/settings');
        if (!cancelled) applyPreferences(data.preferences);
      } catch (err) {
        if (!cancelled) setError(errorText(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyPreferences]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const data = await apiSend<{ preferences: Preferences }>('/api/settings', 'PUT', {
        workStart,
        workEnd,
        maxDailyWorkloadHours: Number(maxDailyWorkloadHours),
        focusWindowMinutes: Number(focusWindowMinutes),
        shortBreakMinutes: Number(shortBreakMinutes),
        safetyBufferAmount: Number(safetyBufferAmount),
        baseCurrency,
        quietHoursStart,
        quietHoursEnd,
        enableFinancialInPlanning,
      });
      // Re-apply the server's canonical values: what was persisted is the truth.
      applyPreferences(data.preferences, true);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100 tracking-tight flex items-center gap-2">
            <Sliders className="w-4 h-4 text-zinc-400" />
            <span>Personal Operating Rules &amp; Settings</span>
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Explicit constraints for AI planning, daily time blocking, quiet hours, and financial buffers.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving || loading}
          className="flex items-center gap-1.5 px-3.5 py-1.5 bg-zinc-100 hover:bg-white text-zinc-950 rounded-md text-xs font-medium transition-all active:scale-[0.98] shadow-sm disabled:opacity-50"
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>{saving ? 'Saving…' : saved ? 'Rules Applied' : 'Save Rules'}</span>
        </button>
      </div>

      {error && (
        <div role="alert" className="p-3 rounded-lg border border-rose-500/30 bg-rose-500/10 text-xs text-rose-200">
          Rules were not saved: {error}
        </div>
      )}

      {loading && (
        <p role="status" className="text-xs text-zinc-400">
          Loading your operating rules…
        </p>
      )}

      {saved && (
        <div
          role="status"
          className="p-3 bg-zinc-950/80 border border-emerald-500/30 rounded-lg flex items-center gap-2 text-xs text-emerald-300"
        >
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>Operating rules saved. Planning, schedule proposals, and safe-to-spend now respect these bounds.</span>
        </div>
      )}

      <fieldset disabled={loading} className="space-y-6 border-0 p-0 m-0 min-w-0">
      <section className="p-5 bg-zinc-900/60 border border-zinc-800 rounded-xl space-y-4" onChangeCapture={markEdited}>
        <h2 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider">Productivity &amp; Workload Bounds</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <TextField id="work-start" label="Standard Work Day Start" type="time" value={workStart} onChange={setWorkStart} />
          <TextField id="work-end" label="Standard Work Day End" type="time" value={workEnd} onChange={setWorkEnd} />
          <NumberField
            id="max-workload"
            label="Maximum Daily Focus Workload (Hours)"
            step="0.5"
            min="0"
            value={maxDailyWorkloadHours}
            onChange={setMaxDailyWorkloadHours}
            hint="Hard ceiling for planned focus minutes per day."
          />
          <NumberField
            id="focus-window"
            label="Deep Work Focus Block (Mins)"
            step="5"
            min="5"
            value={focusWindowMinutes}
            onChange={setFocusWindowMinutes}
          />
          <NumberField
            id="short-break"
            label="Break Duration (Mins)"
            step="5"
            min="0"
            value={shortBreakMinutes}
            onChange={setShortBreakMinutes}
          />
        </div>
      </section>

      <section className="p-5 bg-zinc-900/60 border border-zinc-800 rounded-xl space-y-4" onChangeCapture={markEdited}>
        <h2 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider">Financial Reality Bounds</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <NumberField
            id="safety-buffer"
            label="Safe-To-Spend Safety Buffer"
            step="0.01"
            min="0"
            value={safetyBufferAmount}
            onChange={setSafetyBufferAmount}
            hint="Liquid funds held back from discretionary spending."
          />
          <TextField id="base-currency" label="Base Currency" value={baseCurrency} onChange={setBaseCurrency} />
          <label htmlFor="financial-in-planning" className="flex items-start gap-2 pt-5">
            <input
              id="financial-in-planning"
              type="checkbox"
              checked={enableFinancialInPlanning}
              onChange={event => setEnableFinancialInPlanning(event.target.checked)}
              className="mt-0.5 h-3.5 w-3.5 rounded border-zinc-700 bg-zinc-950 text-indigo-500"
            />
            <span className="text-[11px] text-zinc-300 leading-relaxed">
              Allow the planner to read financial obligations
              <span className="block text-[10px] text-zinc-500">
                Off by default: planning stays quarantined from ledger data unless you enable it.
              </span>
            </span>
          </label>
        </div>
      </section>

      <section className="p-5 bg-zinc-900/60 border border-zinc-800 rounded-xl space-y-4" onChangeCapture={markEdited}>
        <h2 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider">Quiet Hours</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TextField id="quiet-start" label="Quiet Hours Start" type="time" value={quietHoursStart} onChange={setQuietHoursStart} />
          <TextField id="quiet-end" label="Quiet Hours End" type="time" value={quietHoursEnd} onChange={setQuietHoursEnd} />
        </div>
      </section>

      </fieldset>

      <p className="text-[11px] text-zinc-500 flex items-center gap-1.5">
        <RotateCcw className="w-3 h-3" aria-hidden="true" />
        Saved values are re-read from the database after every write, so the form always shows what was persisted.
      </p>
    </div>
  );
}
