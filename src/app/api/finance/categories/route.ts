import { getDb } from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';
import { withApiLogging } from '@/lib/api/log';
import { ok, routeError } from '@/lib/api/http';

export const GET = withApiLogging(async function GET() {
  try {
    const session = getCurrentSession();
    const db = getDb();
    const categories = db.prepare(`
      SELECT * FROM categories
      WHERE tenant_id = ?
      ORDER BY type ASC, name ASC
    `).all(session.tenantId);
    return ok({ categories });
  } catch (err) {
    return routeError(err);
  }
});
