import { getDb } from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';
import { withApiLogging } from '@/lib/api/log';
import { FieldError, notFound, ok, readBody, routeError } from '@/lib/api/http';
import { optionalISODateTime, optionalInt, optionalNumber, optionalString } from '@/lib/api/fields';
import { referenceExists } from '@/lib/db/validate';

/** Bounded history window: a client may narrow it, never widen it past a year. */
const DEFAULT_DAYS = 30;
const MAX_DAYS = 365;
const SESSION_LIMIT = 200;

export const GET = withApiLogging(async function GET(request: Request) {
  try {
    const session = getCurrentSession();
    const db = getDb();

    // Bounded history window. A junk `days` value falls back to the default and
    // an oversized one is clamped: this is a read knob, not a rejected field.
    const { searchParams } = new URL(request.url);
    const requestedDays = Number(searchParams.get('days') ?? DEFAULT_DAYS);
    const days = Number.isInteger(requestedDays) && requestedDays >= 1
      ? Math.min(requestedDays, MAX_DAYS)
      : DEFAULT_DAYS;

    const startedAfter = new Date(Date.now() - days * 86400000).toISOString();

    const sessions = db.prepare(`
      SELECT f.*, t.title as task_title, p.name as project_name
      FROM focus_sessions f
      LEFT JOIN tasks t ON f.task_id = t.id
      LEFT JOIN projects p ON f.project_id = p.id
      WHERE f.tenant_id = ? AND f.started_at >= ?
      ORDER BY f.started_at DESC
      LIMIT 200
    `).all(session.tenantId, startedAfter);

    return ok({ sessions, days, startedAfter, limit: SESSION_LIMIT });
  } catch (err) {
    return routeError(err);
  }
});

export const POST = withApiLogging(async function POST(request: Request) {
  try {
    const session = getCurrentSession();
    const db = getDb();
    const body = await readBody(request);

    const plannedDuration = optionalNumber(body.plannedDuration, 'plannedDuration') ?? 25;
    const actualDuration = optionalNumber(body.actualDuration, 'actualDuration') ?? plannedDuration;
    if (plannedDuration < 0 || actualDuration < 0) {
      throw new FieldError('plannedDuration and actualDuration must be non-negative numbers');
    }

    // Accept `interruptions` (or `interruptionsCount`): client-reported tally.
    // A non-negative integer, capped so a bogus value cannot skew a report.
    const interruptions = optionalInt(
      body.interruptions ?? body.interruptionsCount,
      'interruptions',
      0,
      1000
    ) ?? 0;

    const startedAt = optionalISODateTime(body.startedAt, 'startedAt') ?? new Date().toISOString();
    const endedAt = optionalISODateTime(body.endedAt, 'endedAt') ?? new Date().toISOString();
    const notes = optionalString(body.notes, 'notes', 4000) ?? null;
    const taskId = optionalString(body.taskId, 'taskId', 100);
    const projectId = optionalString(body.projectId, 'projectId', 100);

    if (taskId !== undefined && !referenceExists(db, session.tenantId, 'tasks', taskId)) notFound('Task');
    if (projectId !== undefined && !referenceExists(db, session.tenantId, 'projects', projectId)) notFound('Project');

    const id = `foc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    db.transaction(() => {
      db.prepare(`
        INSERT INTO focus_sessions (
          id, tenant_id, task_id, project_id, planned_duration, actual_duration,
          status, notes, interruptions_count, started_at, ended_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'completed', ?, ?, ?, ?)
      `).run(
        id,
        session.tenantId,
        taskId ?? null,
        projectId ?? null,
        plannedDuration,
        actualDuration,
        notes,
        interruptions,
        startedAt,
        endedAt
      );

      // If linked to a task, increment task's actual duration
      if (taskId !== undefined) {
        db.prepare(`
          UPDATE tasks 
          SET actual_duration = coalesce(actual_duration, 0) + ?,
              updated_at = datetime('now')
          WHERE id = ? AND tenant_id = ?
        `).run(actualDuration, taskId, session.tenantId);
      }
    })();

    const created = db.prepare('SELECT * FROM focus_sessions WHERE id = ? AND tenant_id = ?').get(id, session.tenantId);
    return ok({ session: created }, 201);
  } catch (err) {
    return routeError(err);
  }
});
