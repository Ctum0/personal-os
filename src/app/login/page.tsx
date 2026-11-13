'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, LogIn } from 'lucide-react';

/**
 * Sign-in surface.
 *
 * Posts to the gate-exempt `/api/auth/session`, which sets an httpOnly session
 * cookie. There is no registration link and no "create account" affordance: this
 * instance has exactly one operator, configured server-side.
 */
export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!username.trim() || !password) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data: unknown = await res.json().catch(() => ({}));

      if (!res.ok) {
        const message =
          data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
            ? data.error
            : 'Sign-in failed';
        throw new Error(message);
      }

      if (data && typeof data === 'object' && 'openMode' in data && data.openMode === true) {
        setError('This instance has no credentials configured, so it is open. Set the operator credentials before exposing it.');
        setSubmitting(false);
        return;
      }

      // Return to the route the operator originally requested, sanitized to a
      // same-origin absolute path so a crafted link cannot redirect off-site.
      const next = new URLSearchParams(window.location.search).get('next');
      const destination = next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
      router.replace(destination);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed');
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4"
        aria-label="Sign in to Personal OS"
      >
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="w-10 h-10 rounded-lg bg-zinc-950 border border-zinc-700 flex items-center justify-center text-zinc-300"
          >
            <Lock className="w-5 h-5" />
          </span>
          <div>
            <h1 className="text-sm font-semibold text-zinc-100">Personal OS</h1>
            <p className="text-xs text-zinc-500">Sign in to continue.</p>
          </div>
        </div>

        {error && (
          <div role="alert" className="p-2.5 rounded-md bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300">
            {error}
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label htmlFor="login-username" className="block text-xs font-medium text-zinc-300 mb-1">
              Username
            </label>
            <input
              id="login-username"
              name="username"
              type="text"
              autoFocus
              autoComplete="username"
              required
              value={username}
              onChange={event => setUsername(event.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label htmlFor="login-password" className="block text-xs font-medium text-zinc-300 mb-1">
              Password
            </label>
            <input
              id="login-password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={event => setPassword(event.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={submitting || !username.trim() || !password}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 transition-colors"
        >
          {submitting ? (
            'Signing in…'
          ) : (
            <>
              <LogIn className="w-3.5 h-3.5" aria-hidden="true" />
              Sign in
            </>
          )}
        </button>
      </form>
    </main>
  );
}
