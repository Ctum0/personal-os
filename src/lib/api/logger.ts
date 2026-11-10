import fs from "fs";
import path from "path";

/**
 * Structured JSON-lines request logger for local observability.
 *
 * Correlation: the Next proxy (`src/proxy.ts`) assigns x-request-id on every
 * /api/* response. This logger subscribes nothing on its own — routes call
 * `logApiRequest()` from a small helper or the proxy emits the pair through
 * `AsyncLocalStorage`-free plumbing: to stay edge-runtime compatible, the
 * proxy cannot write Node files, so it forwards trace context in response
 * headers and the logger is invoked from Node-side API routes via
 * `withApiLogging(handler)` in src/lib/api/log.ts wrapping.
 *
 * Appends one JSON object per line under <dbdir>/logs/requests-YYYYMMDD.log
 * (dbdir honors PERSONAL_OS_DB_PATH, so sandboxes log sandbox-side).
 */

export interface ApiLogEntry {
  ts: string;
  requestId: string;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  error?: string;
  tenantId?: string;
}

let logsDirCached: string | null = null;

function logsDir(): string {
  if (logsDirCached) return logsDirCached;
  const dbDir = path.dirname(
    process.env.PERSONAL_OS_DB_PATH || path.join(process.cwd(), "data", "personal_os.db")
  );
  logsDirCached = path.join(dbDir, "logs");
  try {
    fs.mkdirSync(logsDirCached, { recursive: true });
  } catch {
    /* logging must never crash a request */
  }
  return logsDirCached;
}

export function appendApiLog(entry: ApiLogEntry): void {
  try {
    const day = entry.ts.slice(0, 10).replace(/-/g, "");
    const file = path.join(logsDir(), `requests-${day}.log`);
    fs.appendFileSync(file, JSON.stringify(entry) + "\n");
  } catch {
    /* best effort only */
  }
}

export function readApiLogTail(n = 50, day = new Date().toISOString().slice(0, 10).replace(/-/g, "")): ApiLogEntry[] {
  try {
    const file = path.join(logsDir(), `requests-${day}.log`);
    if (!fs.existsSync(file)) return [];
    const lines = fs.readFileSync(file, "utf-8").trim().split("\n").filter(Boolean);
    return lines.slice(-n).map(l => {
      try {
        return JSON.parse(l) as ApiLogEntry;
      } catch {
        return { ts: "", requestId: "?", method: "?", path: "?", status: 0, durationMs: 0 } as ApiLogEntry;
      }
    });
  } catch {
    return [];
  }
}
