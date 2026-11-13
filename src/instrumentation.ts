/**
 * Server startup diagnostics.
 *
 * `register` runs once, before the server accepts requests. It reports the
 * authentication posture so an operator sees *why* an instance is refusing
 * traffic instead of discovering it from a 503 in the browser.
 *
 * It deliberately does not throw: a misconfigured instance must stay up and
 * answer 503 with the variable names, so the failure is diagnosable from
 * outside. Crash-looping would hide the reason.
 */
export async function register(): Promise<void> {
  // `register` runs once per runtime. Without this guard the diagnostic prints
  // twice (Node + Edge) and this file joins the Edge bundle that `src/proxy.ts`
  // uses, so a future Node-only import here would break authentication at
  // deploy time instead of failing loudly.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const { readAuthState } = await import('@/lib/auth/credentials');
  const state = readAuthState();

  if (state.kind === 'configured') {
    console.info('[auth] sign-in enabled for the configured operator account');
    return;
  }

  if (state.kind === 'open') {
    console.warn(
      '[auth] no credentials configured: running in OPEN mode. Every request is allowed. ' +
        'Set the four PERSONAL_OS_* credential variables before exposing this instance.'
    );
    return;
  }

  const problems = [...state.missing, ...(state.invalid ?? [])];
  console.error(
    `[auth] MISCONFIGURED: refusing all requests with 503. Problem variables: ${problems.join(', ')}. ` +
      'Set valid values (salt ≥16 hex chars, hash exactly 64 hex chars, secret ≥32 chars), ' +
      'or unset all four credential variables to deliberately run in open mode.'
  );
}
