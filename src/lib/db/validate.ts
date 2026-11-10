import type Database from 'better-sqlite3';

/**
 * Minimal manual input-validation helpers used by the API route handlers.
 * The project deliberately avoids a zod dependency; these follow the existing
 * inline-check style but centralize the repeated patterns.
 */

/** YYYY-MM-DD calendar date (zero padded, real month/day). */
export function isISODateString(v: unknown): v is string {
  if (typeof v !== 'string') return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  return true;
}

/** ISO-ish datetime (e.g. 2026-01-01T09:00:00Z / ...00.000Z). */
export function isISODateTimeString(v: unknown): boolean {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}([T\s]\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/.test(v);
}

/** HH:mm or HH:mm:ss */
export function isTimeString(v: unknown): v is string {
  if (typeof v !== 'string') return false;
  const m = v.match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return false;
  return Number(m[1]) <= 23 && Number(m[2]) <= 59;
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
 * Uniform JSON-body parsing for route handlers. Malformed or non-JSON bodies
 * produce a 400 (client input error) instead of surfacing as a 500.
 */
export async function readJson(
  request: Request
): Promise<{ data: any } | { error: string; status: number }> {
  try {
    return { data: await request.json() };
  } catch {
    return { error: 'Request body must be valid JSON', status: 400 };
  }
}

/**
 * Verifies that every provided reference id belongs to the tenant.
 * `table` must be tenant-scoped (columns id + tenant_id).
 */
export function referenceExists(
  db: Database.Database,
  tenantId: string,
  table: string,
  id: unknown
): boolean {
  if (id === undefined || id === null || id === '') return true;
  if (typeof id !== 'string') return false;
  const row = db
    .prepare(`SELECT id FROM ${table} WHERE id = ? AND tenant_id = ? LIMIT 1`)
    .get(id, tenantId);
  return Boolean(row);
}
