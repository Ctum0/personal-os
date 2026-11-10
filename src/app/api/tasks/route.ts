import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';
import { taskVisibleClause, isOperationallyVisibleTask } from '@/lib/db/visibility';
import {matchesEnum, isISODateString, referenceExists, readJson } from "@/lib/db/validate";

export async function GET(request: Request) {
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
    const params: any[] = [session.tenantId];

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

    // Pagination: SQL-side LIMIT/OFFSET over the same filtered query. The
    // default limit keeps existing callers (none send limit today) on
    // identical single-window output while capping very large datasets.
    const rawLimit = Number.parseInt(searchParams.get('limit') || '', 10);
    const rawOffset = Number.parseInt(searchParams.get('offset') || '', 10);
    const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(rawLimit, 1000)) : 1000;
    const offset = Number.isFinite(rawOffset) ? Math.max(0, rawOffset) : 0;

    const countSql = `SELECT COUNT(*) AS c FROM tasks t ${whereSql}`;
    const listQuery = `
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
    `;

    const total = (db.prepare(countSql).get(...params) as { c: number }).c;
    const tasks = db.prepare(listQuery).all(...params, limit, offset);

    return NextResponse.json({
      tasks,
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
    });
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

    if (!body.title || typeof body.title !== 'string' || !body.title.trim()) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    const validStatuses = ['inbox', 'next', 'todo', 'in_progress', 'done', 'completed', 'blocked', 'cancelled', 'waiting'];
    const validPriorities = ['urgent', 'high', 'normal', 'low', 'critical', 'optional'];

    if (body.status && !validStatuses.includes(body.status)) {
      return NextResponse.json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` }, { status: 400 });
    }
    if (body.priority && !validPriorities.includes(body.priority)) {
      return NextResponse.json({ error: `Invalid priority. Must be one of: ${validPriorities.join(', ')}` }, { status: 400 });
    }
    if (body.estimatedDuration !== undefined && (typeof body.estimatedDuration !== 'number' || body.estimatedDuration < 0 || isNaN(body.estimatedDuration))) {
      return NextResponse.json({ error: 'estimatedDuration must be a non-negative number' }, { status: 400 });
    }
    if (body.dueDate && !isISODateString(body.dueDate)) {
      return NextResponse.json({ error: 'dueDate must be in YYYY-MM-DD format' }, { status: 400 });
    }

    // Space / project / goal isolation: references must exist within the tenant,
    // otherwise a record from another space or tenant could be attached by id.
    if (body.spaceId !== undefined && body.spaceId !== null && body.spaceId !== '' && !referenceExists(db, session.tenantId, 'spaces', body.spaceId)) {
      return NextResponse.json({ error: 'Space not found' }, { status: 404 });
    }
    if (!referenceExists(db, session.tenantId, 'projects', body.projectId)) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }
    if (!referenceExists(db, session.tenantId, 'goals', body.goalId)) {
      return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
    }

    const taskId = `task_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const spaceId = body.spaceId || 'space_personal';
    const status = body.status || 'inbox';
    const priority = body.priority || 'normal';

    db.prepare(`
      INSERT INTO tasks (
        id, tenant_id, space_id, project_id, goal_id, title, description, status, priority, due_date, due_time, estimated_duration
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      taskId,
      session.tenantId,
      spaceId,
      body.projectId || null,
      body.goalId || null,
      body.title.trim(),
      body.description || '',
      status,
      priority,
      body.dueDate || null,
      body.dueTime || null,
      body.estimatedDuration || 0
    );

    // Audit event
    db.prepare(`
      INSERT INTO audit_events (id, tenant_id, actor_id, domain, action, entity_type, entity_id, changes)
      VALUES (?, ?, ?, 'productivity', 'create_task', 'task', ?, ?)
    `).run(`aud_${taskId}`, session.tenantId, session.userId, taskId, JSON.stringify(body));

    const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND tenant_id = ?').get(taskId, session.tenantId);
    return NextResponse.json({ task }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const session = getCurrentSession();
    const db = getDb();
    const parsedBody = await readJson(request);
    if ("error" in parsedBody) {
      return NextResponse.json({ error: parsedBody.error }, { status: parsedBody.status });
    }
    const body = parsedBody.data;

    if (!body.id) {
      return NextResponse.json({ error: 'Task ID is required' }, { status: 400 });
    }

    const existing = db.prepare('SELECT * FROM tasks WHERE id = ? AND tenant_id = ?').get(body.id, session.tenantId) as any;
    if (!existing) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // 'quarantined' is accepted ONLY on update, to enable administrative
    // reclassification of records (in and out of quarantine). POST deliberately
    // refuses to create records classified as quarantined.
    const validStatuses = ['inbox', 'next', 'todo', 'in_progress', 'done', 'completed', 'blocked', 'cancelled', 'waiting', 'quarantined'];
    const validPriorities = ['urgent', 'high', 'normal', 'low', 'critical', 'optional'];

    if (body.status && !validStatuses.includes(body.status)) {
      return NextResponse.json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` }, { status: 400 });
    }
    if (body.priority && !validPriorities.includes(body.priority)) {
      return NextResponse.json({ error: `Invalid priority. Must be one of: ${validPriorities.join(', ')}` }, { status: 400 });
    }
    if (body.estimatedDuration !== undefined && (typeof body.estimatedDuration !== 'number' || body.estimatedDuration < 0 || isNaN(body.estimatedDuration))) {
      return NextResponse.json({ error: 'estimatedDuration must be a non-negative number' }, { status: 400 });
    }
    if (body.actualDuration !== undefined && (typeof body.actualDuration !== 'number' || body.actualDuration < 0 || isNaN(body.actualDuration))) {
      return NextResponse.json({ error: 'actualDuration must be a non-negative number' }, { status: 400 });
    }
    if (body.dueDate !== undefined && body.dueDate !== null && body.dueDate !== '' && !isISODateString(body.dueDate)) {
      return NextResponse.json({ error: 'dueDate must be in YYYY-MM-DD format' }, { status: 400 });
    }

    // Space isolation: moved task must land in a space of the same tenant.
    if (body.spaceId !== undefined && body.spaceId !== null && body.spaceId !== '' && !referenceExists(db, session.tenantId, 'spaces', body.spaceId)) {
      return NextResponse.json({ error: 'Space not found' }, { status: 404 });
    }
    if (body.projectId !== undefined && body.projectId !== null && !referenceExists(db, session.tenantId, 'projects', body.projectId)) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    let completionAt = existing.completion_at;
    if (body.status === 'completed' && existing.status !== 'completed') {
      completionAt = new Date().toISOString();
    } else if (body.status && body.status !== 'completed') {
      completionAt = null;
    }

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
      body.title !== undefined ? body.title : null,
      body.description !== undefined ? body.description : null,
      body.status !== undefined ? body.status : null,
      body.priority !== undefined ? body.priority : null,
      body.dueDate !== undefined ? body.dueDate : existing.due_date,
      body.estimatedDuration !== undefined ? body.estimatedDuration : null,
      body.actualDuration !== undefined ? body.actualDuration : null,
      body.spaceId !== undefined ? body.spaceId : null,
      body.projectId !== undefined ? body.projectId : existing.project_id,
      completionAt,
      body.id,
      session.tenantId
    );

    const updated = db.prepare('SELECT * FROM tasks WHERE id = ? AND tenant_id = ?').get(body.id, session.tenantId);
    return NextResponse.json({ task: updated });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const session = getCurrentSession();
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Task ID is required' }, { status: 400 });
    }

    // Soft delete per spec
    db.prepare('UPDATE tasks SET is_deleted = 1, updated_at = datetime("now") WHERE id = ? AND tenant_id = ?').run(id, session.tenantId);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
