/**
 * Shared idempotency header contract.
 *
 * Kept in its own module with no imports so the browser bundle can reference the
 * header name without pulling in the server-only store (which imports
 * better-sqlite3 and cannot be bundled for the client).
 */
export const IDEMPOTENCY_HEADER = "X-Idempotency-Key";
