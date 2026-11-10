import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';
import { readJson } from '@/lib/db/validate';

export async function GET(request: Request) {
  try {
    const session = getCurrentSession();
    const db = getDb();

    // Bounded history window (non-breaking, defaults to ~30 days).
    const { searchParams } = new URL(request.url);
    const daysParam = searchParams.get('days') ?? '30';
    let days = Number(daysParam);
    if (!Number.isFinite(days) || !Number.isInteger(days) || days < 1) days = 30;
    days = Math.min(days, 365); // sanity cap

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

    return NextResponse.json({ sessions, days, startedAfter, limit: 200 });
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

    const id = `foc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const plannedDuration = Number(body.plannedDuration !== undefined ? body.plannedDuration : 25);
    const actualDuration = Number(body.actualDuration !== undefined ? body.actualDuration : plannedDuration);
    if (isNaN(plannedDuration) || plannedDuration < 0 || isNaN(actualDuration) || actualDuration < 0) {
      return NextResponse.json({ error: 'plannedDuration and actualDuration must be non-negative numbers' }, { status: 400 });
    }

    const taskId = body.taskId || null;
    const projectId = body.projectId || null;
    const notes = body.notes || null;
    // Accept `interruptions` (or `interruptionsCount`): client-reported interruption
    // tally. Non-negative integer; junk falls back to 0 rather than failing a session.
    let interruptions = 0;
    const rawInterruptions = body.interruptions ?? body.interruptionsCount;
    if (rawInterruptions !== undefined && rawInterruptions !== null && rawInterruptions !== '') {
      const n = Number(rawInterruptions);
      if (Number.isFinite(n) && Number.isInteger(n) && n >= 0) {
        interruptions = Math.min(n, 1000); // sanity cap
      } else {
        return NextResponse.json({ error: 'interruptions must be a non-negative integer' }, { status: 400 });
      }
    }
    const startedAt = body.startedAt || new Date().toISOString();
    const endedAt = body.endedAt || new Date().toISOString();

    if (taskId) {
      const task = db.prepare('SELECT id FROM tasks WHERE id = ? AND tenant_id = ?').get(taskId, session.tenantId);
      if (!task) {
        return NextResponse.json({ error: 'Task not found' }, { status: 404 });
      }
    }

    if (projectId) {
      const proj = db.prepare('SELECT id FROM projects WHERE id = ? AND tenant_id = ?').get(projectId, session.tenantId);
      if (!proj) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 });
      }
    }

    db.transaction(() => {
      db.prepare(`
        INSERT INTO focus_sessions (
          id, tenant_id, task_id, project_id, planned_duration, actual_duration,
          status, notes, interruptions_count, started_at, ended_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'completed', ?, ?, ?, ?)
      `).run(
        id,
        session.tenantId,
        taskId,
        projectId,
        plannedDuration,
        actualDuration,
        notes,
        interruptions,
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
    })();

    const created = db.prepare('SELECT * FROM focus_sessions WHERE id = ? AND tenant_id = ?').get(id, session.tenantId);
    return NextResponse.json({ session: created }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
