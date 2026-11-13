import { getDb } from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';
import { calculateProjectProgress } from '@/lib/productivity/engine';
import { withApiLogging } from '@/lib/api/log';
import { notFound, ok, readBody, routeError } from '@/lib/api/http';
import {
  optionalBoolean,
  optionalEnum,
  optionalInt,
  optionalISODate,
  optionalString,
  requiredArray,
  requiredString,
} from '@/lib/api/fields';
import { referenceExists } from '@/lib/db/validate';

const PROJECT_STATUSES = ['active', 'paused', 'completed', 'archived'] as const;
const PROGRESS_METHODS = ['manual', 'completion', 'weighted', 'milestone'] as const;

/** Every column reaches the client through a spread; only `id` is read here. */
type ProjectRow = { id: string } & Record<string, unknown>;

interface MilestoneInput {
  title?: unknown;
  targetDate?: unknown;
}

export const GET = withApiLogging(async function GET(request: Request) {
  try {
    const session = getCurrentSession();
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const spaceId = searchParams.get('spaceId');

    let query = 'SELECT * FROM projects WHERE tenant_id = ?';
    const params: string[] = [session.tenantId];

    if (spaceId && spaceId !== 'all') {
      query += ' AND space_id = ?';
      params.push(spaceId);
    }
    query += ' ORDER BY target_date ASC, created_at DESC';

    const rawProjects = db.prepare(query).all(...params) as ProjectRow[];

    const projects = rawProjects.map(p => {
      const progressResult = calculateProjectProgress(db, session.tenantId, p.id);
      const milestones = db.prepare(`
        SELECT * FROM project_milestones 
        WHERE tenant_id = ? AND project_id = ? 
        ORDER BY sort_order ASC, target_date ASC
      `).all(session.tenantId, p.id);

      return {
        ...p,
        progress: progressResult?.progressPercentage || 0,
        progressDetails: progressResult,
        milestones,
      };
    });

    return ok({ projects });
  } catch (err) {
    return routeError(err);
  }
});

export const POST = withApiLogging(async function POST(request: Request) {
  try {
    const session = getCurrentSession();
    const db = getDb();
    const body = await readBody(request);

    const name = requiredString(body.name, 'name', 500);
    const description = optionalString(body.description, 'description', 20_000) ?? '';
    const status = optionalEnum(body.status, 'status', PROJECT_STATUSES) ?? 'active';
    const progressMethod = optionalEnum(body.progressMethod, 'progressMethod', PROGRESS_METHODS) ?? 'completion';
    const objective = optionalString(body.objective, 'objective', 20_000) ?? '';
    const definitionOfDone = optionalString(body.definitionOfDone, 'definitionOfDone', 20_000) ?? '';
    const startDate = optionalISODate(body.startDate, 'startDate');
    const targetDate = optionalISODate(body.targetDate, 'targetDate');
    const spaceId = optionalString(body.spaceId, 'spaceId', 100) ?? 'space_personal';
    const goalId = optionalString(body.goalId, 'goalId', 100);
    const color = optionalString(body.color, 'color', 30) ?? '#3b82f6';
    const manualProgress = optionalInt(body.manualProgress, 'manualProgress', 0, 100) ?? 0;
    const milestones = body.milestones === undefined ? [] : requiredArray<MilestoneInput>(body.milestones, 'milestones', 200);

    if (!referenceExists(db, session.tenantId, 'spaces', spaceId)) notFound('Space');
    if (goalId !== undefined && !referenceExists(db, session.tenantId, 'goals', goalId)) notFound('Goal');

    const projectId = `proj_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    db.transaction(() => {
      db.prepare(`
        INSERT INTO projects (
          id, tenant_id, space_id, goal_id, name, description, status, objective, definition_of_done, start_date, target_date, progress_method, manual_progress, color
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        projectId,
        session.tenantId,
        spaceId,
        goalId ?? null,
        name,
        description,
        status,
        objective,
        definitionOfDone,
        startDate ?? null,
        targetDate ?? null,
        progressMethod,
        manualProgress,
        color
      );

      // If initial milestones provided
      if (milestones.length > 0) {
        const insertMilestone = db.prepare(`
          INSERT INTO project_milestones (id, tenant_id, project_id, title, target_date, sort_order)
          VALUES (?, ?, ?, ?, ?, ?)
        `);
        milestones.forEach((m, idx) => {
          const title = optionalString(m.title, `milestones[${idx}].title`, 500);
          if (title === undefined) return;
          insertMilestone.run(
            `ms_${projectId}_${idx}`,
            session.tenantId,
            projectId,
            title,
            optionalISODate(m.targetDate, `milestones[${idx}].targetDate`) ?? null,
            idx
          );
        });
      }
    })();

    const project = db.prepare('SELECT * FROM projects WHERE id = ? AND tenant_id = ?').get(projectId, session.tenantId);
    return ok({ project }, 201);
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
      .prepare('SELECT id FROM projects WHERE id = ? AND tenant_id = ?')
      .get(id, session.tenantId) as { id: string } | undefined;
    if (!existing) notFound('Project');

    const name = optionalString(body.name, 'name', 500);
    const description = optionalString(body.description, 'description', 20_000);
    const status = optionalEnum(body.status, 'status', PROJECT_STATUSES);
    const objective = optionalString(body.objective, 'objective', 20_000);
    const definitionOfDone = optionalString(body.definitionOfDone, 'definitionOfDone', 20_000);
    const startDate = optionalISODate(body.startDate, 'startDate');
    const targetDate = optionalISODate(body.targetDate, 'targetDate');
    const progressMethod = optionalEnum(body.progressMethod, 'progressMethod', PROGRESS_METHODS);
    const manualProgress = optionalInt(body.manualProgress, 'manualProgress', 0, 100);
    const color = optionalString(body.color, 'color', 30);
    const milestoneId = optionalString(body.milestoneId, 'milestoneId', 100);
    const isCompleted = optionalBoolean(body.isCompleted, 'isCompleted');

    db.transaction(() => {
      db.prepare(`
        UPDATE projects
        SET 
          name = coalesce(?, name),
          description = coalesce(?, description),
          status = coalesce(?, status),
          objective = coalesce(?, objective),
          definition_of_done = coalesce(?, definition_of_done),
          start_date = coalesce(?, start_date),
          target_date = coalesce(?, target_date),
          progress_method = coalesce(?, progress_method),
          manual_progress = coalesce(?, manual_progress),
          color = coalesce(?, color),
          updated_at = datetime('now')
        WHERE id = ? AND tenant_id = ?
      `).run(
        name ?? null,
        description ?? null,
        status ?? null,
        objective ?? null,
        definitionOfDone ?? null,
        startDate ?? null,
        targetDate ?? null,
        progressMethod ?? null,
        manualProgress ?? null,
        color ?? null,
        id,
        session.tenantId
      );

      // Toggle milestone if milestoneId specified
      if (milestoneId !== undefined && isCompleted !== undefined) {
        db.prepare(`
          UPDATE project_milestones 
          SET is_completed = ?, completed_at = ?
          WHERE id = ? AND project_id = ? AND tenant_id = ?
        `).run(
          isCompleted ? 1 : 0,
          isCompleted ? new Date().toISOString() : null,
          milestoneId,
          id,
          session.tenantId
        );
      }
    })();

    const updated = db.prepare('SELECT * FROM projects WHERE id = ? AND tenant_id = ?').get(id, session.tenantId);
    return ok({ project: updated });
  } catch (err) {
    return routeError(err);
  }
});
