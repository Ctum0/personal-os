import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';

export async function GET() {
  try {
    const session = getCurrentSession();
    const db = getDb();

    const sessions = db.prepare(`
      SELECT f.*, t.title as task_title, p.name as project_name
      FROM focus_sessions f
      LEFT JOIN tasks t ON f.task_id = t.id
      LEFT JOIN projects p ON f.project_id = p.id
      WHERE f.tenant_id = ?
      ORDER BY f.created_at DESC
      LIMIT 20
    `).all(session.tenantId);

    return NextResponse.json({ sessions });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = getCurrentSession();
    const db = getDb();
    const body = await request.json();

    const id = `foc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const plannedDuration = body.plannedDuration || 25;
    const actualDuration = body.actualDuration || plannedDuration;
    const taskId = body.taskId || null;
    const projectId = body.projectId || null;
    const notes = body.notes || null;
    const startedAt = body.startedAt || new Date().toISOString();
    const endedAt = body.endedAt || new Date().toISOString();

    db.prepare(`
      INSERT INTO focus_sessions (
        id, tenant_id, task_id, project_id, planned_duration, actual_duration,
        status, notes, interruptions_count, started_at, ended_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'completed', ?, 0, ?, ?)
    `).run(
      id,
      session.tenantId,
      taskId,
      projectId,
      plannedDuration,
      actualDuration,
      notes,
      startedAt,
      endedAt
    );

    // If linked to a task, increment task's actual duration
    if (taskId) {
      db.prepare(`
        UPDATE tasks 
        SET actual_duration = coalesce(actual_duration, 0) + ?,
            updated_at = datetime('now')
        WHERE id = ? AND tenant_id = ?
      `).run(actualDuration, taskId, session.tenantId);
    }

    const created = db.prepare('SELECT * FROM focus_sessions WHERE id = ?').get(id);
    return NextResponse.json({ session: created }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
