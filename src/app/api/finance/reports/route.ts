import { getDb } from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';
import { calculateIncomeAndExpenses } from '@/lib/finance/engine';
import { todayISO } from '@/lib/time';
import { withApiLogging } from '@/lib/api/log';
import { FieldError, ok, routeError } from '@/lib/api/http';
import { optionalISODate } from '@/lib/api/fields';

export const GET = withApiLogging(async function GET(request: Request) {
  try {
    const session = getCurrentSession();
    const db = getDb();
    const { searchParams } = new URL(request.url);

    const today = todayISO();
    const startDate = optionalISODate(searchParams.get('startDate'), 'startDate') ?? `${today.slice(0, 7)}-01`;
    const endDate = optionalISODate(searchParams.get('endDate'), 'endDate') ?? today;

    // A reversed window silently reports zeros for every figure, so it is a
    // client error rather than an empty report.
    if (startDate > endDate) {
      throw new FieldError('startDate must not be after endDate');
    }

    const reports = calculateIncomeAndExpenses(db, session.tenantId, startDate, endDate);
    return ok({ reports });
  } catch (err) {
    return routeError(err);
  }
});
