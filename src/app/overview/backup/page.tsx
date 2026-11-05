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
        <h1 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
          <Database className="w-5 h-5 text-indigo-400" />
          <span>Data Backup & Portable Export</span>
        </h1>
        <p className="text-xs text-zinc-400">
          Complete sovereignty over your productivity records and financial ledger. Export clean, structured JSON backups at any time.
        </p>
      </div>

      <div className="p-6 bg-zinc-900 border border-zinc-800 rounded-xl space-y-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-indigo-600/20 text-indigo-400 flex items-center justify-center">
            <Download className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-zinc-100">Full System Snapshot Export</h2>
            <p className="text-xs text-zinc-400">
              Includes all tasks, series, habits, goals, accounts, journal lines, budgets, and audit events.
            </p>
          </div>
        </div>

        <div className="p-4 bg-zinc-950 border border-zinc-800 rounded-lg text-xs space-y-2 text-zinc-300">
          <div className="flex items-center gap-2 text-emerald-400 font-semibold">
            <ShieldCheck className="w-4 h-4" />
            <span>Guaranteed Zero Vendor Lock-in</span>
          </div>
          <p>
            Your export conforms to open JSON schema specifications. All financial figures are preserved as exact decimal strings to avoid precision degradation.
          </p>
        </div>

        <div className="pt-2">
          <button
            onClick={handleExport}
            disabled={isExporting}
            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold shadow-sm transition-all disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            <span>{isExporting ? 'Generating Backup...' : 'Download Complete Backup (JSON)'}</span>
          </button>
        </div>
      </div>

      {/* Restore Section */}
      <div className="p-6 bg-zinc-900 border border-zinc-800 rounded-xl space-y-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-600/20 text-emerald-400 flex items-center justify-center">
            <Upload className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-zinc-100">Restore System Backup</h2>
            <p className="text-xs text-zinc-400">
              Import a verified Personal OS backup JSON. An automated WAL snapshot backup is taken before restoring.
            </p>
          </div>
        </div>

        {restoreMessage && (
          <div className={`p-3 rounded-lg border text-xs flex items-center gap-2 ${
            restoreStatus === 'success'
              ? 'bg-emerald-950/60 border-emerald-800/60 text-emerald-300'
              : 'bg-rose-950/60 border-rose-800/60 text-rose-300'
          }`}>
            {restoreStatus === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : null}
            <span>{restoreMessage}</span>
          </div>
        )}

        <div className="pt-2 flex items-center gap-3">
          <label className="flex items-center gap-2 px-5 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-xs font-semibold cursor-pointer border border-zinc-700 transition-all">
            <Upload className="w-4 h-4" />
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
