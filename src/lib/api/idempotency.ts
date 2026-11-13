import type Database from "better-sqlite3";
import { getDb } from "@/lib/db";
import { IDEMPOTENCY_HEADER } from "./idempotency-key";

export { IDEMPOTENCY_HEADER };

/**
 * Idempotent replay protection for client-side offline retries.
 *
 * `guardOffline()` in the UI parks a mutation in localStorage when the network
 * fails and replays it later with an `X-Idempotency-Key`. Without a server-side
 * record of that key, a request whose response was lost is committed twice —
 * exactly the double-post the offline queue exists to prevent.
 *
 * The key is scoped per tenant, and the stored response is replayed verbatim so
 * the retry observes the same status and body as the original success.
 */

/**
 * Canonical header name. HTTP header lookup is case-insensitive, but the client
 * side writes it into a plain object, so the exact casing here is what tests and
 * other clients observe.
 */
const RETENTION_DAYS = 7;

export interface StoredResponse {
  status: number;
  body: string;
  contentType: string;
}

interface IdempotencyRow {
  status: number;
  body: string;
  content_type: string;
  method: string;
  path: string;
}

/**
 * Reads a previously stored response for this key, if any.
 *
 * The key alone is not enough: a client that reuses one key for two different
 * mutations would otherwise receive the first response for the second operation
 * and skip the write silently. A method/path mismatch is treated as a fresh
 * request (the caller stores its own response under the same key).
 */
export function readIdempotentResponse(
  tenantId: string,
  key: string,
  scope?: { method: string; path: string }
): StoredResponse | null {
  if (!key) return null;
  const db = getDb();
  const row = db.prepare(
    `SELECT status, body, content_type, method, path FROM idempotency_keys WHERE tenant_id = ? AND key = ?`
  ).get(tenantId, key) as IdempotencyRow | undefined;
  if (!row) return null;
  if (scope && (row.method !== scope.method || row.path !== scope.path)) return null;
  return { status: row.status, body: row.body, contentType: row.content_type };
}

/** Stores the response produced for this key. Failures are never cached. */
export function storeIdempotentResponse(
  tenantId: string,
  key: string,
  method: string,
  path: string,
  response: StoredResponse
): void {
  if (!key || response.status >= 500) return;
  const db = getDb();
  try {
    db.prepare(
      `INSERT INTO idempotency_keys (tenant_id, key, method, path, status, body, content_type, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(tenant_id, key) DO NOTHING`
    ).run(tenantId, key, method, path, response.status, response.body, response.contentType);
    pruneExpired(db);
  } catch {
    // Idempotency is an optimization for retries; never fail the request over it.
  }
}

function pruneExpired(db: Database.Database): void {
  db.prepare(
    `DELETE FROM idempotency_keys WHERE created_at < datetime('now', ?)`
  ).run(`-${RETENTION_DAYS} days`);
}
