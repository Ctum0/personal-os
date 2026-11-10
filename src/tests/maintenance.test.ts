import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'path';
import fs from 'fs';

/**
 * Auto-backup maintenance job tests, against an isolated temp DB so the live
 * user DB is never touched. Exercises: first snapshot seeding, staleness
 * window, retention pruning, quick_check integrity, and the on-demand route
 * contract (force + status).
 */

const TMP_DIR = '/tmp/opencode/personal-os-maintenance-test';
const DB_FILE = path.join(TMP_DIR, 'personal_os.maint.db');

beforeAll(async () => {
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
  process.env.PERSONAL_OS_DB_PATH = DB_FILE;
  const { getDb } = await import('../lib/db');
  getDb(); // triggers init + maybeRunMaintenance
});

afterAll(() => {
  delete process.env.PERSONAL_OS_DB_PATH;
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
});

describe('auto-backup maintenance', () => {
  it('seeds a first auto snapshot on fresh DB init', async () => {
    const { listAutoBackups, runMaintenance } = await import('../lib/db/maintenance');
    const backups = listAutoBackups();
    expect(backups.length).toBe(1); // boot ran maintenance once
    expect(backups[0].name).toMatch(/personal_os-auto-.*\.db$/);
    expect(fs.existsSync(backups[0].file)).toBe(true);

    const { getDb } = await import('../lib/db');
    const fresh = runMaintenance(getDb(), DB_FILE);
    expect(fresh.snapshotCreated).toBe(false); // 24h window not elapsed
    expect(fresh.integrity).toBe('skipped');
  });

  it('force run creates another snapshot and prunes retention to 10', async () => {
    const { runMaintenance, listAutoBackups } = await import('../lib/db/maintenance');
    const { getDb } = await import('../lib/db');
    for (let i = 0; i < 11; i++) {
      const r = runMaintenance(getDb(), DB_FILE, { force: true });
      expect(r.snapshotCreated).toBe(true);
      expect(r.integrity).toBe('ok');
    }
    const backups = listAutoBackups();
    expect(backups.length).toBe(10); // retention cap
    expect(backups[0].mtimeMs).toBeGreaterThanOrEqual(backups[1].mtimeMs);
  });

  it('POST /api/backup/maintenance returns truthful report', async () => {
    const mod = await import('../app/api/backup/maintenance/route');
    const res = await mod.POST(new Request('http://localhost/api/backup/maintenance?force=1', { method: 'POST' }));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.snapshotCreated).toBe(true);
    expect(data.integrity).toBe('ok');
    expect(data.autoBackups.length).toBe(10);
    expect(data.retention.maxAutoBackups).toBe(10);

    const status = await (await mod.GET()).json();
    expect(status.numberOfAutoBackups).toBe(10);
    expect(status.settings.intervalMs).toBe(24 * 60 * 60 * 1000);
  });
});
