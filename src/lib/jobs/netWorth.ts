import type { Database } from "better-sqlite3";
import { calculateNetWorth } from "@/lib/finance/engine";
import { todayISO } from "@/lib/time";

/**
 * Scheduled daily net-worth snapshot job.
 *
 * The `net_worth_snapshots` table (UNIQUE(tenant_id, snapshot_date)) previously
 * sat empty because snapshots were only written when someone visited the Net
 * Worth page. This job runs once per process day from getDb() init and writes
 * an idempotent upsert for today, so history accrues even without UI visits.
 */

let lastRunDate = ""; // per-process memo: only one snapshot attempt per day

export interface NetWorthJobResult {
  ran: boolean;
  reason: string;
  tenantId?: string;
  snapshotDate?: string;
  netWorth?: string;
}

export function maybeSnapshotNetWorth(db: Database): NetWorthJobResult {
  const today = todayISO();
  if (lastRunDate === today) {
    return { ran: false, reason: `Already snapshotted ${today} this process` };
  }
  lastRunDate = today;
  try {
    return snapshotNetWorthForToday(db);
  } catch (err) {
    return { ran: false, reason: `Net-worth snapshot failed: ${(err as Error).message}` };
  }
}

export function snapshotNetWorthForToday(db: Database): NetWorthJobResult {
  const tenant = db
    .prepare(`SELECT id FROM tenants ORDER BY created_at ASC LIMIT 1`)
    .get() as { id: string } | undefined;
  const tenantId = tenant?.id;
  if (!tenantId) {
    return { ran: false, reason: "No tenant exists yet — nothing to snapshot" };
  }

  const result = calculateNetWorth(db, tenantId);
  const snapshotDate = result.asOfDate || todayISO();

  db.prepare(
    `INSERT INTO net_worth_snapshots (
       id, tenant_id, snapshot_date, total_assets, total_liabilities, net_worth, currency, breakdown
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(tenant_id, snapshot_date) DO UPDATE SET
       total_assets = excluded.total_assets,
       total_liabilities = excluded.total_liabilities,
       net_worth = excluded.net_worth,
       breakdown = excluded.breakdown`
  ).run(
    `nw_${snapshotDate.replace(/-/g, "")}`,
    tenantId,
    snapshotDate,
    result.totalAssets,
    result.totalLiabilities,
    result.netWorth,
    result.currency,
    JSON.stringify({ assets: result.assetsList, liabilities: result.liabilitiesList })
  );

  return {
    ran: true,
    reason: "Requested snapshot written",
    tenantId,
    snapshotDate,
    netWorth: result.netWorth,
  };
}
