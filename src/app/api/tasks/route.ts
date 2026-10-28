import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';

export async function GET(request: Request) {
  try {
    const session = getCurrentSession();
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const spaceId = searchParams.get('spaceId');
    const status = searchParams.get('status');
    const priority = searchParams.get('priority');
    const search = searchParams.get('search');

    let query = `
      SELECT t.*, p.name as project_name, p.color as project_color, s.name as space_name
      FROM tasks t
      LEFT JOIN projects p ON t.project_id = p.id
      LEFT JOIN spaces s ON t.space_id = s.id
      WHERE t.tenant_id = ? AND t.is_deleted = 0
    `;
    const params: any[] = [session.tenantId];

    if (spaceId && spaceId !== 'all') {
      query += ' AND t.space_id = ?';
      params.push(spaceId);
    }
    if (status) {
      query += ' AND t.status = ?';
      params.push(status);
    }
    if (priority) {
      query += ' AND t.priority = ?';
      params.push(priority);
    }
    if (search) {
      query += ' AND (t.title LIKE ? OR t.description LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    query += `
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
    `;

    const tasks = db.prepare(query).all(...params);
    return NextResponse.json({ tasks });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = getCurrentSession();
    const db = getDb();
    const body = await request.json();

    if (!body.title || !body.title.trim()) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
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

    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
    return NextResponse.json({ task }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const session = getCurrentSession();
    const db = getDb();
    const body = await request.json();

    if (!body.id) {
      return NextResponse.json({ error: 'Task ID is required' }, { status: 400 });
    }

    const existing = db.prepare('SELECT * FROM tasks WHERE id = ? AND tenant_id = ?').get(body.id, session.tenantId) as any;
    if (!existing) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
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

    const updated = db.prepare('SELECT * FROM tasks WHERE id = ?').get(body.id);
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
