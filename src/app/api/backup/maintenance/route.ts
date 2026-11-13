import { getDb, resolveLiveDbPath } from '@/lib/db';
import { runMaintenance, listAutoBackups, AUTO_BACKUP_INTERVAL_MS, MAX_AUTO_BACKUPS } from '@/lib/db/maintenance';
import { withApiLogging } from '@/lib/api/log';
import { ok, routeError } from '@/lib/api/http';

/**
 * On-demand maintenance endpoint (complements the 24h getDb() auto-run):
 *
 * POST /api/backup/maintenance
 *   - creates a fresh snapshot if the newest auto backup is older than 24h
 *   - always prunes to the newest 10 auto backups
 *   - runs quick_check and reports integrity
 * GET  /api/backup/maintenance
 *   - status only: existing auto backups, interval + retention settings
 *
 * POST ?force=1 creates a snapshot even when the newest one is fresh.
 */
export const POST = withApiLogging(async function POST(request: Request) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const force = searchParams.get('force') === '1';

    const report = runMaintenance(db, resolveLiveDbPath(), force ? { force: true } : undefined);

    return ok({
      snapshotCreated: report.snapshotCreated,
      snapshotPath: report.snapshotPath,
      prunedCount: report.prunedCount,
      integrity: report.integrity,
      reason: report.reason,
      autoBackups: listAutoBackups().map((a) => a.name),
      retention: { maxAutoBackups: MAX_AUTO_BACKUPS, intervalMs: AUTO_BACKUP_INTERVAL_MS },
    });
  } catch (err) {
    return routeError(err);
  }
});

export const GET = withApiLogging(async function GET() {
  try {
    const backups = listAutoBackups();
    const newest = backups[0];
    return ok({
      autoBackups: backups.map((a) => a.name),
      numberOfAutoBackups: backups.length,
      oldestBackupAgeHours: newest ? Math.round((Date.now() - newest.mtimeMs) / 3600000) : null,
      settings: { intervalMs: AUTO_BACKUP_INTERVAL_MS, maxAutoBackups: MAX_AUTO_BACKUPS },
    });
  } catch (err) {
    return routeError(err);
  }
});
