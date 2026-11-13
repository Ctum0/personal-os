import { getDb } from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';
import { QUARANTINED_STATUS } from '@/lib/db/visibility';
import { withApiLogging } from '@/lib/api/log';
import { FieldError, notFound, ok, readBody, routeError } from '@/lib/api/http';
import {
  optionalBoolean,
  optionalEnum,
  optionalISODate,
  optionalISODateTime,
  optionalString,
  requiredISODateTime,
  requiredString,
} from '@/lib/api/fields';
import { referenceExists } from '@/lib/db/validate';

/** Quarantined-task isolation: calendar blocks linked to quarantined tasks are hidden. */
const NOT_QUARANTINED_TASK = `
  AND NOT EXISTS (
    SELECT 1 FROM tasks qt WHERE qt.id = calendar_events.task_id AND qt.status = '${QUARANTINED_STATUS}'
  )
`;

const EVENT_TYPES = ['time_block', 'daily_plan_block', 'habit', 'meeting'] as const;

/** Hard cap so a full-history read can never stream an unbounded result set. */
const EVENT_LIMIT = 2000;

interface CalendarEventRow {
  id: string;
  start_time: string;
  end_time: string;
}

export const GET = withApiLogging(async function GET(request: Request) {
  try {
    const session = getCurrentSession();
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const startDate = optionalISODate(searchParams.get('startDate'), 'startDate');
    const endDate = optionalISODate(searchParams.get('endDate'), 'endDate');
    const spaceId = searchParams.get('spaceId');
    const includeQuarantined = searchParams.get('includeQuarantined') === '1';

    let query = `SELECT * FROM calendar_events WHERE tenant_id = ? ${includeQuarantined ? '' : NOT_QUARANTINED_TASK}`;
    const params: string[] = [session.tenantId];

    // The calendar page sends its active space; ignoring it mixed every space's
    // blocks into one grid. 'all' means no space filter.
    if (spaceId && spaceId !== 'all') {
      query += ' AND space_id = ?';
      params.push(spaceId);
    }

    if (startDate && endDate) {
      query += ' AND date(start_time) >= ? AND date(end_time) <= ?';
      params.push(startDate, endDate);
    }
    query += ' ORDER BY start_time ASC LIMIT ?';

    const events = db.prepare(query).all(...params, EVENT_LIMIT);
    return ok({ events });
  } catch (err) {
    return routeError(err);
  }
});

export const POST = withApiLogging(async function POST(request: Request) {
  try {
    const session = getCurrentSession();
    const db = getDb();
    const body = await readBody(request);

    const title = requiredString(body.title, 'title', 500);
    const startTime = requiredISODateTime(body.startTime, 'startTime');
    const endTime = requiredISODateTime(body.endTime, 'endTime');
    if (endTime < startTime) {
      throw new FieldError('endTime must not precede startTime');
    }
    const eventType = optionalEnum(body.eventType, 'eventType', EVENT_TYPES) ?? 'time_block';
    const description = optionalString(body.description, 'description', 20_000) ?? '';
    const spaceId = optionalString(body.spaceId, 'spaceId', 100) ?? 'space_personal';
    const taskId = optionalString(body.taskId, 'taskId', 100);
    const projectId = optionalString(body.projectId, 'projectId', 100);
    const isAllDay = optionalBoolean(body.isAllDay, 'isAllDay') ?? false;

    // Isolation: referenced records must belong to this tenant
    if (!referenceExists(db, session.tenantId, 'spaces', spaceId)) notFound('Space');
    if (taskId !== undefined && !referenceExists(db, session.tenantId, 'tasks', taskId)) notFound('Task');
    if (projectId !== undefined && !referenceExists(db, session.tenantId, 'projects', projectId)) {
      notFound('Project');
    }

    const eventId = `ev_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const defaultColor =
      eventType === 'daily_plan_block' ? '#10b981' :
      eventType === 'habit' ? '#a855f7' :
      eventType === 'meeting' ? '#f59e0b' : '#3b82f6';
    const color = optionalString(body.color, 'color', 30) ?? defaultColor;

    db.prepare(`
      INSERT INTO calendar_events (
        id, tenant_id, space_id, title, description, start_time, end_time, is_all_day, event_type, task_id, project_id, color
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      eventId,
      session.tenantId,
      spaceId,
      title,
      description,
      startTime,
      endTime,
      isAllDay ? 1 : 0,
      eventType,
      taskId ?? null,
      projectId ?? null,
      color
    );

    const event = db.prepare('SELECT * FROM calendar_events WHERE id = ? AND tenant_id = ?').get(eventId, session.tenantId);
    return ok({ event }, 201);
  } catch (err) {
    return routeError(err);
  }
});

export const PUT = withApiLogging(async function PUT(request: Request) {
  try {
    const session = getCurrentSession();
    const db = getDb();
    const body = await readBody(request);

    const id = requiredString(body.id, 'id', 100);
    const existing = db
      .prepare('SELECT id, start_time, end_time FROM calendar_events WHERE id = ? AND tenant_id = ?')
      .get(id, session.tenantId) as CalendarEventRow | undefined;
    if (!existing) notFound('Event');

    const title = optionalString(body.title, 'title', 500);
    const startTime = optionalISODateTime(body.startTime, 'startTime');
    const endTime = optionalISODateTime(body.endTime, 'endTime');
    const eventType = optionalEnum(body.eventType, 'eventType', EVENT_TYPES);
    const taskId = optionalString(body.taskId, 'taskId', 100);
    const projectId = optionalString(body.projectId, 'projectId', 100);
    const color = optionalString(body.color, 'color', 30);

    const effStart = startTime ?? existing.start_time;
    const effEnd = endTime ?? existing.end_time;
    if (effEnd < effStart) {
      throw new FieldError('endTime must not precede startTime');
    }

    if (taskId !== undefined && !referenceExists(db, session.tenantId, 'tasks', taskId)) notFound('Task');
    if (projectId !== undefined && !referenceExists(db, session.tenantId, 'projects', projectId)) {
      notFound('Project');
    }

    db.prepare(`
      UPDATE calendar_events
      SET 
        title = coalesce(?, title),
        start_time = coalesce(?, start_time),
        end_time = coalesce(?, end_time),
        event_type = coalesce(?, event_type),
        task_id = coalesce(?, task_id),
        project_id = coalesce(?, project_id),
        color = coalesce(?, color),
        updated_at = datetime('now')
      WHERE id = ? AND tenant_id = ?
    `).run(
      title ?? null,
      startTime ?? null,
      endTime ?? null,
      eventType ?? null,
      taskId ?? null,
      projectId ?? null,
      color ?? null,
      id,
      session.tenantId
    );

    const updated = db.prepare('SELECT * FROM calendar_events WHERE id = ? AND tenant_id = ?').get(id, session.tenantId);
    return ok({ event: updated });
  } catch (err) {
    return routeError(err);
  }
});

export const DELETE = withApiLogging(async function DELETE(request: Request) {
  try {
    const session = getCurrentSession();
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      throw new FieldError('Event ID is required');
    }

    const result = db.prepare('DELETE FROM calendar_events WHERE id = ? AND tenant_id = ?').run(id, session.tenantId);
    if (result.changes === 0) notFound('Event');

    return ok({ success: true });
  } catch (err) {
    return routeError(err);
  }
});
