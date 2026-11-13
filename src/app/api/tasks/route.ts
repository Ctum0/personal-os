import type Database from 'better-sqlite3';
import { getDb } from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';
import { taskVisibleClause } from '@/lib/db/visibility';
import { withApiLogging } from '@/lib/api/log';
import { ok, readBody, routeError, notFound } from '@/lib/api/http';
import {
  optionalEnum,
  optionalInt,
  optionalISODate,
  optionalString,
  optionalTimeOfDay,
  requiredString,
} from '@/lib/api/fields';
import { referenceExists } from '@/lib/db/validate';

const CREATE_STATUSES = [
  'inbox', 'next', 'todo', 'in_progress', 'done', 'completed', 'blocked', 'cancelled', 'waiting',
] as const;
// 'quarantined' is accepted ONLY on update, to enable administrative
// reclassification of records (in and out of quarantine). POST deliberately
// refuses to create records classified as quarantined.
const UPDATE_STATUSES = [...CREATE_STATUSES, 'quarantined'] as const;
const PRIORITIES = ['urgent', 'high', 'normal', 'low', 'critical', 'optional'] as const;

const DEFAULT_SPACE_ID = 'space_personal';

function assertReferences(
  db: Database.Database,
  tenantId: string,
  refs: { spaceId?: string; projectId?: string; goalId?: string }
): void {
  if (refs.spaceId !== undefined && !referenceExists(db, tenantId, 'spaces', refs.spaceId)) {
    notFound('Space');
  }
  if (refs.projectId !== undefined && !referenceExists(db, tenantId, 'projects', refs.projectId)) {
    notFound('Project');
  }
  if (refs.goalId !== undefined && !referenceExists(db, tenantId, 'goals', refs.goalId)) {
    notFound('Goal');
  }
}

export const GET = withApiLogging(async function GET(request: Request) {
  try {
    const session = getCurrentSession();
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const spaceId = searchParams.get('spaceId');
    const status = searchParams.get('status');
    const priority = searchParams.get('priority');
    const search = searchParams.get('search');
    // Quarantine visibility policy: quarantined records are excluded from all
    // operational listings unless explicitly requested (administrative recovery).
    const includeQuarantined = searchParams.get('includeQuarantined') === '1';

    let whereSql = `
      WHERE t.tenant_id = ? AND t.is_deleted = 0
        ${includeQuarantined ? '' : `AND ${taskVisibleClause('t')}`}
    `;
    const params: Array<string | number> = [session.tenantId];

    if (spaceId && spaceId !== 'all') {
      whereSql += ' AND t.space_id = ?';
      params.push(spaceId);
    }
    if (status) {
      whereSql += ' AND t.status = ?';
      params.push(status);
    }
    if (priority) {
      whereSql += ' AND t.priority = ?';
      params.push(priority);
    }
    if (search) {
      whereSql += ' AND (t.title LIKE ? OR t.description LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    const rawLimit = Number.parseInt(searchParams.get('limit') || '', 10);
    const rawOffset = Number.parseInt(searchParams.get('offset') || '', 10);
    const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(rawLimit, 1000)) : 1000;
    const offset = Number.isFinite(rawOffset) ? Math.max(0, rawOffset) : 0;

    const total = (db.prepare(`SELECT COUNT(*) AS c FROM tasks t ${whereSql}`).get(...params) as { c: number }).c;
    const tasks = db.prepare(`
      SELECT t.*, p.name as project_name, p.color as project_color, s.name as space_name
      FROM tasks t
      LEFT JOIN projects p ON t.project_id = p.id
      LEFT JOIN spaces s ON t.space_id = s.id
      ${whereSql}
      ORDER BY
        CASE t.priority
          WHEN 'urgent' THEN 1
          WHEN 'high' THEN 2
          WHEN 'normal' THEN 3
          ELSE 4
        END ASC,
        t.due_date ASC,
        t.sort_order ASC,
        t.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    return ok({ tasks, total, limit, offset, hasMore: offset + limit < total });
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
    const status = optionalEnum(body.status, 'status', CREATE_STATUSES) ?? 'inbox';
    const priority = optionalEnum(body.priority, 'priority', PRIORITIES) ?? 'normal';
    const dueDate = optionalISODate(body.dueDate, 'dueDate');
    const dueTime = optionalTimeOfDay(body.dueTime, 'dueTime');
    const estimatedDuration = optionalInt(body.estimatedDuration, 'estimatedDuration', 0, 100_000);
    const spaceId = optionalString(body.spaceId, 'spaceId', 100) ?? DEFAULT_SPACE_ID;
    const projectId = optionalString(body.projectId, 'projectId', 100);
    const goalId = optionalString(body.goalId, 'goalId', 100);
    const description = optionalString(body.description, 'description', 20_000) ?? '';

    assertReferences(db, session.tenantId, { spaceId, projectId, goalId });

    const taskId = `task_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    db.prepare(`
      INSERT INTO tasks (
        id, tenant_id, space_id, project_id, goal_id, title, description, status, priority, due_date, due_time, estimated_duration
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      taskId,
      session.tenantId,
      spaceId,
      projectId ?? null,
      goalId ?? null,
      title,
      description,
      status,
      priority,
      dueDate ?? null,
      dueTime ?? null,
      estimatedDuration ?? 0
    );

    db.prepare(`
      INSERT INTO audit_events (id, tenant_id, actor_id, domain, action, entity_type, entity_id, changes)
      VALUES (?, ?, ?, 'productivity', 'create_task', 'task', ?, ?)
    `).run(`aud_${taskId}`, session.tenantId, session.userId, taskId, JSON.stringify(body));

    const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND tenant_id = ?').get(taskId, session.tenantId);
    return ok({ task }, 201);
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
    const existing = db.prepare('SELECT * FROM tasks WHERE id = ? AND tenant_id = ?').get(id, session.tenantId) as {
      id: string;
      status: string;
      completion_at: string | null;
      due_date: string | null;
      project_id: string | null;
      space_id: string | null;
    } | undefined;
    if (!existing) notFound('Task');

    const status = optionalEnum(body.status, 'status', UPDATE_STATUSES);
    const priority = optionalEnum(body.priority, 'priority', PRIORITIES);
    const title = optionalString(body.title, 'title', 500);
    const description = optionalString(body.description, 'description', 20_000);
    const dueDate = optionalISODate(body.dueDate, 'dueDate');
    const estimatedDuration = optionalInt(body.estimatedDuration, 'estimatedDuration', 0, 100_000);
    const actualDuration = optionalInt(body.actualDuration, 'actualDuration', 0, 100_000);
    const spaceId = optionalString(body.spaceId, 'spaceId', 100);
    const projectId = optionalString(body.projectId, 'projectId', 100);

    assertReferences(db, session.tenantId, { spaceId, projectId });

    // Completion timestamp follows the status transition, not the payload: it is
    // stamped once on entry to 'completed' and cleared when leaving it.
    let completionAt = existing.completion_at;
    if (status === 'completed' && existing.status !== 'completed') {
      completionAt = new Date().toISOString();
    } else if (status !== undefined && status !== 'completed') {
      completionAt = null;
    }

    // `dueDate: null` clears the date; absent keeps the stored value.
    const nextDueDate = body.dueDate === null || body.dueDate === '' ? null : (dueDate ?? existing.due_date);

    db.prepare(`
      UPDATE tasks
      SET
        title = coalesce(?, title),
        description = coalesce(?, description),
        status = coalesce(?, status),
        priority = coalesce(?, priority),
        due_date = ?,
        estimated_duration = coalesce(?, estimated_duration),
        actual_duration = coalesce(?, actual_duration),
        space_id = coalesce(?, space_id),
        project_id = ?,
        completion_at = ?,
        updated_at = datetime('now')
      WHERE id = ? AND tenant_id = ?
    `).run(
      title ?? null,
      description ?? null,
      status ?? null,
      priority ?? null,
      nextDueDate,
      estimatedDuration ?? null,
      actualDuration ?? null,
      spaceId ?? null,
      body.projectId === undefined ? existing.project_id : (projectId ?? null),
      completionAt,
      id,
      session.tenantId
    );

    const updated = db.prepare('SELECT * FROM tasks WHERE id = ? AND tenant_id = ?').get(id, session.tenantId);
    return ok({ task: updated });
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
      return ok({ error: 'Task ID is required' }, 400);
    }

    const result = db.prepare(
      "UPDATE tasks SET is_deleted = 1, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?"
    ).run(id, session.tenantId);
    if (result.changes === 0) notFound('Task');

    return ok({ success: true });
  } catch (err) {
    return routeError(err);
  }
});
