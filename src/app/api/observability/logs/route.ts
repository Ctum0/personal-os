import { readApiLogTail } from '@/lib/api/logger';
import { withApiLogging } from '@/lib/api/log';
import { ok, routeError } from '@/lib/api/http';

/**
 * Local observability viewer: JSON-lines access log tail.
 * GET /api/observability/logs?tail=50&day=YYYYMMDD
 *
 * The file store lives next to the DB (honors PERSONAL_OS_DB_PATH) as
 * logs/requests-<day>.log; entries are correlated by x-request-id assigned in
 * the Next proxy.
 */
export const GET = withApiLogging(async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const tail = Math.max(1, Math.min(Number.parseInt(searchParams.get('tail') || '50', 10) || 50, 500));
    const day = (searchParams.get('day') || '').replace(/\D/g, '').slice(0, 8) || undefined;
    const entries = readApiLogTail(tail, day);
    return ok({ count: entries.length, entries });
  } catch (err) {
    return routeError(err);
  }
});
