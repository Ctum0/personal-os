import { getDb } from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';
import { calculateSafeToSpend } from '@/lib/finance/engine';
import { withApiLogging } from '@/lib/api/log';
import { ok, readBody, routeError } from '@/lib/api/http';
import { optionalBoolean, optionalInt, optionalMoney } from '@/lib/api/fields';

export const GET = withApiLogging(async function GET() {
  try {
    const session = getCurrentSession();
    const db = getDb();
    const result = calculateSafeToSpend(db, session.tenantId);
    return ok({ safeToSpend: result });
  } catch (err) {
    return routeError(err);
  }
});

export const POST = withApiLogging(async function POST(request: Request) {
  try {
    const session = getCurrentSession();
    const db = getDb();
    const body = await readBody(request);

    // These settings drive every later read. An unvalidated value (negative or
    // NaN persisted as the string 'NaN') poisons the whole calculation, so it
    // is rejected here instead of being degraded downstream.
    const buffer = optionalMoney(body.safetyBuffer, 'safetyBuffer') ?? '500.00';
    const horizon = optionalInt(body.daysHorizon, 'daysHorizon', 1, 365) ?? 30;
    const includeCredit = (optionalBoolean(body.includeCreditLines, 'includeCreditLines') ?? false) ? 1 : 0;

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
    return ok({ safeToSpend: result });
  } catch (err) {
    return routeError(err);
  }
});
