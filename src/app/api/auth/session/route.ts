import { NextResponse } from 'next/server';
import { withApiLogging } from '@/lib/api/log';
import { ok, readBody, routeError } from '@/lib/api/http';
import { requiredString } from '@/lib/api/fields';
import {
  SESSION_COOKIE,
  SESSION_TTL_MS,
  createSessionToken,
  isAuthConfigured,
  readAuthConfig,
  verifyCredentials,
} from '@/lib/auth/credentials';
import {
  checkLoginAllowed,
  clientKeyFromHeaders,
  recordLoginFailure,
  recordLoginSuccess,
} from '@/lib/auth/throttle';

/**
 * The single sign-in endpoint — the ONLY /api path exempt from the gate.
 *
 * POST { username, password } → sets an HMAC-signed session cookie.
 * DELETE                      → clears it.
 *
 * There is no registration, no password reset and no second account: the
 * operator credential exists only in configuration, and this route can only ever
 * authenticate it. Failures are throttled per client address so a stolen username
 * is not a brute-force invitation.
 */

export const POST = withApiLogging(async function POST(request: Request) {
  try {
    const config = readAuthConfig();
    if (!config) {
      // Nothing to sign in to: the instance is deliberately open (local dev).
      return ok({ authenticated: true, openMode: true });
    }

    const clientKey = clientKeyFromHeaders(request.headers);
    const allowed = checkLoginAllowed(clientKey);
    if (!allowed.allowed) {
      return NextResponse.json(
        { error: 'Too many failed attempts. Try again later.', retryAfterSeconds: allowed.retryAfterSeconds },
        { status: 429, headers: { 'Retry-After': String(allowed.retryAfterSeconds ?? 60) } }
      );
    }

    const body = await readBody(request);
    const username = requiredString(body.username, 'username', 200);
    const password = requiredString(body.password, 'password', 1024);

    const valid = await verifyCredentials(config, username, password);
    if (!valid) {
      recordLoginFailure(clientKey);
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401, headers: { 'WWW-Authenticate': 'PersonalOS-Session realm="Personal OS"' } }
      );
    }

    recordLoginSuccess(clientKey);
    const token = await createSessionToken(config);
    const response = ok({ authenticated: true, openMode: false, username: config.username });
    response.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: Math.floor(SESSION_TTL_MS / 1000),
      // Secure is required whenever the deployment is served over TLS; Coolify
      // terminates TLS in front, so NODE_ENV=production is the right signal.
      secure: process.env.NODE_ENV === 'production',
    });
    return response;
  } catch (err) {
    return routeError(err);
  }
});

export const GET = withApiLogging(async function GET() {
  try {
    if (!isAuthConfigured()) {
      return ok({ authenticated: true, openMode: true });
    }
    // Existence of a settled session is answered by the gate itself (any other
    // /api call succeeds); this endpoint only reports configuration state.
    return ok({ authenticated: false, openMode: false });
  } catch (err) {
    return routeError(err);
  }
});

export const DELETE = withApiLogging(async function DELETE() {
  try {
    const response = ok({ authenticated: false, openMode: !isAuthConfigured() });
    response.cookies.set(SESSION_COOKIE, '', {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
      secure: process.env.NODE_ENV === 'production',
    });
    return response;
  } catch (err) {
    return routeError(err);
  }
});
