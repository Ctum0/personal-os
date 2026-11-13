import { getDb } from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';
import { calculateNetWorth } from '@/lib/finance/engine';
import { withApiLogging } from '@/lib/api/log';
import { ok, routeError } from '@/lib/api/http';

const SNAPSHOT_WINDOW = 30;

export const GET = withApiLogging(async function GET() {
  try {
    const session = getCurrentSession();
    const db = getDb();
    const result = calculateNetWorth(db, session.tenantId);

    // The chart needs chronological points, but the window must be taken from
    // the NEWEST history — an ascending LIMIT would freeze the series at the
    // oldest 30 rows and hide everything recorded since.
    const recent = db.prepare(`
      SELECT * FROM net_worth_snapshots 
      WHERE tenant_id = ? 
      ORDER BY snapshot_date DESC LIMIT ?
    `).all(session.tenantId, SNAPSHOT_WINDOW);
    const snapshots = recent.reverse();

    return ok({ netWorth: result, snapshots });
  } catch (err) {
    return routeError(err);
  }
});

export const POST = withApiLogging(async function POST() {
  try {
    const session = getCurrentSession();
    const db = getDb();
    const result = calculateNetWorth(db, session.tenantId);

    // Save snapshot for today
    db.prepare(`
      INSERT INTO net_worth_snapshots (
        id, tenant_id, snapshot_date, total_assets, total_liabilities, net_worth, currency, breakdown
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(tenant_id, snapshot_date) DO UPDATE SET
        total_assets = excluded.total_assets,
        total_liabilities = excluded.total_liabilities,
        net_worth = excluded.net_worth,
        breakdown = excluded.breakdown
    `).run(
      `nw_${result.asOfDate.replace(/-/g, '')}`,
      session.tenantId,
      result.asOfDate,
      result.totalAssets,
      result.totalLiabilities,
      result.netWorth,
      result.currency,
      JSON.stringify({ assets: result.assetsList, liabilities: result.liabilitiesList })
    );

    return ok({ success: true, netWorth: result });
  } catch (err) {
    return routeError(err);
  }
});
