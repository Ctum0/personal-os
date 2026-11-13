import { getDb } from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';
import { withApiLogging } from '@/lib/api/log';
import { FieldError, ok, readBody, routeError } from '@/lib/api/http';

const MAX_PREFERENCES_BYTES = 100_000;
const PROTECTED_KEYS = ['__proto__', 'constructor', 'prototype'] as const;

interface PreferencesRow {
  preferences: string | null;
}

function parsePreferences(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return isPlainObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export const GET = withApiLogging(async function GET() {
  try {
    const session = getCurrentSession();
    const db = getDb();

    const user = db
      .prepare('SELECT preferences FROM users WHERE id = ? AND tenant_id = ?')
      .get(session.userId, session.tenantId) as PreferencesRow | undefined;

    return ok({ preferences: parsePreferences(user?.preferences) });
  } catch (err) {
    return routeError(err);
  }
});

export const PUT = withApiLogging(async function PUT(request: Request) {
  try {
    const session = getCurrentSession();
    const db = getDb();
    const body = await readBody(request);

    // Preferences merge must be a flat JSON object of safe size. `in` would walk
    // the prototype chain (every plain object inherits `constructor`), so the
    // protected keys are checked as own properties only.
    if (PROTECTED_KEYS.some((key) => Object.hasOwn(body, key))) {
      throw new FieldError('Preferences contain protected keys');
    }
    if (JSON.stringify(body).length > MAX_PREFERENCES_BYTES) {
      throw new FieldError('Preferences payload too large', 413);
    }

    const current = db
      .prepare('SELECT preferences FROM users WHERE id = ? AND tenant_id = ?')
      .get(session.userId, session.tenantId) as PreferencesRow | undefined;

    const updated = Object.assign({}, parsePreferences(current?.preferences), body);

    db.prepare(`
      UPDATE users
      SET preferences = ?, updated_at = datetime('now')
      WHERE id = ? AND tenant_id = ?
    `).run(JSON.stringify(updated), session.userId, session.tenantId);

    return ok({ preferences: updated });
  } catch (err) {
    return routeError(err);
  }
});
