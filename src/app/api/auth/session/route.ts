import { sha256Hex } from '@/lib/api/gate';
import { NextResponse } from 'next/server';

/**
 * Session unlock endpoint — the ONLY /api path exempt from the gate.
 *
 * POST { pin: string }  → compares against PERSONAL_OS_PIN in constant time and,
 * on match, sets the `personal_os_session` cookie (httpOnly, sha256 digest).
 * DELETE                → clears the session cookie.
 * POST with wrong pin   → 401 with WWW-Authenticate hint (same as the gate).
 *
 * Cookie holds the sha256(pin) digest, never the raw pin.
 */

export async function POST(request: Request) {
  const pin = process.env.PERSONAL_OS_PIN;
  if (!pin) {
    // Open mode — there is nothing to unlock.
    return NextResponse.json({ authorized: true, openMode: true }, { status: 200 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Malformed JSON body' }, { status: 400 });
  }

  const provided = typeof (payload as { pin?: unknown })?.pin === 'string'
    ? (payload as { pin: string }).pin
    : null;

  if (!provided || provided.length === 0 || provided.length > 512) {
    return NextResponse.json({ error: 'Provide a pin string' }, { status: 400 });
  }

  const providedDigest = await sha256Hex(provided);
  const expectedDigest = await sha256Hex(pin);
  const a = providedDigest;
  const b = expectedDigest;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  if (diff !== 0 || a.length !== b.length) {
    return NextResponse.json(
      { error: 'Invalid pin' },
      { status: 401, headers: { 'WWW-Authenticate': 'PersonalOS-PIN realm="Personal OS"' } },
    );
  }

  const response = NextResponse.json({ authorized: true, openMode: false }, { status: 200 });
  response.cookies.set('personal_os_session', expectedDigest, {
    httpOnly: true,
    sameSite: 'strict',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
    secure: process.env.NODE_ENV === 'production',
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ authorized: false, openMode: !process.env.PERSONAL_OS_PIN }, { status: 200 });
  response.cookies.set('personal_os_session', '', { httpOnly: true, path: '/', maxAge: 0 });
  return response;
}
