import { getDb } from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';
import { calculateHabitStreak } from '@/lib/productivity/engine';
import { todayISO } from '@/lib/time';
import { withApiLogging } from '@/lib/api/log';
import { FieldError, notFound, ok, readBody, routeError } from '@/lib/api/http';
import {
  optionalEnum,
  optionalNumber,
  optionalString,
  requiredArray,
  requiredString,
} from '@/lib/api/fields';
import { referenceExists } from '@/lib/db/validate';

const TRACKING_TYPES = ['boolean', 'duration', 'quantity'] as const;
const SCHEDULE_TYPES = ['daily', 'custom'] as const;

/**
 * Only the key is read in TypeScript; the row is spread into the response so
 * the rest of the columns pass through untouched.
 */
type HabitRow = { id: string } & Record<string, unknown>;

export const GET = withApiLogging(async function GET(request: Request) {
  try {
    const session = getCurrentSession();
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const spaceId = searchParams.get('spaceId');
    const today = todayISO();

    let query = 'SELECT * FROM habits WHERE tenant_id = ?';
    const params: string[] = [session.tenantId];

    if (spaceId && spaceId !== 'all') {
      query += ' AND space_id = ?';
      params.push(spaceId);
    }
    query += ' ORDER BY is_paused ASC, created_at ASC';

    const rawHabits = db.prepare(query).all(...params) as HabitRow[];

    const habits = rawHabits.map(h => {
      const streakInfo = calculateHabitStreak(db, session.tenantId, h.id, today);

      // Get past 14 days logs for the weekly heatmap / dots
      const recentLogs = db.prepare(`
        SELECT log_date, value, status 
        FROM habit_logs 
        WHERE tenant_id = ? AND habit_id = ? 
        ORDER BY log_date DESC LIMIT 14
      `).all(session.tenantId, h.id);

      return {
        ...h,
        streak: streakInfo?.currentStreak || 0,
        bestStreak: streakInfo?.bestStreak || 0,
        completionRate: streakInfo?.completionRatePercent || 0,
        isCompletedToday: streakInfo?.isCompletedToday || false,
        todayValue: streakInfo?.todayLogValue,
        recentLogs,
      };
    });

    return ok({ habits });
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
    const description = optionalString(body.description, 'description', 20_000) ?? '';
    const trackingType = optionalEnum(body.trackingType, 'trackingType', TRACKING_TYPES) ?? 'boolean';
    const scheduleType = optionalEnum(body.scheduleType, 'scheduleType', SCHEDULE_TYPES) ?? 'daily';

    const rawTarget = optionalNumber(body.targetValue, 'targetValue') ?? 1;
    if (rawTarget <= 0) {
      throw new FieldError('targetValue must be a positive number');
    }
    const rawMinimum = optionalNumber(body.minimumThreshold, 'minimumThreshold');
    if (rawMinimum !== undefined && rawMinimum <= 0) {
      throw new FieldError('minimumThreshold must be a positive number');
    }
    const rawIdeal = optionalNumber(body.idealTarget, 'idealTarget');
    if (rawIdeal !== undefined && rawIdeal <= 0) {
      throw new FieldError('idealTarget must be a positive number');
    }

    // Weekday indices 1 (Mon) .. 7 (Sun); an empty schedule is meaningless.
    let scheduleDays: number[] | undefined;
    if (body.scheduleDays !== undefined) {
      const days = requiredArray(body.scheduleDays, 'scheduleDays', 7);
      if (days.length === 0) {
        throw new FieldError('scheduleDays must contain at least one day');
      }
      scheduleDays = days.map((day, index) => {
        const value = optionalNumber(day, `scheduleDays[${index}]`);
        if (value === undefined || !Number.isInteger(value) || value < 1 || value > 7) {
          throw new FieldError('scheduleDays must be an array of integers 1-7 (Mon-Sun)');
        }
        return value;
      });
    }

    const spaceId = optionalString(body.spaceId, 'spaceId', 100) ?? 'space_personal';
    if (!referenceExists(db, session.tenantId, 'spaces', spaceId)) notFound('Space');

    const habitId = `habit_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const minimumThreshold = rawMinimum ?? 1;
    const idealTarget = rawIdeal ?? rawTarget;
    const unit = optionalString(body.unit, 'unit', 30) ?? (trackingType === 'duration' ? 'mins' : 'times');
    const color = optionalString(body.color, 'color', 30) ?? '#8b5cf6';
    const icon = optionalString(body.icon, 'icon', 50) ?? 'CheckCircle2';

    db.prepare(`
      INSERT INTO habits (
        id, tenant_id, space_id, title, description, tracking_type, unit, target_value, minimum_threshold, ideal_target, schedule_type, schedule_days, color, icon
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      habitId,
      session.tenantId,
      spaceId,
      title,
      description,
      trackingType,
      unit,
      rawTarget,
      minimumThreshold,
      idealTarget,
      scheduleType,
      scheduleDays ? JSON.stringify(scheduleDays) : '[1,2,3,4,5,6,7]',
      color,
      icon
    );

    const habit = db.prepare('SELECT * FROM habits WHERE id = ? AND tenant_id = ?').get(habitId, session.tenantId);
    return ok({ habit }, 201);
  } catch (err) {
    return routeError(err);
  }
});
