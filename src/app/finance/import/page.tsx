'use client';

import React, { useState, useEffect } from 'react';
import { useWorkspace } from '@/components/layout/WorkspaceContext';
import {
  FileSpreadsheet,
  Upload,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Clock,
  ArrowRight,
  ShieldCheck,
  FileCheck,
} from 'lucide-react';

export default function CsvImportPage() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string>('');
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<any | null>(null);
  const [batches, setBatches] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [reversingBatchId, setReversingBatchId] = useState<string | null>(null);

  const loadBatches = () => {
    fetch('/api/finance/import')
      .then(r => r.json())
      .then(data => setBatches(data.batches || []))
      .catch(() => {});
  };

  useEffect(() => {
    fetch('/api/finance/accounts')
      .then(r => r.json())
      .then(data => {
        setAccounts(data.accounts || []);
        if (data.accounts?.length > 0 && !selectedAccount) {
          setSelectedAccount(data.accounts[0].accountId);
        }
      })
      .catch(() => {});

    loadBatches();
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setCsvFile(e.target.files[0]);
      setPreview(null);
      setStatusMessage(null);
    }
  };

  const handlePreview = async () => {
    if (!csvFile || !selectedAccount) return;
    setIsLoading(true);
    setStatusMessage(null);

    try {
      const text = await csvFile.text();
      const res = await fetch('/api/finance/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'preview',
          accountId: selectedAccount,
          fileName: csvFile.name,
          csvText: text,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatusMessage({ type: 'error', text: data.error || 'CSV parsing error. Please check format.' });
        setPreview(null);
        return;
      }
      setPreview(data.preview);
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: `CSV parse error: ${err.message}` });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCommit = async () => {
    if (!preview || !selectedAccount) return;
    setIsCommitting(true);
    setStatusMessage(null);

    try {
      const res = await fetch('/api/finance/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'commit',
          accountId: selectedAccount,
          fileName: preview.fileName,
          fileHash: preview.fileHash,
          rows: preview.rows,
          skipDuplicates: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatusMessage({ type: 'error', text: data.error || 'Failed to commit import batch.' });
        return;
      }
      const skipped = Number(data.skippedCount || 0);
      const skippedNote = skipped > 0
        ? ` ${skipped} row${skipped === 1 ? '' : 's'} skipped (duplicates or malformed). Reupload after fixing them if needed.`
        : '';
      setStatusMessage({
        type: 'success',
        text: `Import committed! ${data.importedCount} rows written to ledger as a single atomic batch.${skippedNote}`
      });
      setPreview(null);
      setCsvFile(null);
      loadBatches();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: `Import failed: ${err.message}` });
    } finally {
      setIsCommitting(false);
    }
  };

  const handleReverseBatch = async (batchId: string) => {
    setStatusMessage(null);
    try {
      const res = await fetch(`/api/finance/import?batchId=${batchId}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatusMessage({ type: 'error', text: data.error || 'Failed to reverse import batch.' });
        return;
      }
      setStatusMessage({
        type: 'success',
        text: `Batch reversed! ${data.reversedCount} transactions cleanly rolled back.`
      });
      setReversingBatchId(null);
      loadBatches();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: `Batch reversal failed: ${err.message}` });
    }
  };

  return (
    <div className="w-full max-w-[1720px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
          <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
          <span>CSV Statement Import Studio</span>
        </h1>
        <p className="text-xs text-zinc-400">
          Upload bank CSV exports, preview normalized dates & amounts, detect duplicate charges, and commit atomically with rollback support.
        </p>
      </div>

      {statusMessage && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center justify-between gap-3 ${
            statusMessage.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
              : 'bg-red-950/40 border-red-800/60 text-red-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
            )}
            <span>{statusMessage.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusMessage(null)}
            className="text-[11px] underline opacity-80 hover:opacity-100"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Step 1: Upload & Account Selection */}
      <div className="p-6 bg-zinc-900 border border-zinc-800 rounded-xl space-y-4">
        <h2 className="text-sm font-bold text-zinc-200">1. Select Destination Account & CSV File</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="destination-account" className="block text-xs font-medium text-zinc-400 mb-1">Destination Account</label>
            <select
              id="destination-account"
              aria-label="Destination Account"
              value={selectedAccount}
              onChange={e => setSelectedAccount(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500"
            >
              {accounts.map(acc => (
                <option key={acc.accountId} value={acc.accountId}>
                  {acc.accountName} ({acc.currency})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="csv-statement-file" className="block text-xs font-medium text-zinc-400 mb-1">CSV Statement File</label>
            <input
              id="csv-statement-file"
              aria-label="CSV Statement File"
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="w-full text-xs text-zinc-400 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-zinc-800 file:text-zinc-200 hover:file:bg-zinc-700 cursor-pointer"
            />
          </div>
        </div>

        {csvFile && (
          <div className="flex items-center justify-end pt-2">
            <button
              onClick={handlePreview}
              disabled={isLoading}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow-sm transition-all flex items-center gap-2 disabled:opacity-50"
            >
              <FileCheck className="w-4 h-4" />
              <span>{isLoading ? 'Parsing Columns...' : 'Preview & Detect Duplicates'}</span>
            </button>
          </div>
        )}
      </div>

      {/* Step 2: Preview & Duplicate Resolution */}
      {preview && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4 shadow-sm animate-in fade-in duration-150">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-zinc-800 pb-4">
            <div>
              <h2 className="text-sm font-bold text-zinc-100">
                2. Preview Results: {preview.fileName}
              </h2>
              <div className="flex items-center gap-3 text-xs text-zinc-400 mt-1">
                <span>Total: {preview.totalRows}</span>
                <span className="text-emerald-400 font-semibold">• Valid: {preview.validRowsCount}</span>
                {preview.duplicateRowsCount > 0 && (
                  <span className="text-amber-400 font-semibold">• Duplicates Detected: {preview.duplicateRowsCount}</span>
                )}
                {preview.errorRowsCount > 0 && (
                  <span className="text-red-400 font-semibold">• Errors: {preview.errorRowsCount}</span>
                )}
              </div>
            </div>

            <button
              onClick={handleCommit}
              disabled={isCommitting || preview.validRowsCount === 0}
              title={preview.validRowsCount === 0 ? 'No valid rows to commit — fix the errored rows and re-upload.' : undefined}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow-sm transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isCommitting ? 'Committing Ledger...' : `Confirm & Commit (${preview.validRowsCount} rows)`}</span>
            </button>
          </div>

          {preview.errorRowsCount > 0 && (
            <div className="p-3 rounded-lg bg-red-950/30 border border-red-900/50 text-xs text-red-300/90">
              {preview.errorRowsCount} row{preview.errorRowsCount === 1 ? '' : 's'} failed validation and will be skipped
              on commit — they are recorded as errored rows in this batch. Commit is atomic: either all valid rows post to
              the ledger or none do; malformed rows never write partial entries.
            </div>
          )}

          {/* Rows Preview Table */}
          <div className="overflow-x-auto max-h-96">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-950 text-zinc-400 border-b border-zinc-800 uppercase text-[10px] tracking-wider sticky top-0">
                <tr>
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3">Payee / Merchant</th>
                  <th className="py-2.5 px-3">Type</th>
                  <th className="py-2.5 px-3 text-right">Amount</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {preview.rows.map((r: any) => (
                  <tr
                    key={r.rowIndex}
                    className={`hover:bg-zinc-800/40 ${r.isDuplicate ? 'bg-amber-500/5' : ''}`}
                  >
                    <td className="py-2 px-3 font-mono text-zinc-300">{r.parsedDate || 'Invalid'}</td>
                    <td className="py-2 px-3 text-zinc-200">{r.parsedPayee}</td>
                    <td className="py-2 px-3 uppercase text-[10px] text-zinc-400">{r.parsedType}</td>
                    <td className="py-2 px-3 text-right font-mono font-bold text-zinc-100">
                      ${r.parsedAmount || '0.00'}
                    </td>
                    <td className="py-2 px-3 text-center">
                      {r.isDuplicate ? (
                        <span className="text-[10px] text-amber-400 font-semibold bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20" title={r.duplicateReason}>
                          Duplicate (Skip)
                        </span>
                      ) : r.error ? (
                        <span className="text-[10px] text-red-400 font-semibold bg-red-500/10 px-2 py-0.5 rounded border border-red-500/20">
                          {r.error}
                        </span>
                      ) : (
                        <span className="text-[10px] text-emerald-400 font-semibold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                          Ready to Commit
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Historical Batches & Reversals */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-bold text-zinc-200">Import Batch History & Rollback</h2>

        <div className="divide-y divide-zinc-800/60">
          {batches.length === 0 ? (
            <div className="p-6 text-center text-xs text-zinc-500">
              No CSV batches have been imported yet.
            </div>
          ) : (
            batches.map(b => (
              <div key={b.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-zinc-200">{b.file_name}</span>
                    <span className="text-[10px] text-zinc-500">→ {b.account_name}</span>
                    <span
                      className={`text-[9px] uppercase px-1.5 py-0.5 rounded font-mono ${
                        b.status === 'reversed' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      }`}
                    >
                      {b.status}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-500 mt-0.5">
                    {b.accepted_rows} rows imported • {b.created_at ? b.created_at.replace('T', ' ').slice(0, 19) : ''}
                  </p>
                </div>

                {b.status !== 'reversed' && (
                  reversingBatchId === b.id ? (
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-amber-400">Rollback all transactions?</span>
                      <button
                        type="button"
                        onClick={() => handleReverseBatch(b.id)}
                        className="px-2.5 py-1 bg-red-600 hover:bg-red-500 text-white rounded-md text-[11px] font-semibold transition-colors"
                      >
                        Confirm
                      </button>
                      <button
                        type="button"
                        onClick={() => setReversingBatchId(null)}
                        className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-md text-[11px] transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setReversingBatchId(b.id)}
                      className="flex items-center gap-1 px-3 py-1 text-xs text-red-400 hover:bg-red-500/10 rounded-lg transition-colors border border-red-500/20 self-start sm:self-auto"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Rollback Batch</span>
                    </button>
                  )
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
