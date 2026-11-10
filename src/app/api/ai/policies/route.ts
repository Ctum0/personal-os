import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';
import { readJson } from '@/lib/db/validate';

export async function GET() {
  try {
    const session = getCurrentSession();
    const db = getDb();

    const policies = db.prepare(`
      SELECT * FROM ai_tool_policies 
      WHERE tenant_id = ?
      ORDER BY tool_name ASC
    `).all(session.tenantId);

    return NextResponse.json({ policies });
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
    const { toolName, capabilityLevel, allowAutoExecution } = body;

    if (!toolName || typeof toolName !== 'string' || toolName.length > 100) {
      return NextResponse.json({ error: 'toolName is required' }, { status: 400 });
    }

    // Schema columns are permission_level / is_enabled; accept the historical
    // capabilityLevel/allowAutoExecution payload names as aliases.
    const validLevels = ['read_and_recommend', 'prepare_and_confirm', 'auto_execute'];
    if (capabilityLevel !== undefined && !validLevels.includes(capabilityLevel)) {
      return NextResponse.json({ error: `Invalid capabilityLevel. Must be one of: ${validLevels.join(', ')}` }, { status: 400 });
    }
    if (allowAutoExecution !== undefined && typeof allowAutoExecution !== 'boolean') {
      return NextResponse.json({ error: 'allowAutoExecution must be a boolean' }, { status: 400 });
    }

    const permissionLevel = capabilityLevel || 'prepare_and_confirm';
    // Auto execution is only meaningful at the auto_execute level; otherwise the
    // policy is simply enabled with the given level.
    const isEnabled = allowAutoExecution === false && permissionLevel === 'auto_execute' ? 0 : 1;

    db.prepare(`
      INSERT INTO ai_tool_policies (id, tenant_id, tool_name, permission_level, is_enabled, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(tenant_id, tool_name) DO UPDATE SET
        permission_level = excluded.permission_level,
        is_enabled = excluded.is_enabled,
        updated_at = datetime('now')
    `).run(
      `pol_${toolName}`,
      session.tenantId,
      toolName,
      permissionLevel,
      isEnabled
    );

    const updated = db.prepare(`
      SELECT * FROM ai_tool_policies WHERE tenant_id = ? AND tool_name = ?
    `).get(session.tenantId, toolName);

    return NextResponse.json({ policy: updated });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
