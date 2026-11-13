import { getDb } from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';
import { calculateGoalProgress } from '@/lib/productivity/engine';
import { withApiLogging } from '@/lib/api/log';
import { FieldError, notFound, ok, readBody, routeError } from '@/lib/api/http';
import {
  optionalEnum,
  optionalISODate,
  optionalNumber,
  optionalString,
  requiredString,
} from '@/lib/api/fields';
import { referenceExists } from '@/lib/db/validate';

const GOAL_STATUSES = [
  'not_started', 'in_progress', 'on_track', 'at_risk', 'achieved', 'abandoned',
] as const;
const GOAL_TYPES = ['numeric', 'binary'] as const;
const GOAL_DIRECTIONS = ['ascending', 'descending'] as const;
const GOAL_CADENCES = ['weekly', 'monthly', 'quarterly', 'yearly'] as const;

interface GoalRow {
  id: string;
  space_id: string | null;
  title: string;
  description: string | null;
  type: string;
  start_value: number;
  target_value: number;
  current_value: number;
  unit: string;
  direction: string;
  progress_method: string;
  start_date: string | null;
  deadline: string | null;
  cadence: string;
  status: string;
  linked_savings_goal_id: string | null;
  color: string;
}

export const GET = withApiLogging(async function GET(request: Request) {
  try {
    const session = getCurrentSession();
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const spaceId = searchParams.get('spaceId');

    let query = 'SELECT * FROM goals WHERE tenant_id = ?';
    const params: string[] = [session.tenantId];

    if (spaceId && spaceId !== 'all') {
      query += ' AND space_id = ?';
      params.push(spaceId);
    }
    query += ' ORDER BY status ASC, deadline ASC, created_at DESC';

    const rawGoals = db.prepare(query).all(...params) as GoalRow[];

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

    return ok({ goals });
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
    const type = optionalEnum(body.type, 'type', GOAL_TYPES) ?? 'numeric';
    const direction = optionalEnum(body.direction, 'direction', GOAL_DIRECTIONS) ?? 'ascending';
    const cadence = optionalEnum(body.cadence, 'cadence', GOAL_CADENCES) ?? 'quarterly';
    const status = optionalEnum(body.status, 'status', GOAL_STATUSES) ?? 'in_progress';
    const unit = optionalString(body.unit, 'unit', 30) ?? '%';
    const color = optionalString(body.color, 'color', 30) ?? '#10b981';
    const startDate = optionalISODate(body.startDate, 'startDate');
    const deadline = optionalISODate(body.deadline, 'deadline');
    const spaceId = optionalString(body.spaceId, 'spaceId', 100) ?? 'space_personal';
    const linkedSavingsGoalId = optionalString(body.linkedSavingsGoalId, 'linkedSavingsGoalId', 100);

    // Goal values are measurements, never negative: a negative reading is a
    // client error, not a stored value that silently breaks progress math.
    const startValue = optionalNumber(body.startValue, 'startValue') ?? 0;
    const targetValue = optionalNumber(body.targetValue, 'targetValue') ?? 100;
    const currentValue = optionalNumber(body.currentValue, 'currentValue') ?? startValue;
    if (startValue < 0 || targetValue < 0 || currentValue < 0) {
      throw new FieldError('Goal values must be non-negative');
    }

    if (linkedSavingsGoalId !== undefined && !referenceExists(db, session.tenantId, 'savings_goals', linkedSavingsGoalId)) {
      notFound('Linked savings goal');
    }
    // Isolation: owner space must exist within the tenant
    if (!referenceExists(db, session.tenantId, 'spaces', spaceId)) notFound('Space');

    const goalId = `goal_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    db.transaction(() => {
      db.prepare(`
        INSERT INTO goals (
          id, tenant_id, space_id, title, description, type, start_value, target_value, current_value, unit, direction, progress_method, start_date, deadline, cadence, status, linked_savings_goal_id, color
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        goalId,
        session.tenantId,
        spaceId,
        title,
        description,
        type,
        startValue,
        targetValue,
        currentValue,
        unit,
        direction,
        optionalString(body.progressMethod, 'progressMethod', 30) ?? 'log_latest',
        startDate ?? null,
        deadline ?? null,
        cadence,
        status,
        linkedSavingsGoalId ?? null,
        color
      );

      // Initial progress log
      db.prepare(`
        INSERT INTO goal_progress_logs (id, tenant_id, goal_id, value, delta, note, source)
        VALUES (?, ?, ?, ?, ?, 'Initial measurement', 'manual')
      `).run(`gpl_${goalId}_0`, session.tenantId, goalId, currentValue, 0);
    })();

    const goal = db.prepare('SELECT * FROM goals WHERE id = ? AND tenant_id = ?').get(goalId, session.tenantId);
    return ok({ goal }, 201);
  } catch (err) {
    return routeError(err);
  }
});

export const PUT = withApiLogging(async function PUT(request: Request) {
  try {
    const session = getCurrentSession();
    const db = getDb();
    const body = await readBody(request);

    const id = requiredString(body.id, 'id', 100);
    const existing = db
      .prepare('SELECT id, current_value FROM goals WHERE id = ? AND tenant_id = ?')
      .get(id, session.tenantId) as Pick<GoalRow, 'id' | 'current_value'> | undefined;
    if (!existing) notFound('Goal');

    const title = optionalString(body.title, 'title', 500);
    const description = optionalString(body.description, 'description', 20_000);
    const status = optionalEnum(body.status, 'status', GOAL_STATUSES);
    const deadline = optionalISODate(body.deadline, 'deadline');
    const color = optionalString(body.color, 'color', 30);
    const note = optionalString(body.note, 'note', 2000) ?? 'Progress update';

    const currentValue = optionalNumber(body.currentValue, 'currentValue');
    const targetValue = optionalNumber(body.targetValue, 'targetValue');
    const newLogValue = optionalNumber(body.newLogValue, 'newLogValue');
    if ((currentValue ?? 0) < 0 || newLogValue !== undefined && newLogValue < 0) {
      throw new FieldError('Goal values must be non-negative');
    }
    if (targetValue !== undefined && targetValue < 0) {
      throw new FieldError('targetValue must be a non-negative number');
    }

    // A logged measurement writes a history row and becomes the stored current
    // value; a bare currentValue edit only overwrites the projection.
    const nextValue = newLogValue ?? currentValue;

    db.transaction(() => {
      if (newLogValue !== undefined) {
        db.prepare(`
          INSERT INTO goal_progress_logs (id, tenant_id, goal_id, value, delta, note, source)
          VALUES (?, ?, ?, ?, ?, ?, 'manual')
        `).run(
          `gpl_${id}_${Date.now()}`,
          session.tenantId,
          id,
          newLogValue,
          newLogValue - existing.current_value,
          note
        );
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
        title ?? null,
        description ?? null,
        nextValue ?? null,
        targetValue ?? null,
        status ?? null,
        deadline ?? null,
        color ?? null,
        id,
        session.tenantId
      );
    })();

    const updated = db.prepare('SELECT * FROM goals WHERE id = ? AND tenant_id = ?').get(id, session.tenantId);
    return ok({ goal: updated });
  } catch (err) {
    return routeError(err);
  }
});
