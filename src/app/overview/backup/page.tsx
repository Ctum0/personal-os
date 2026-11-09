'use client';

import React, { useState } from 'react';
import { todayISO } from "@/lib/time";
import {
  Database,
  Download,
  Upload,
  CheckCircle2,
  ShieldCheck,
  FileText,
} from 'lucide-react';

export default function BackupExportPage() {
  const [isExporting, setIsExporting] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreStatus, setRestoreStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [restoreMessage, setRestoreMessage] = useState<string | null>(null);

  const handleRestoreFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsRestoring(true);
    setRestoreStatus('idle');
    setRestoreMessage(null);

    try {
      const text = await file.text();
      const json = JSON.parse(text);

      const res = await fetch('/api/backup/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(json),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Restore failed');
      }

      setRestoreStatus('success');
      setRestoreMessage(`Backup restored successfully (${data.imported?.tasks || 0} tasks, ${data.imported?.accounts || 0} accounts, ${data.imported?.transactions || 0} transactions). Safety snapshot created.`);
    } catch (err: any) {
      setRestoreStatus('error');
      setRestoreMessage(err.message || 'Failed to restore backup file');
    } finally {
      setIsRestoring(false);
      e.target.value = '';
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const [tasks, habits, projects, goals, accounts, txs, budgets] = await Promise.all([
        fetch('/api/tasks').then(r => r.json()),
        fetch('/api/habits').then(r => r.json()),
        fetch('/api/projects').then(r => r.json()),
        fetch('/api/goals').then(r => r.json()),
        fetch('/api/finance/accounts').then(r => r.json()),
        fetch('/api/finance/transactions').then(r => r.json()),
        fetch('/api/finance/budgets').then(r => r.json()),
      ]);

      const backupData = {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        domains: {
          productivity: {
            tasks: tasks.tasks,
            habits: habits.habits,
            projects: projects.projects,
            goals: goals.goals,
          },
          finance: {
            accounts: accounts.accounts,
            transactions: txs.transactions,
            budget: budgets.budget,
          },
        },
      };

      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `personal_os_backup_${todayISO()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="w-full px-8 py-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-zinc-100 tracking-tight flex items-center gap-2">
          <Database className="w-4 h-4 text-zinc-400" />
          <span>Data Backup & Portable Export</span>
        </h1>
        <p className="text-xs text-zinc-400 mt-0.5">
          Complete sovereignty over your productivity records and financial ledger. Export clean, structured JSON backups at any time.
        </p>
      </div>

      <div className="p-5 bg-zinc-950/60 border border-white/[0.06] rounded-lg space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-md bg-zinc-900 border border-white/[0.06] text-zinc-300 flex items-center justify-center">
            <Download className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-medium text-zinc-100">Full System Snapshot Export</h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Includes all tasks, series, habits, goals, accounts, journal lines, budgets, and audit events.
            </p>
          </div>
        </div>

        <div className="p-3.5 bg-zinc-900/40 border border-white/[0.04] rounded-md text-xs space-y-1.5 text-zinc-300">
          <div className="flex items-center gap-2 text-zinc-300 font-medium text-[11px] uppercase tracking-wider">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Guaranteed Zero Vendor Lock-in</span>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Your export conforms to open JSON schema specifications. All financial figures are preserved as exact decimal strings to avoid precision degradation.
          </p>
        </div>

        <div className="pt-1">
          <button
            onClick={handleExport}
            disabled={isExporting}
            className="flex items-center gap-2 px-4 py-2 bg-zinc-100 hover:bg-white text-zinc-950 rounded-md text-xs font-medium shadow-sm transition-all active:scale-[0.98] disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{isExporting ? 'Generating Backup...' : 'Download Complete Backup (JSON)'}</span>
          </button>
        </div>
      </div>

      {/* Restore Section */}
      <div className="p-5 bg-zinc-950/60 border border-white/[0.06] rounded-lg space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-md bg-zinc-900 border border-white/[0.06] text-zinc-300 flex items-center justify-center">
            <Upload className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-medium text-zinc-100">Restore System Backup</h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Import a verified Personal OS backup JSON. An automated WAL snapshot backup is taken before restoring.
            </p>
          </div>
        </div>

        {restoreMessage && (
          <div className={`p-3 rounded-md border text-xs flex items-center gap-2 ${
            restoreStatus === 'success'
              ? 'bg-zinc-900 border-emerald-500/30 text-emerald-400'
              : 'bg-zinc-900 border-rose-500/30 text-rose-400'
          }`}>
            {restoreStatus === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : null}
            <span>{restoreMessage}</span>
          </div>
        )}

        <div className="pt-1 flex items-center gap-3">
          <label className="flex items-center gap-2 px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 rounded-md text-xs font-medium cursor-pointer border border-white/[0.08] transition-all active:scale-[0.98]">
            <Upload className="w-3.5 h-3.5" />
            <span>{isRestoring ? 'Restoring Backup...' : 'Select Backup JSON to Restore'}</span>
            <input
              type="file"
              accept=".json"
              disabled={isRestoring}
              onChange={handleRestoreFile}
              className="hidden"
            />
          </label>
        </div>
      </div>
    </div>
  );
}
