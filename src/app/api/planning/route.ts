import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';
import { generateDailyPlanProposal } from '@/lib/productivity/engine';
import { getPlanningContext } from '@/lib/productivity/planner';
import { todayISO } from "@/lib/time";
import {isISODateString, referenceExists, readJson } from "@/lib/db/validate";

export async function GET(request: Request) {
  try {
    const session = getCurrentSession();
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date') || todayISO();

    const proposal = generateDailyPlanProposal(db, session.tenantId, date);
    const context = getPlanningContext(db, session.tenantId, date);

    // Check if an approved daily plan already exists in daily_plans
    const approvedPlan = db.prepare(`
      SELECT * FROM daily_plans 
      WHERE tenant_id = ? AND plan_date = ? 
      ORDER BY revision DESC LIMIT 1
    `).get(session.tenantId, date) as any;

    let planItems: any[] = [];
    if (approvedPlan) {
      planItems = db.prepare(`
        SELECT * FROM daily_plan_items 
        WHERE tenant_id = ? AND plan_id = ? 
        ORDER BY sort_order ASC
      `).all(session.tenantId, approvedPlan.id);
    }

    return NextResponse.json({
      proposal,
      context,
      approvedPlan: approvedPlan ? { ...approvedPlan, items: planItems } : null,
      missedTasks: context.missedTasks,
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

    const { targetDate, timeBlocks } = body;
    if (!Array.isArray(timeBlocks)) {
      return NextResponse.json({ error: 'timeBlocks array is required' }, { status: 400 });
    }
    if (!isISODateString(targetDate || todayISO())) {
      return NextResponse.json({ error: 'targetDate must be in YYYY-MM-DD format' }, { status: 400 });
    }

    for (const block of timeBlocks) {
      if (!block || typeof block !== 'object' || !block.title || typeof block.startTime !== 'string' || typeof block.endTime !== 'string') {
        return NextResponse.json({ error: 'Each time block needs title, startTime and endTime' }, { status: 400 });
      }
      if (!/^\d{2}:\d{2}$/.test(block.startTime) || !/^\d{2}:\d{2}$/.test(block.endTime)) {
        return NextResponse.json({ error: 'Block startTime and endTime must be HH:mm strings' }, { status: 400 });
      }
      if (block.endTime <= block.startTime) {
        return NextResponse.json({ error: `Block "${block.title}" endTime must be after startTime` }, { status: 400 });
      }
      if (block.taskId && !referenceExists(db, session.tenantId, 'tasks', block.taskId)) {
        return NextResponse.json({ error: `Task not found: ${block.taskId}` }, { status: 404 });
      }
    }

    db.transaction(() => {
      const insertEvent = db.prepare(`
        INSERT INTO calendar_events (
          id, tenant_id, title, start_time, end_time, event_type, task_id, color
        ) VALUES (?, ?, ?, ?, ?, 'time_block', ?, '#6366f1')
      `);

      for (const block of timeBlocks) {
        const eventId = `ev_plan_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        insertEvent.run(
          eventId,
          session.tenantId,
          block.title,
          block.startTime,
          block.endTime,
          block.taskId || null
        );

        // Update task status to 'next' or scheduled
        if (block.taskId) {
          db.prepare(`
            UPDATE tasks 
            SET status = CASE WHEN status = 'inbox' THEN 'next' ELSE status END,
                due_date = coalesce(due_date, ?)
            WHERE id = ? AND tenant_id = ?
          `).run(targetDate, block.taskId, session.tenantId);
        }
      }
    })();

    return NextResponse.json({ success: true, count: timeBlocks.length });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
