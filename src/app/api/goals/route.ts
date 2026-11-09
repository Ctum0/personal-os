import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';
import { calculateGoalProgress } from '@/lib/productivity/engine';

export async function GET(request: Request) {
  try {
    const session = getCurrentSession();
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const spaceId = searchParams.get('spaceId');

    let query = 'SELECT * FROM goals WHERE tenant_id = ?';
    const params: any[] = [session.tenantId];

    if (spaceId && spaceId !== 'all') {
      query += ' AND space_id = ?';
      params.push(spaceId);
    }
    query += ' ORDER BY status ASC, deadline ASC, created_at DESC';

    const rawGoals = db.prepare(query).all(...params) as any[];

    const goals = rawGoals.map(g => {
      const progressInfo = calculateGoalProgress(db, session.tenantId, g.id);
      const logs = db.prepare(`
        SELECT * FROM goal_progress_logs 
        WHERE tenant_id = ? AND goal_id = ? 
        ORDER BY logged_at DESC LIMIT 10
      `).all(session.tenantId, g.id);

      return {
        ...g,
        progress: progressInfo?.progressPercentage || 0,
        progressDetails: progressInfo,
        recentLogs: logs,
      };
    });

    return NextResponse.json({ goals });
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
      return NextResponse.json({ error: 'Goal title is required' }, { status: 400 });
    }

    const goalId = `goal_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const startVal = body.startValue !== undefined ? Number(body.startValue) : 0;
    const targetVal = body.targetValue !== undefined ? Number(body.targetValue) : 100;
    const currentVal = body.currentValue !== undefined ? Number(body.currentValue) : startVal;
    const direction = body.direction || 'ascending';
    const type = body.type || 'numeric';
    const unit = body.unit || '%';
    const color = body.color || '#10b981';

    db.transaction(() => {
      db.prepare(`
        INSERT INTO goals (
          id, tenant_id, space_id, title, description, type, start_value, target_value, current_value, unit, direction, progress_method, start_date, deadline, cadence, status, linked_savings_goal_id, color
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        goalId,
        session.tenantId,
        body.spaceId || 'space_personal',
        body.title.trim(),
        body.description || '',
        type,
        startVal,
        targetVal,
        currentVal,
        unit,
        direction,
        body.progressMethod || 'log_latest',
        body.startDate || null,
        body.deadline || null,
        body.cadence || 'quarterly',
        body.status || 'in_progress',
        body.linkedSavingsGoalId || null,
        color
      );

      // Initial progress log
      db.prepare(`
        INSERT INTO goal_progress_logs (id, tenant_id, goal_id, value, delta, note, source)
        VALUES (?, ?, ?, ?, ?, 'Initial measurement', 'manual')
      `).run(`gpl_${goalId}_0`, session.tenantId, goalId, currentVal, 0);
    })();

    const goal = db.prepare('SELECT * FROM goals WHERE id = ? AND tenant_id = ?').get(goalId, session.tenantId);
    return NextResponse.json({ goal }, { status: 201 });
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
      return NextResponse.json({ error: 'Goal ID is required' }, { status: 400 });
    }

    const existing = db.prepare('SELECT * FROM goals WHERE id = ? AND tenant_id = ?').get(body.id, session.tenantId) as any;
    if (!existing) {
      return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
    }

    db.transaction(() => {
      if (body.newLogValue !== undefined) {
        const val = Number(body.newLogValue);
        const delta = val - existing.current_value;
        db.prepare(`
          INSERT INTO goal_progress_logs (id, tenant_id, goal_id, value, delta, note, source)
          VALUES (?, ?, ?, ?, ?, ?, 'manual')
        `).run(`gpl_${body.id}_${Date.now()}`, session.tenantId, body.id, val, delta, body.note || 'Progress update');

        body.currentValue = val;
      }

      db.prepare(`
        UPDATE goals
        SET 
          title = coalesce(?, title),
          description = coalesce(?, description),
          current_value = coalesce(?, current_value),
          target_value = coalesce(?, target_value),
          status = coalesce(?, status),
          deadline = coalesce(?, deadline),
          color = coalesce(?, color),
          updated_at = datetime('now')
        WHERE id = ? AND tenant_id = ?
      `).run(
        body.title,
        body.description,
        body.currentValue,
        body.targetValue,
        body.status,
        body.deadline,
        body.color,
        body.id,
        session.tenantId
      );
    })();

    const updated = db.prepare('SELECT * FROM goals WHERE id = ? AND tenant_id = ?').get(body.id, session.tenantId);
    return NextResponse.json({ goal: updated });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
