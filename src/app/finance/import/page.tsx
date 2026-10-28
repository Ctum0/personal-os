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

  const loadBatches = () => {
    fetch('/api/finance/import')
      .then(r => r.json())
      .then(data => setBatches(data.batches || []));
  };

  useEffect(() => {
    fetch('/api/finance/accounts')
      .then(r => r.json())
      .then(data => {
        setAccounts(data.accounts || []);
        if (data.accounts?.length > 0 && !selectedAccount) {
          setSelectedAccount(data.accounts[0].accountId);
        }
      });

    loadBatches();
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setCsvFile(e.target.files[0]);
      setPreview(null);
    }
  };

  const handlePreview = async () => {
    if (!csvFile || !selectedAccount) return;
    setIsLoading(true);

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
      const data = await res.json();
      setPreview(data.preview);
    } catch (err: any) {
      alert(`CSV parse error: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCommit = async () => {
    if (!preview || !selectedAccount) return;
    setIsCommitting(true);

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
      const data = await res.json();
      alert(`Import committed! ${data.importedCount} rows successfully written to ledger.`);
      setPreview(null);
      setCsvFile(null);
      loadBatches();
    } catch (err: any) {
      alert(`Import failed: ${err.message}`);
    } finally {
      setIsCommitting(false);
    }
  };

  const handleReverseBatch = async (batchId: string) => {
    if (!confirm('Are you sure you want to reverse this import batch? All transactions created by this batch will be atomically removed from your ledger.')) {
      return;
    }

    const res = await fetch(`/api/finance/import?batchId=${batchId}`, { method: 'DELETE' });
    const data = await res.json();
    alert(`Batch reversed! ${data.reversedCount} transactions cleanly rolled back.`);
    loadBatches();
  };

  return (
    <div className="w-full px-8 py-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
          <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
          <span>CSV Statement Import Studio</span>
        </h1>
        <p className="text-xs text-zinc-400">
          Upload bank CSV exports, preview normalized dates & amounts, detect duplicate charges, and commit atomically with rollback support.
        </p>
      </div>

      {/* Step 1: Upload & Account Selection */}
      <div className="p-6 bg-zinc-900 border border-zinc-800 rounded-xl space-y-4">
        <h2 className="text-sm font-bold text-zinc-200">1. Select Destination Account & CSV File</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">Destination Account</label>
            <select
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
            <label className="block text-xs font-medium text-zinc-400 mb-1">CSV Statement File</label>
            <input
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
              disabled={isCommitting}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow-sm transition-all flex items-center gap-2 disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isCommitting ? 'Committing Ledger...' : `Confirm & Commit (${preview.validRowsCount} rows)`}</span>
            </button>
          </div>

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
              <div key={b.id} className="py-3 flex items-center justify-between text-xs">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-zinc-200">{b.file_name}</span>
                    <span className="text-[10px] text-zinc-500">→ {b.account_name}</span>
                    <span
                      className={`text-[9px] uppercase px-1.5 py-0.2 rounded font-mono ${
                        b.status === 'reversed' ? 'bg-red-500/10 text-red-400' : 'bg-emerald-500/10 text-emerald-400'
                      }`}
                    >
                      {b.status}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-500 mt-0.5">
                    {b.accepted_rows} rows imported • {new Date(b.created_at).toLocaleString()}
                  </p>
                </div>

                {b.status !== 'reversed' && (
                  <button
                    onClick={() => handleReverseBatch(b.id)}
                    className="flex items-center gap-1 px-3 py-1 text-xs text-red-400 hover:bg-red-500/10 rounded-lg transition-colors border border-red-500/20"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Rollback Batch</span>
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
