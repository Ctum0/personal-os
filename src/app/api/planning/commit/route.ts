import { getDb } from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';
import {
  commitApprovedDailyPlan,
  type DailyPlanProposal,
  type ScheduledTimeBlock,
} from '@/lib/productivity/planner';
import { withApiLogging } from '@/lib/api/log';
import { FieldError, ok, readBody, routeError } from '@/lib/api/http';
import { requiredArray, requiredISODate, requiredString, requiredTimeOfDay } from '@/lib/api/fields';

export const POST = withApiLogging(async function POST(request: Request) {
  try {
    const session = getCurrentSession();
    const db = getDb();
    const body = await readBody(request);

    if (typeof body.plan !== 'object' || body.plan === null || Array.isArray(body.plan)) {
      throw new FieldError('Valid DailyPlanProposal is required');
    }
    const plan = body.plan as DailyPlanProposal;

    const targetDate = requiredISODate(plan.targetDate, 'plan.targetDate');
    const scheduledItems = requiredArray<ScheduledTimeBlock>(plan.scheduledItems, 'plan.scheduledItems', 200);

    scheduledItems.forEach((item, index) => {
      if (typeof item !== 'object' || item === null) {
        throw new FieldError(`plan.scheduledItems[${index}] must be an object`);
      }
      requiredString(item.title, `plan.scheduledItems[${index}].title`, 500);
      const startTime = requiredTimeOfDay(item.startTime, `plan.scheduledItems[${index}].startTime`);
      const endTime = requiredTimeOfDay(item.endTime, `plan.scheduledItems[${index}].endTime`);
      // The planner places blocks in chronological order; an inverted block
      // would produce a negative-duration calendar event.
      if (endTime <= startTime) {
        throw new FieldError(`plan.scheduledItems[${index}].endTime must be after startTime`);
      }
    });

    const result = commitApprovedDailyPlan(db, session.tenantId, session.userId, {
      ...plan,
      targetDate,
      scheduledItems,
    });

    return ok(result);
  } catch (err) {
    return routeError(err);
  }
});
