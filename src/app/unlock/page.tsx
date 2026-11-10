'use client';

import React, { useState } from 'react';
import { Lock, Shield } from 'lucide-react';

/**
 * Minimal unlock surface for PIN-protected deployments. Users land here when a
 * request has been rejected by the gate (401) or by opening /unlock directly.
 * It posts the pin to the gate-exempt /api/auth/session endpoint, which sets
 * the session cookie; the browser then reloads the working page.
 */
export default function UnlockPage() {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pin.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: pin.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Unlock failed');
      }
      const data = await res.json();
      if (data.openMode) {
        setError('This instance does not have a PIN configured — it trusts a single local user. Remove PERSONAL_OS_PIN or stop trying to unlock.');
        setSubmitting(false);
        return;
      }
      window.location.href = '/';
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unlock failed');
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4"
        aria-label="Unlock Personal OS"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-zinc-900 border border-zinc-700 flex items-center justify-center text-zinc-300">
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-zinc-100">Personal OS is locked</h1>
            <p className="text-xs text-zinc-500">Enter your access PIN to continue.</p>
          </div>
        </div>

        {error && (
          <div role="alert" className="p-2.5 rounded-md bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300">
            {error}
          </div>
        )}

        <div>
          <label htmlFor="unlock-pin" className="block text-xs font-medium text-zinc-300 mb-1">
            Access PIN
          </label>
          <input
            id="unlock-pin"
            type="password"
            autoFocus
            autoComplete="current-password"
            value={pin}
            onChange={e => setPin(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <button
          type="submit"
          disabled={submitting || !pin.trim()}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 transition-colors"
        >
          {submitting ? 'Checking…' : (
            <>
              <Shield className="w-3.5 h-3.5" />
              Unlock
            </>
          )}
        </button>
      </form>
    </main>
  );
}
