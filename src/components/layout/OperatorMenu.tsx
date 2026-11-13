'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LogOut, Settings } from 'lucide-react';

/**
 * Operator menu: settings and sign-out.
 *
 * Sign-out must exist in the UI. Without it the only way to end a session is
 * clearing cookies by hand, which is not acceptable on a shared machine — and
 * the session lives 7 days, so "forget to log out" is the default failure.
 *
 * The menu is a real disclosure: button with `aria-expanded`, a `role="menu"`
 * with `role="menuitem"` children, Escape to close, click-outside to close, and
 * focus returned to the trigger so keyboard users are not stranded.
 */
export function OperatorMenu({ username }: { username?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const initials = (username ?? 'OP').slice(0, 2).toUpperCase();

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      triggerRef.current?.focus();
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const signOut = async () => {
    setSigningOut(true);
    try {
      // Clear the cookie server-side first; a client-side navigation alone would
      // leave the session valid on this device.
      await fetch('/api/auth/session', { method: 'DELETE' });
    } finally {
      // `replace` so Back does not return to a page the session can no longer load.
      router.replace('/login');
      router.refresh();
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(value => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={username ? `Account menu for ${username}` : 'Account menu'}
        className="hidden sm:flex w-7 h-7 rounded-full bg-zinc-800 border border-zinc-700 items-center justify-center text-[10px] font-semibold text-zinc-300 hover:border-zinc-500 transition-colors"
      >
        <span aria-hidden="true">{initials}</span>
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Account"
          className="absolute right-0 mt-1.5 w-48 bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl py-1 z-50"
        >
          {username && (
            <p className="px-3 py-1.5 text-[11px] text-zinc-500 truncate border-b border-zinc-800 mb-1">
              Signed in as <span className="text-zinc-300">{username}</span>
            </p>
          )}
          <Link
            href="/overview/settings"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-850 hover:text-zinc-100"
          >
            <Settings className="w-3.5 h-3.5 text-zinc-500" aria-hidden="true" />
            <span>Settings</span>
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={signOut}
            disabled={signingOut}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-rose-300 hover:bg-rose-500/10 disabled:opacity-60"
          >
            <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{signingOut ? 'Signing out…' : 'Sign out'}</span>
          </button>
        </div>
      )}
    </div>
  );
}
