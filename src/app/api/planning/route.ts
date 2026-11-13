import { getDb } from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';
import { generateDailyPlanProposal } from '@/lib/productivity/engine';
import { getPlanningContext } from '@/lib/productivity/planner';
import { todayISO } from '@/lib/time';
import { withApiLogging } from '@/lib/api/log';
import { FieldError, ok, notFound, readBody, routeError } from '@/lib/api/http';
import {
  optionalISODate,
  optionalString,
  requiredArray,
  requiredString,
  requiredTimeOfDay,
} from '@/lib/api/fields';
import { referenceExists } from '@/lib/db/validate';

interface ApprovedPlanRow {
  id: string;
  [column: string]: unknown;
}

interface TimeBlock {
  title: string;
  startTime: string;
  endTime: string;
  taskId?: string;
}

export const GET = withApiLogging(async function GET(request: Request) {
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
    `).get(session.tenantId, date) as ApprovedPlanRow | undefined;

    let planItems: unknown[] = [];
    if (approvedPlan) {
      planItems = db.prepare(`
        SELECT * FROM daily_plan_items
        WHERE tenant_id = ? AND plan_id = ?
        ORDER BY sort_order ASC
      `).all(session.tenantId, approvedPlan.id);
    }

    return ok({
      proposal,
      context,
      approvedPlan: approvedPlan ? { ...approvedPlan, items: planItems } : null,
      missedTasks: context.missedTasks,
    });
  } catch (err) {
    return routeError(err);
  }
});

export const POST = withApiLogging(async function POST(request: Request) {
  try {
    const session = getCurrentSession();
    const db = getDb();
    const body = await readBody(request);

    const targetDate = optionalISODate(body.targetDate, 'targetDate') ?? todayISO();
    const rawBlocks = requiredArray(body.timeBlocks, 'timeBlocks', 100);

    const timeBlocks: TimeBlock[] = rawBlocks.map((raw, index) => {
      if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
        throw new FieldError(`timeBlocks[${index}] must be an object`);
      }
      const block = raw as Record<string, unknown>;
      const title = requiredString(block.title, `timeBlocks[${index}].title`, 500);
      const startTime = requiredTimeOfDay(block.startTime, `timeBlocks[${index}].startTime`);
      const endTime = requiredTimeOfDay(block.endTime, `timeBlocks[${index}].endTime`);
      const taskId = optionalString(block.taskId, `timeBlocks[${index}].taskId`, 100);

      if (endTime <= startTime) {
        throw new FieldError(`timeBlocks[${index}] endTime must be after startTime`);
      }
      if (taskId !== undefined && !referenceExists(db, session.tenantId, 'tasks', taskId)) {
        notFound(`Task ${taskId}`);
      }

      return { title, startTime, endTime, taskId };
    });

    db.transaction(() => {
      const insertEvent = db.prepare(`
        INSERT INTO calendar_events (
          id, tenant_id, title, start_time, end_time, event_type, task_id, color
        ) VALUES (?, ?, ?, ?, ?, 'time_block', ?, '#6366f1')
      `);

      for (const block of timeBlocks) {
        const eventId = `ev_plan_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        // calendar_events.start_time holds a full timestamp; a bare HH:mm is
        // parsed as an instant by the calendar, so the date is prefixed here.
        insertEvent.run(
          eventId,
          session.tenantId,
          block.title,
          `${targetDate}T${block.startTime}:00`,
          `${targetDate}T${block.endTime}:00`,
          block.taskId ?? null
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

    return ok({ success: true, count: timeBlocks.length });
  } catch (err) {
    return routeError(err);
  }
});
