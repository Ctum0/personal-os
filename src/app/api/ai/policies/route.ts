import { getDb } from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';
import { withApiLogging } from '@/lib/api/log';
import { ok, readBody, routeError } from '@/lib/api/http';
import { optionalBoolean, optionalEnum, requiredString } from '@/lib/api/fields';

const PERMISSION_LEVELS = ['read_and_recommend', 'prepare_and_confirm', 'auto_execute'] as const;

export const GET = withApiLogging(async function GET() {
  try {
    const session = getCurrentSession();
    const db = getDb();

    const policies = db.prepare(`
      SELECT * FROM ai_tool_policies
      WHERE tenant_id = ?
      ORDER BY tool_name ASC
    `).all(session.tenantId);

    return ok({ policies });
  } catch (err) {
    return routeError(err);
  }
});

export const PUT = withApiLogging(async function PUT(request: Request) {
  try {
    const session = getCurrentSession();
    const db = getDb();
    const body = await readBody(request);

    const toolName = requiredString(body.toolName, 'toolName', 100);
    // Schema columns are permission_level / is_enabled; the historical
    // capabilityLevel / allowAutoExecution payload names remain the public ones.
    const capabilityLevel = optionalEnum(body.capabilityLevel, 'capabilityLevel', PERMISSION_LEVELS);
    const allowAutoExecution = optionalBoolean(body.allowAutoExecution, 'allowAutoExecution');

    const permissionLevel = capabilityLevel ?? 'prepare_and_confirm';
    // `allowAutoExecution` IS the enable flag: without this, a non-auto tool
    // could never be disabled (it previously required BOTH conditions).
    const isEnabled = allowAutoExecution === false ? 0 : 1;

    db.prepare(`
      INSERT INTO ai_tool_policies (id, tenant_id, tool_name, permission_level, is_enabled, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(tenant_id, tool_name) DO UPDATE SET
        permission_level = excluded.permission_level,
        is_enabled = excluded.is_enabled,
        updated_at = datetime('now')
    `).run(`pol_${toolName}`, session.tenantId, toolName, permissionLevel, isEnabled);

    const updated = db.prepare(`
      SELECT * FROM ai_tool_policies WHERE tenant_id = ? AND tool_name = ?
    `).get(session.tenantId, toolName);

    return ok({ policy: updated });
  } catch (err) {
    return routeError(err);
  }
});
