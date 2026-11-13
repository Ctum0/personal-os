'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Lock } from 'lucide-react';

/**
 * Sign-in form.
 *
 * Posts to the gate-exempt `/api/auth/session`, which sets an httpOnly session
 * cookie. There is no registration link, no password reset and no "create
 * account" affordance anywhere in the product: this instance has exactly one
 * operator, configured server-side.
 */
export function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = username.trim().length > 0 && password.length > 0 && !submitting;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
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
            : res.status === 429
              ? 'Too many attempts. Try again shortly.'
              : 'Sign-in failed';
        throw new Error(message);
      }

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
    <form onSubmit={handleSubmit} className="space-y-5" aria-label="Sign in">
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2.5 text-sm text-rose-200"
        >
          {error}
        </div>
      )}

      <div className="space-y-1.5">
        <label htmlFor="login-username" className="block text-xs font-medium uppercase tracking-wider text-zinc-400">
          Username
        </label>
        <input
          id="login-username"
          name="username"
          type="text"
          autoFocus
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          value={username}
          onChange={event => setUsername(event.target.value)}
          className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="login-password" className="block text-xs font-medium uppercase tracking-wider text-zinc-400">
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
          className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
        />
      </div>

      <button
        type="submit"
        disabled={!canSubmit}
        className="group inline-flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting ? (
          'Signing in…'
        ) : (
          <>
            Sign in
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </>
        )}
      </button>

      <p className="flex items-center justify-center gap-1.5 text-xs text-zinc-600">
        <Lock className="h-3 w-3" aria-hidden="true" />
        Single-operator instance. No accounts are created here.
      </p>
    </form>
  );
}
