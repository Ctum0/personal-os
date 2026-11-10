import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';
import { calculateSafeToSpend } from '@/lib/finance/engine';
import { readJson } from '@/lib/db/validate';

export async function GET() {
  try {
    const session = getCurrentSession();
    const db = getDb();
    const result = calculateSafeToSpend(db, session.tenantId);
    return NextResponse.json({ safeToSpend: result });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = getCurrentSession();
    const db = getDb();
    const parsedBody = await readJson(request);
    if ("error" in parsedBody) {
      return NextResponse.json({ error: parsedBody.error }, { status: parsedBody.status });
    }
    const body = parsedBody.data;

    const buffer = body.safetyBuffer !== undefined ? String(Number(body.safetyBuffer).toFixed(2)) : '500.00';
    const horizon = body.daysHorizon !== undefined ? Number(body.daysHorizon) : 30;
    const includeCredit = body.includeCreditLines ? 1 : 0;

    db.prepare(`
      INSERT INTO safe_to_spend_settings (tenant_id, safety_buffer, include_credit_lines, days_horizon, updated_at)
      VALUES (?, ?, ?, ?, datetime('now'))
      ON CONFLICT(tenant_id) DO UPDATE SET
        safety_buffer = excluded.safety_buffer,
        include_credit_lines = excluded.include_credit_lines,
        days_horizon = excluded.days_horizon,
        updated_at = datetime('now')
    `).run(session.tenantId, buffer, includeCredit, horizon);

    const result = calculateSafeToSpend(db, session.tenantId);
    return NextResponse.json({ safeToSpend: result });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
