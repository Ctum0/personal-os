'use client';

import React, { useRef, useState } from 'react';
import { CheckCircle2, Database, Download, FileText, ShieldCheck, Upload } from 'lucide-react';
import { apiSend, errorText } from '@/lib/api/client';

interface RestoreCounts {
  tasks?: number;
  accounts?: number;
  transactions?: number;
  habits?: number;
  projects?: number;
  goals?: number;
  habitLogs?: number;
  weeklyReviews?: number;
  budgetLines?: number;
}

interface RestoreResponse {
  success?: boolean;
  imported?: RestoreCounts;
  skipped?: Record<string, number>;
  snapshotPath?: string;
}

/**
 * Backup & restore surface.
 *
 * Export is a single server-generated file (`GET /api/backup/export`): the
 * previous client-side assembly re-fetched paginated list endpoints, so every
 * transaction past the first page was silently dropped from the backup. Restore
 * reports what was actually imported, including the domains that used to be
 * accepted and thrown away.
 */
export default function BackupExportPage() {
  const [isExporting, setIsExporting] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [details, setDetails] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = async () => {
    setIsExporting(true);
    setStatus('idle');
    setMessage(null);
    setDetails([]);
    try {
      const response = await fetch('/api/backup/export');
      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null);
        const detail =
          body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
            ? body.error
            : `Export failed (${response.status})`;
        throw new Error(detail);
      }
      const blob = await response.blob();
      const disposition = response.headers.get('content-disposition') ?? '';
      const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? 'personal_os_backup.json';
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      // Revoking in the same tick can cancel the download before the browser has
      // read the blob (the export then silently does nothing). Release it later.
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setStatus('success');
      setMessage(`Backup downloaded (${(blob.size / 1024).toFixed(0)} KB).`);
    } catch (err) {
      setStatus('error');
      setMessage(errorText(err));
    } finally {
      setIsExporting(false);
    }
  };

  const handleRestoreFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsRestoring(true);
    setStatus('idle');
    setMessage(null);
    setDetails([]);

    try {
      const text = await file.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error('That file is not valid JSON.');
      }

      const data = await apiSend<RestoreResponse>('/api/backup/restore', 'POST', parsed);
      const imported = data.imported ?? {};
      const lines = Object.entries(imported)
        .filter(([, value]) => typeof value === 'number' && value > 0)
        .map(([key, value]) => `${value} ${key}`);
      const skipped = Object.entries(data.skipped ?? {})
        .filter(([, value]) => typeof value === 'number' && value > 0)
        .map(([key, value]) => `${value} ${key} skipped`);

      setStatus('success');
      setMessage(
        lines.length > 0
          ? `Restore complete — imported ${lines.join(', ')}.`
          : 'Restore complete — no new records were needed.'
      );
      setDetails([
        ...(skipped.length > 0 ? [skipped.join(', ')] : []),
        ...(data.snapshotPath ? [`Safety snapshot: ${data.snapshotPath}`] : []),
      ]);
      window.dispatchEvent(new Event('personal-os:data-changed'));
    } catch (err) {
      setStatus('error');
      setMessage(errorText(err));
    } finally {
      setIsRestoring(false);
      event.target.value = '';
    }
  };

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-zinc-100 tracking-tight flex items-center gap-2">
          <Database className="w-4 h-4 text-zinc-400" aria-hidden="true" />
          <span>Data Backup &amp; Portable Export</span>
        </h1>
        <p className="text-xs text-zinc-400 mt-0.5">
          Complete sovereignty over your productivity records and financial ledger. Export clean, structured JSON backups
          at any time.
        </p>
      </div>

      {message && (
        <div
          role={status === 'error' ? 'alert' : 'status'}
          className={`p-3 rounded-md border text-xs flex items-start gap-2 ${
            status === 'success'
              ? 'bg-zinc-900 border-emerald-500/30 text-emerald-300'
              : 'bg-zinc-900 border-rose-500/30 text-rose-300'
          }`}
        >
          {status === 'success' && <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />}
          <span>
            {message}
            {details.length > 0 && (
              <span className="block mt-1 text-[11px] text-zinc-400">{details.join(' • ')}</span>
            )}
          </span>
        </div>
      )}

      <section className="p-5 bg-zinc-950/60 border border-white/[0.06] rounded-lg space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-md bg-zinc-900 border border-white/[0.06] text-zinc-300 flex items-center justify-center" aria-hidden="true">
            <Download className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-medium text-zinc-100">Full System Snapshot Export</h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Tasks, habit logs, projects, milestones, goals, weekly reviews, accounts, categories, journal lines, and the
              active budget — the complete set, not a page of it.
            </p>
          </div>
        </div>

        <div className="p-3.5 bg-zinc-900/40 border border-white/[0.04] rounded-md text-xs space-y-1.5">
          <p className="flex items-center gap-2 text-zinc-300 font-medium text-[11px] uppercase tracking-wider">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
            <span>Guaranteed zero vendor lock-in</span>
          </p>
          <p className="text-zinc-400 leading-relaxed">
            The export conforms to an open JSON schema. Financial figures stay exact decimal strings, so no precision is
            lost in transit, and the same shape is what restore accepts.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void handleExport()}
          disabled={isExporting}
          className="flex items-center gap-2 px-4 py-2 bg-zinc-100 hover:bg-white text-zinc-950 rounded-md text-xs font-medium transition-all active:scale-[0.98] disabled:opacity-50"
        >
          <Download className="w-3.5 h-3.5" aria-hidden="true" />
          <span>{isExporting ? 'Generating backup…' : 'Download Complete Backup (JSON)'}</span>
        </button>
      </section>

      <section className="p-5 bg-zinc-950/60 border border-white/[0.06] rounded-lg space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-md bg-zinc-900 border border-white/[0.06] text-zinc-300 flex items-center justify-center" aria-hidden="true">
            <Upload className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-medium text-zinc-100">Restore System Backup</h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Import a Personal OS backup JSON. A WAL-safe snapshot of the current database is taken before anything is
              written.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isRestoring}
            className="flex items-center gap-2 px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 rounded-md text-xs font-medium border border-white/[0.08] transition-all active:scale-[0.98] disabled:opacity-50"
          >
            <FileText className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{isRestoring ? 'Restoring backup…' : 'Select backup JSON to restore'}</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            disabled={isRestoring}
            onChange={(event) => void handleRestoreFile(event)}
            className="sr-only"
            aria-label="Backup JSON file"
          />
        </div>
      </section>
    </div>
  );
}
