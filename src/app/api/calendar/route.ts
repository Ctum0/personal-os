import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';
import { QUARANTINED_STATUS } from '@/lib/db/visibility';
import {referenceExists, isISODateString, isISODateTimeString, readJson } from "@/lib/db/validate";

/** Quarantined-task isolation: calendar blocks linked to quarantined tasks are hidden. */
const NOT_QUARANTINED_TASK = `
  AND NOT EXISTS (
    SELECT 1 FROM tasks qt WHERE qt.id = calendar_events.task_id AND qt.status = '${QUARANTINED_STATUS}'
  )
`;

export async function GET(request: Request) {
  try {
    const session = getCurrentSession();
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const includeQuarantined = searchParams.get('includeQuarantined') === '1';

    if ((startDate && !isISODateString(startDate)) || (endDate && !isISODateString(endDate))) {
      return NextResponse.json({ error: 'startDate and endDate must be in YYYY-MM-DD format' }, { status: 400 });
    }

    let query = `SELECT * FROM calendar_events WHERE tenant_id = ? ${includeQuarantined ? '' : NOT_QUARANTINED_TASK}`;
    const params: any[] = [session.tenantId];

    if (startDate && endDate) {
      query += ' AND date(start_time) >= ? AND date(end_time) <= ?';
      params.push(startDate, endDate);
    }
    query += ' ORDER BY start_time ASC';

    const events = db.prepare(query).all(...params);
    return NextResponse.json({ events });
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

    if (!body.title || !body.startTime || !body.endTime) {
      return NextResponse.json({ error: 'Title, startTime, and endTime are required' }, { status: 400 });
    }
    if (typeof body.title !== 'string' || !body.title.trim()) {
      return NextResponse.json({ error: 'Title must be a non-empty string' }, { status: 400 });
    }
    if (!isISODateTimeString(body.startTime) || !isISODateTimeString(body.endTime)) {
      return NextResponse.json({ error: 'startTime and endTime must be valid datetime strings (YYYY-MM-DD or ISO 8601)' }, { status: 400 });
    }
    if (body.endTime < body.startTime) {
      return NextResponse.json({ error: 'endTime must not precede startTime' }, { status: 400 });
    }
    if (body.eventType && !['time_block', 'daily_plan_block', 'habit', 'meeting'].includes(body.eventType)) {
      return NextResponse.json({ error: `Invalid eventType. Must be one of: time_block, daily_plan_block, habit, meeting` }, { status: 400 });
    }

    // Isolation: referenced records must belong to this tenant
    if (body.spaceId !== undefined && body.spaceId !== null && !referenceExists(db, session.tenantId, 'spaces', body.spaceId)) {
      return NextResponse.json({ error: 'Space not found' }, { status: 404 });
    }
    if (body.taskId !== undefined && body.taskId !== null && !referenceExists(db, session.tenantId, 'tasks', body.taskId)) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }
    if (body.projectId !== undefined && body.projectId !== null && !referenceExists(db, session.tenantId, 'projects', body.projectId)) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const eventId = `ev_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const eventType = body.eventType || 'time_block';
    const defaultColor =
      eventType === 'daily_plan_block' ? '#10b981' :
      eventType === 'habit' ? '#a855f7' :
      eventType === 'meeting' ? '#f59e0b' : '#3b82f6';
    const color = body.color || defaultColor;

    db.prepare(`
      INSERT INTO calendar_events (
        id, tenant_id, space_id, title, description, start_time, end_time, is_all_day, event_type, task_id, project_id, color
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      eventId,
      session.tenantId,
      body.spaceId || 'space_personal',
      body.title.trim(),
      body.description || '',
      body.startTime,
      body.endTime,
      body.isAllDay ? 1 : 0,
      eventType,
      body.taskId || null,
      body.projectId || null,
      color
    );

    const event = db.prepare('SELECT * FROM calendar_events WHERE id = ? AND tenant_id = ?').get(eventId, session.tenantId);
    return NextResponse.json({ event }, { status: 201 });
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
      return NextResponse.json({ error: 'Event ID is required' }, { status: 400 });
    }

    const existing = db.prepare('SELECT * FROM calendar_events WHERE id = ? AND tenant_id = ?').get(body.id, session.tenantId);
    if (!existing) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    if (body.startTime !== undefined && !isISODateTimeString(body.startTime)) {
      return NextResponse.json({ error: 'startTime must be a valid datetime string' }, { status: 400 });
    }
    if (body.endTime !== undefined && !isISODateTimeString(body.endTime)) {
      return NextResponse.json({ error: 'endTime must be a valid datetime string' }, { status: 400 });
    }
    const effStart = body.startTime !== undefined ? body.startTime : (existing as any).start_time;
    const effEnd = body.endTime !== undefined ? body.endTime : (existing as any).end_time;
    if (effEnd < effStart) {
      return NextResponse.json({ error: 'endTime must not precede startTime' }, { status: 400 });
    }
    if (body.eventType !== undefined && !['time_block', 'daily_plan_block', 'habit', 'meeting'].includes(body.eventType)) {
      return NextResponse.json({ error: `Invalid eventType. Must be one of: time_block, daily_plan_block, habit, meeting` }, { status: 400 });
    }
    if (body.taskId !== undefined && body.taskId !== null && !referenceExists(db, session.tenantId, 'tasks', body.taskId)) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }
    if (body.projectId !== undefined && body.projectId !== null && !referenceExists(db, session.tenantId, 'projects', body.projectId)) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
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
      body.title,
      body.startTime,
      body.endTime,
      body.eventType,
      body.taskId,
      body.projectId,
      body.color,
      body.id,
      session.tenantId
    );

    const updated = db.prepare('SELECT * FROM calendar_events WHERE id = ? AND tenant_id = ?').get(body.id, session.tenantId);
    return NextResponse.json({ event: updated });
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
      return NextResponse.json({ error: 'Event ID is required' }, { status: 400 });
    }

    db.prepare('DELETE FROM calendar_events WHERE id = ? AND tenant_id = ?').run(id, session.tenantId);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
