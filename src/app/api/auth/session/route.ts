import { NextResponse } from 'next/server';
import { withApiLogging } from '@/lib/api/log';
import { ok, readBody, routeError } from '@/lib/api/http';
import { requiredString } from '@/lib/api/fields';
import {
  SESSION_COOKIE,
  SESSION_TTL_MS,
  createSessionToken,
  readAuthConfig,
  readAuthState,
  verifyCredentials,
} from '@/lib/auth/credentials';
import {
  checkLoginAllowed,
  clientKeyFromHeaders,
  recordLoginFailure,
  recordLoginSuccess,
} from '@/lib/auth/throttle';

/**
 * Extra latency imposed on a caller that is already throttled.
 *
 * Long enough to make sustained guessing painful, short enough that the operator
 * signing in from a shared address does not think the app is broken. It is a
 * cost, not a barrier: the point is that a lockout never refuses a valid
 * credential.
 */
const LOCKED_ATTEMPT_DELAY_MS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

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
    const state = readAuthState();
    if (state.kind === 'incomplete') {
      // Never treat a partial credential set as "open": refuse to authenticate
      // and say exactly what is missing.
      return NextResponse.json(
        { error: 'Authentication is misconfigured', missing: state.missing, invalid: state.invalid },
        { status: 503 }
      );
    }
    const config = readAuthConfig();
    if (!config) {
      // Nothing to sign in to: the instance is deliberately open (local dev).
      return ok({ authenticated: true, openMode: true });
    }

    const clientKey = clientKeyFromHeaders(request.headers);

    // Order matters, and it is a security decision:
    //
    // Credentials are verified FIRST, and a correct password always succeeds —
    // even while the caller is throttled. Checking the limiter first would let
    // anyone on the internet spend 20 wrong guesses and then lock the operator
    // out of their own account for the cooldown, since the password is the only
    // way in. Throttling exists to make guessing expensive, not to become a
    // denial-of-service primitive against the legitimate user.
    //
    // A throttled caller still pays for the verification, plus an added delay, so
    // a lockout makes brute force slower rather than merely refusing responses.
    const throttle = checkLoginAllowed(clientKey);

    const body = await readBody(request);
    const username = requiredString(body.username, 'username', 200);
    const password = requiredString(body.password, 'password', 1024);

    if (!throttle.allowed) {
      await sleep(LOCKED_ATTEMPT_DELAY_MS);
    }

    const valid = await verifyCredentials(config, username, password);
    if (!valid) {
      recordLoginFailure(clientKey);
      const decision = checkLoginAllowed(clientKey);
      if (!decision.allowed) {
        return NextResponse.json(
          { error: 'Too many failed attempts. Try again later.', retryAfterSeconds: decision.retryAfterSeconds },
          { status: 429, headers: { 'Retry-After': String(decision.retryAfterSeconds ?? 60) } }
        );
      }
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
    const state = readAuthState();
    if (state.kind === 'incomplete') {
      return NextResponse.json(
        { error: 'Authentication is misconfigured', missing: state.missing, invalid: state.invalid },
        { status: 503 }
      );
    }
    if (state.kind === 'open') {
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
    const state = readAuthState();
    if (state.kind === 'incomplete') {
      return NextResponse.json(
        { error: 'Authentication is misconfigured', missing: state.missing, invalid: state.invalid },
        { status: 503 }
      );
    }
    const response = ok({ authenticated: false, openMode: state.kind === 'open' });
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
