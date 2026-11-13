import type Database from 'better-sqlite3';

/**
 * Minimal manual input-validation helpers used by the API route handlers.
 * The project deliberately avoids a zod dependency; these follow the existing
 * inline-check style but centralize the repeated patterns.
 */

/** True when y/m/d is a real calendar day (rejects 2026-02-31, 2026-04-31, ...). */
function isRealCalendarDate(y: number, m: number, d: number): boolean {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return false;
  if (m < 1 || m > 12 || d < 1) return false;
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d <= daysInMonth;
}

/** YYYY-MM-DD calendar date (zero padded, real month/day). */
export function isISODateString(v: unknown): v is string {
  if (typeof v !== 'string') return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split('-').map(Number);
  return isRealCalendarDate(y, m, d);
}

/** ISO-ish datetime (e.g. 2026-01-01T09:00:00Z / ...00.000Z) with real date and clock bounds. */
export function isISODateTimeString(v: unknown): boolean {
  if (typeof v !== 'string') return false;
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?$/);
  if (!m) return false;
  if (!isRealCalendarDate(Number(m[1]), Number(m[2]), Number(m[3]))) return false;
  if (m[4] === undefined) return true;
  const hh = Number(m[4]);
  const mm = Number(m[5]);
  const ss = m[6] === undefined ? 0 : Number(m[6]);
  return hh <= 23 && mm <= 59 && ss <= 59;
}

/** HH:mm or HH:mm:ss */
export function isTimeString(v: unknown): v is string {
  if (typeof v !== 'string') return false;
  const m = v.match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return false;
  return Number(m[1]) <= 23 && Number(m[2]) <= 59 && (m[3] === undefined || Number(m[3]) <= 59);
}

/**
 * Strictly parses a number. Accepts finite JS numbers and numeric strings;
 * rejects NaN, Infinity and empty/non-numeric strings.
 */
export function parseFiniteNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function isNonNegativeInteger(v: unknown): boolean {
  const n = parseFiniteNumber(v);
  return n !== null && Number.isInteger(n) && n >= 0;
}

/** Validate an enum-typed value. Empty/undefined passes (falls back to default). */
export function matchesEnum(value: unknown, allowed: string[]): boolean {
  if (value === undefined || value === null || value === '') return true;
  return typeof value === 'string' && allowed.includes(value);
}

/**
 * Trimmed, bounded string check. Ordering matters: `String(value).trim()`
 * before a typeof test turns a numeric payload into a 500 (`title.trim is not
 * a function`) — callers get a 400 instead.
 */
export function isNonEmptyString(v: unknown, maxLength = 500): v is string {
  return typeof v === 'string' && v.trim().length > 0 && v.length <= maxLength;
}

/** Parsed JSON object with unknown-valued fields; narrow each field on read. */
export type JsonObject = Record<string, unknown>;

/** True when the value is a plain JSON object (not null, not an array). */
export function isJsonObject(v: unknown): v is JsonObject {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Uniform JSON-body parsing for route handlers. Malformed or non-JSON bodies
 * produce a 400 (client input error) instead of surfacing as a 500; a
 * non-object body (array, string, number) is rejected the same way because
 * every route treats the body as a field bag.
 */
export async function readJson(
  request: Request
): Promise<{ data: JsonObject } | { error: string; status: number }> {
  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    return { error: 'Request body must be valid JSON', status: 400 };
  }
  if (!isJsonObject(parsed)) {
    return { error: 'Request body must be a JSON object', status: 400 };
  }
  return { data: parsed };
}

/** Optional string field: undefined when absent/null, null when present but not a string. */
export function optString(v: unknown): string | undefined | null {
  if (v === undefined || v === null) return undefined;
  return typeof v === 'string' ? v : null;
}

/** Error message extraction that never throws on non-Error throws. */
export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return 'Internal error';
}

/** 500 response body helper used by every route's catch block. */
export function serverError(err: unknown): { error: string } {
  return { error: errorMessage(err) };
}

/** Maps well-known SQLite constraint failures to a client-facing 4xx. */
export function sqliteErrorStatus(err: unknown): number {
  const message = errorMessage(err);
  if (/FOREIGN KEY constraint failed/i.test(message)) return 400;
  if (/UNIQUE constraint failed/i.test(message)) return 409;
  return 500;
}

/** Tables that `referenceExists` may query. Interpolation is limited to this list. */
const REFERENCE_TABLES = new Set([
  'spaces',
  'projects',
  'goals',
  'tasks',
  'habits',
  'finance_accounts',
  'categories',
  'payees',
  'savings_goals',
  'budgets',
  'ai_action_drafts',
]);

/**
 * Verifies that every provided reference id belongs to the tenant.
 * `table` is allow-listed because it is interpolated into SQL.
 */
export function referenceExists(
  db: Database.Database,
  tenantId: string,
  table: string,
  id: unknown
): boolean {
  if (id === undefined || id === null || id === '') return true;
  if (typeof id !== 'string') return false;
  if (!REFERENCE_TABLES.has(table)) {
    throw new Error(`referenceExists: unsupported table "${table}"`);
  }
  const row = db
    .prepare(`SELECT id FROM ${table} WHERE id = ? AND tenant_id = ? LIMIT 1`)
    .get(id, tenantId);
  return Boolean(row);
}
