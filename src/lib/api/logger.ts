import fs from "fs";
import path from "path";

/**
 * Structured JSON-lines request logger for local observability.
 *
 * Correlation: `src/proxy.ts` assigns an x-request-id to the request and the
 * response of every /api/* call; `withApiLogging()` records that same id, so a
 * client-visible header can be looked up directly in the log file.
 *
 * One JSON object per line under <dbdir>/logs/requests-YYYYMMDD.log, where
 * dbdir honors PERSONAL_OS_DB_PATH (sandboxes log sandbox-side).
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

// Cache is keyed by the resolved directory so a PERSONAL_OS_DB_PATH switch
// (tests, restore tooling, sandboxed profiles) is honored instead of silently
// pinning the first process-wide answer.
const logsDirCache = new Map<string, string>();

function logsDir(): string {
  const dbDir = path.dirname(
    process.env.PERSONAL_OS_DB_PATH || path.join(process.cwd(), "data", "personal_os.db")
  );
  const cached = logsDirCache.get(dbDir);
  if (cached) return cached;
  const dir = path.join(dbDir, "logs");
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    /* logging must never crash a request */
  }
  logsDirCache.set(dbDir, dir);
  return dir;
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
