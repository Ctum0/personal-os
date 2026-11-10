import { NextResponse } from 'next/server';
import { getDb, resolveLiveDbPath } from '@/lib/db';
import { runMaintenance, listAutoBackups, AUTO_BACKUP_INTERVAL_MS, MAX_AUTO_BACKUPS } from '@/lib/db/maintenance';

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
export async function POST(request: Request) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const force = searchParams.get('force') === '1';

    let report;
    if (force) {
      report = runMaintenance(db, resolveLiveDbPath(), { force: true });
    } else {
      report = runMaintenance(db, resolveLiveDbPath());
    }

    return NextResponse.json({
      snapshotCreated: report.snapshotCreated,
      snapshotPath: report.snapshotPath,
      prunedCount: report.prunedCount,
      integrity: report.integrity,
      reason: report.reason,
      autoBackups: listAutoBackups().map(a => a.name),
      retention: { maxAutoBackups: MAX_AUTO_BACKUPS, intervalMs: AUTO_BACKUP_INTERVAL_MS },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET() {
  const backups = listAutoBackups();
  const newest = backups[0];
  return NextResponse.json({
    autoBackups: backups.map(a => a.name),
    numberOfAutoBackups: backups.length,
    oldestBackupAgeHours: newest ? Math.round((Date.now() - newest.mtimeMs) / 3600000) : null,
    settings: { intervalMs: AUTO_BACKUP_INTERVAL_MS, maxAutoBackups: MAX_AUTO_BACKUPS },
  });
}
