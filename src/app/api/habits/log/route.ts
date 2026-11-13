import { getDb } from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';
import { todayISO } from '@/lib/time';
import { withApiLogging } from '@/lib/api/log';
import { FieldError, notFound, ok, readBody, routeError } from '@/lib/api/http';
import { optionalEnum, optionalISODate, optionalNumber, optionalString, requiredString } from '@/lib/api/fields';
import { referenceExists } from '@/lib/db/validate';

const LOG_STATUSES = ['completed', 'excused', 'missed', 'failed'] as const;

export const POST = withApiLogging(async function POST(request: Request) {
  try {
    const session = getCurrentSession();
    const db = getDb();
    const body = await readBody(request);

    const habitId = requiredString(body.habitId, 'habitId', 100);
    if (!referenceExists(db, session.tenantId, 'habits', habitId)) notFound('Habit');

    const date = optionalISODate(body.date, 'date') ?? todayISO();
    const status = optionalEnum(body.status, 'status', LOG_STATUSES) ?? 'completed';
    const notes = optionalString(body.notes, 'notes', 2000) ?? null;

    const value = optionalNumber(body.value, 'value') ?? 1;
    if (value < 0) throw new FieldError('value must be a non-negative number');

    const logId = `hl_${habitId}_${date.replace(/-/g, '')}`;

    // Insert or update existing log for the day
    db.prepare(`
      INSERT INTO habit_logs (id, tenant_id, habit_id, log_date, value, status, notes, logged_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(tenant_id, habit_id, log_date) DO UPDATE SET
        value = excluded.value,
        status = excluded.status,
        notes = excluded.notes,
        logged_at = datetime('now')
    `).run(logId, session.tenantId, habitId, date, value, status, notes);

    const log = db.prepare('SELECT * FROM habit_logs WHERE tenant_id = ? AND habit_id = ? AND log_date = ?').get(
      session.tenantId,
      habitId,
      date
    );
    return ok({ success: true, log });
  } catch (err) {
    return routeError(err);
  }
});

export const DELETE = withApiLogging(async function DELETE(request: Request) {
  try {
    const session = getCurrentSession();
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const habitId = searchParams.get('habitId');
    const date = optionalISODate(searchParams.get('date'), 'date') ?? todayISO();

    if (!habitId) {
      throw new FieldError('Habit ID is required');
    }

    db.prepare('DELETE FROM habit_logs WHERE tenant_id = ? AND habit_id = ? AND log_date = ?').run(
      session.tenantId,
      habitId,
      date
    );
    return ok({ success: true });
  } catch (err) {
    return routeError(err);
  }
});
