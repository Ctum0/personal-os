import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';
import { calculateNetWorth } from '@/lib/finance/engine';

export async function GET() {
  try {
    const session = getCurrentSession();
    const db = getDb();
    const result = calculateNetWorth(db, session.tenantId);

    // Also get historical snapshots
    const snapshots = db.prepare(`
      SELECT * FROM net_worth_snapshots 
      WHERE tenant_id = ? 
      ORDER BY snapshot_date ASC LIMIT 30
    `).all(session.tenantId);

    return NextResponse.json({ netWorth: result, snapshots });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST() {
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

    return NextResponse.json({ success: true, netWorth: result });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
