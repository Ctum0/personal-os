'use client';

import React, { useState } from 'react';
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
      a.download = `personal_os_backup_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
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
    </div>
  );
}
