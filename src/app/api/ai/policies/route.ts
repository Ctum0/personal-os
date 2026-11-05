import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';

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
    const body = await request.json();
    const { toolName, capabilityLevel, allowAutoExecution } = body;

    if (!toolName) {
      return NextResponse.json({ error: 'toolName is required' }, { status: 400 });
    }

    const autoExecInt = allowAutoExecution ? 1 : 0;

    db.prepare(`
      INSERT INTO ai_tool_policies (
        id, tenant_id, tool_name, capability_level, allow_auto_execution,
        daily_call_limit, requires_diff_hash, updated_at
      ) VALUES (?, ?, ?, ?, ?, 50, 1, datetime('now'))
      ON CONFLICT(tenant_id, tool_name) DO UPDATE SET
        capability_level = excluded.capability_level,
        allow_auto_execution = excluded.allow_auto_execution,
        updated_at = datetime('now')
    `).run(
      `pol_${toolName}`,
      session.tenantId,
      toolName,
      capabilityLevel || 'prepare_and_confirm',
      autoExecInt
    );

    const updated = db.prepare(`
      SELECT * FROM ai_tool_policies WHERE tenant_id = ? AND tool_name = ?
    `).get(session.tenantId, toolName);

    return NextResponse.json({ policy: updated });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
