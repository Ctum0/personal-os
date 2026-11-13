import { getDb } from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';
import { rescheduleTask } from '@/lib/productivity/planner';
import { withApiLogging } from '@/lib/api/log';
import { ok, notFound, readBody, routeError } from '@/lib/api/http';
import { optionalEnum, optionalString, requiredISODate, requiredString } from '@/lib/api/fields';

const VALID_RESCHEDULE_ACTIONS = ['rescheduled', 'postponed', 'moved_to_backlog', 'cancelled'] as const;

export const POST = withApiLogging(async function POST(request: Request) {
  try {
    const session = getCurrentSession();
    const db = getDb();
    const body = await readBody(request);

    const taskId = requiredString(body.taskId, 'taskId', 100);
    const newDate = requiredISODate(body.newDate, 'newDate');
    const reason = optionalString(body.reason, 'reason', 500);
    const actionType = optionalEnum(body.actionType, 'actionType', VALID_RESCHEDULE_ACTIONS) ?? 'rescheduled';

    const task = db
      .prepare('SELECT id FROM tasks WHERE id = ? AND tenant_id = ?')
      .get(taskId, session.tenantId) as { id: string } | undefined;
    if (!task) {
      notFound('Task');
    }

    const result = rescheduleTask(db, session.tenantId, taskId, newDate, reason, actionType);
    return ok(result);
  } catch (err) {
    return routeError(err);
  }
});
