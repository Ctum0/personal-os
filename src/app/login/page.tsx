import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { connection } from 'next/server';
import { LoginForm } from './LoginForm';
import { SESSION_COOKIE, readAuthState, verifySessionToken } from '@/lib/auth/credentials';

/**
 * Sign-in page — a standalone surface, outside the `(app)` shell.
 *
 * Rendered on the server so the common cases cost no client round trip:
 *  - credentials not configured → the instance is open, go straight in
 *  - a valid session cookie     → already signed in, go to `?next=` or `/`
 */
// Sign-in is deliberately a blocking route: reading the cookie and comparing the
// signed expiry decides whether to render a form or redirect. With
// `cacheComponents` enabled, a route that reads request state must opt out of
// streaming prerender explicitly.
export const instant = false;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  // Render per request: this page reads the session cookie and compares the
  // signed expiry against the current time, so it cannot be prerendered.
  await connection();

  const state = readAuthState();

  // Deliberately open instance (local development): there is nothing to sign in
  // to, so the workspace is the correct destination.
  if (state.kind === 'open') redirect('/');

  // Misconfigured: explain it here rather than bouncing to `/`, so the reason is
  // visible at the URL the operator is actually sent to.
  if (state.kind === 'incomplete') {
    const problems = [...state.missing, ...(state.invalid ?? [])];
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
        <div className="w-full max-w-md rounded-2xl border border-amber-500/30 bg-amber-500/[0.06] p-6">
          <h1 className="text-lg font-semibold text-amber-200">Authentication is misconfigured</h1>
          <p className="mt-2 text-sm text-zinc-400">
            This instance refuses every request until these variables are valid:
          </p>
          <ul className="mt-3 space-y-1">
            {problems.map(name => (
              <li key={name} className="font-mono text-xs text-amber-300">
                {name}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-zinc-500">
            A salt must be at least 16 hex characters, the password hash exactly 64, and the session
            secret at least 32. Placeholders such as <code className="text-zinc-400">REPLACE_ME</code>{' '}
            count as unusable. Unset all four credential variables to run in open mode.
          </p>
        </div>
      </main>
    );
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (await verifySessionToken(state.config, token)) {
    const { next } = await searchParams;
    const destination = next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
    redirect(destination);
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-zinc-950 px-4">
      {/* Ambient field: a single soft light source, no gradient soup. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-0 h-[480px] w-[720px] -translate-x-1/2 rounded-full bg-indigo-500/[0.07] blur-3xl"
      />

      <div className="relative w-full max-w-[380px]">
        <div className="mb-8">
          <div className="mb-5 inline-flex h-11 w-11 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900 text-indigo-400">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
              <path d="M12 3v18M3 12h18" strokeLinecap="round" />
              <circle cx="12" cy="12" r="7.5" opacity="0.45" />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-50">Personal OS</h1>
          <p className="mt-1.5 text-sm text-zinc-500">Sign in to continue to your workspace.</p>
        </div>

        <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/60 p-6 shadow-2xl shadow-black/40 backdrop-blur-sm">
          <LoginForm />
        </div>

        <p className="mt-6 text-center text-[11px] text-zinc-700">
          Protected by an operator credential. Sessions expire after 7 days.
        </p>
      </div>
    </main>
  );
}
