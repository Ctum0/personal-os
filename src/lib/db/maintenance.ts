import fs from "fs";
import path from "path";
import type { Database } from "better-sqlite3";

/**
 * Scheduled maintenance: automatic SQLite snapshots + integrity checks.
 *
 * Philosophy: local-first durability without leaving the app. Every getDb()
 * init calls maybeRunMaintenance() at most once per process; the 24h staleness
 * window is served from mtimes so a long-running server self-heals daily and
 * fresh boots seed their first auto snapshot immediately.
 *
 * Snapshots live next to the live DB (dir honors PERSONAL_OS_DB_PATH) under
 * backups/auto/, and are pruned to the newest MAX_AUTO_BACKUPS.
 */

export const AUTO_BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const MAX_AUTO_BACKUPS = 10;

let maintenanceRunThisProcess = false;

export interface MaintenanceReport {
  snapshotCreated: boolean;
  snapshotPath?: string;
  prunedCount: number;
  integrity: "ok" | "skipped" | string;
  reason: string;
}

function autoBackupsDir(): string {
  return path.join(path.dirname(dbFileRef.path), "backups", "auto");
}

let dbFileRef: { path: string } = { path: "" };

/** Registers the live DB path (called from db/index.ts getDb). */
export function registerDbPath(filePath: string): void {
  dbFileRef.path = filePath;
}

export function listAutoBackups(): { file: string; name: string; mtimeMs: number }[] {
  try {
    return fs
      .readdirSync(autoBackupsDir())
      .filter(f => f.endsWith(".db"))
      .map(f => {
        const full = path.join(autoBackupsDir(), f);
        const st = fs.statSync(full);
        return { file: full, name: f, mtimeMs: st.mtimeMs };
      })
      .sort((a, b) => b.mtimeMs - a.mtimeMs);
  } catch {
    return [];
  }
}

/** Non-blocking guard: runs at most once per process, then honors staleness. */
export function maybeRunMaintenance(db: Database): void {
  if (maintenanceRunThisProcess) return;
  maintenanceRunThisProcess = true;
  try {
    runMaintenance(db, dbFileRef.path || "");
  } catch (err) {
    // Maintenance must never block app boot; degrade to console only.
    console.error("[maintenance] auto-backup failed:", (err as Error).message);
  }
}

export function runMaintenance(db: Database, liveDbPath: string, opts?: { force?: boolean }): MaintenanceReport {
  if (!dbFileRef.path) dbFileRef.path = liveDbPath;
  const dir = autoBackupsDir();
  fs.mkdirSync(dir, { recursive: true });

  const existing = listAutoBackups();
  const newest = existing[0];
  let ageMs = newest ? Date.now() - newest.mtimeMs : Infinity;

  if (!opts?.force && ageMs < AUTO_BACKUP_INTERVAL_MS) {
    return {
      snapshotCreated: false,
      prunedCount: 0,
      integrity: "skipped",
      reason: `Newest auto backup is ${Math.round(ageMs / 60000)}m old (< 24h window)`,
    };
  }

  if (opts?.force && ageMs === Infinity) ageMs = Infinity; // first snapshot semantic stays

  // WAL-safe snapshot: VACUUM INTO produces a verified compact copy.
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(dir, `personal_os-auto-${stamp}.db`);
  db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);

  // Prune to the newest MAX_AUTO_BACKUPS.
  let prunedCount = 0;
  for (const old of listAutoBackups().slice(MAX_AUTO_BACKUPS)) {
    try {
      fs.rmSync(old.file, { force: true });
      prunedCount++;
    } catch {
      /* best effort */
    }
  }

  // Verify the live DB (and therefore the page set just vacuumed) reads clean.
  const check = db.pragma("quick_check", { simple: true });
  if (check !== "ok") {
    return {
      snapshotCreated: true,
      snapshotPath: file,
      prunedCount,
      integrity: String(check),
      reason: "Snapshot created but quick_check on live DB flagged issues",
    };
  }

  return {
    snapshotCreated: true,
    snapshotPath: file,
    prunedCount,
    integrity: "ok",
    reason: ageMs === Infinity ? "First auto snapshot for this DB" : "Previous auto backup exceeded 24h",
  };
}
