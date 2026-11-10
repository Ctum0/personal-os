import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';
import { calculateProjectProgress } from '@/lib/productivity/engine';
import { readJson } from '@/lib/db/validate';

export async function GET(request: Request) {
  try {
    const session = getCurrentSession();
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const spaceId = searchParams.get('spaceId');

    let query = 'SELECT * FROM projects WHERE tenant_id = ?';
    const params: any[] = [session.tenantId];

    if (spaceId && spaceId !== 'all') {
      query += ' AND space_id = ?';
      params.push(spaceId);
    }
    query += ' ORDER BY target_date ASC, created_at DESC';

    const rawProjects = db.prepare(query).all(...params) as any[];

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

    return NextResponse.json({ projects });
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

    if (!body.name || !body.name.trim()) {
      return NextResponse.json({ error: 'Project name is required' }, { status: 400 });
    }

    const projectId = `proj_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const progressMethod = body.progressMethod || 'completion';
    const color = body.color || '#3b82f6';

    db.transaction(() => {
      db.prepare(`
        INSERT INTO projects (
          id, tenant_id, space_id, goal_id, name, description, status, objective, definition_of_done, start_date, target_date, progress_method, manual_progress, color
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        projectId,
        session.tenantId,
        body.spaceId || 'space_personal',
        body.goalId || null,
        body.name.trim(),
        body.description || '',
        body.status || 'active',
        body.objective || '',
        body.definitionOfDone || '',
        body.startDate || null,
        body.targetDate || null,
        progressMethod,
        body.manualProgress || 0,
        color
      );

      // If initial milestones provided
      if (Array.isArray(body.milestones)) {
        const insertMilestone = db.prepare(`
          INSERT INTO project_milestones (id, tenant_id, project_id, title, target_date, sort_order)
          VALUES (?, ?, ?, ?, ?, ?)
        `);
        body.milestones.forEach((m: any, idx: number) => {
          if (m.title && m.title.trim()) {
            insertMilestone.run(`ms_${projectId}_${idx}`, session.tenantId, projectId, m.title.trim(), m.targetDate || null, idx);
          }
        });
      }
    })();

    const project = db.prepare('SELECT * FROM projects WHERE id = ? AND tenant_id = ?').get(projectId, session.tenantId);
    return NextResponse.json({ project }, { status: 201 });
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
      return NextResponse.json({ error: 'Project ID is required' }, { status: 400 });
    }

    const existing = db.prepare('SELECT * FROM projects WHERE id = ? AND tenant_id = ?').get(body.id, session.tenantId);
    if (!existing) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

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
        body.name,
        body.description,
        body.status,
        body.objective,
        body.definitionOfDone,
        body.startDate,
        body.targetDate,
        body.progressMethod,
        body.manualProgress,
        body.color,
        body.id,
        session.tenantId
      );

      // Toggle milestone if milestoneId specified
      if (body.milestoneId && body.isCompleted !== undefined) {
        db.prepare(`
          UPDATE project_milestones 
          SET is_completed = ?, completed_at = ?
          WHERE id = ? AND project_id = ? AND tenant_id = ?
        `).run(body.isCompleted ? 1 : 0, body.isCompleted ? new Date().toISOString() : null, body.milestoneId, body.id, session.tenantId);
      }
    })();

    const updated = db.prepare('SELECT * FROM projects WHERE id = ? AND tenant_id = ?').get(body.id, session.tenantId);
    return NextResponse.json({ project: updated });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
