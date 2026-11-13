import { getDb } from '@/lib/db';

export interface UserSession {
  userId: string;
  tenantId: string;
  name: string;
  email: string;
  role: string;
  preferences: {
    theme?: 'light' | 'dark' | 'system';
    currency?: string;
    locale?: string;
    workHoursStart?: string;
    workHoursEnd?: string;
    aiAutoApproveLowRisk?: boolean;
  };
}

/**
 * Resolves the operator's session.
 *
 * This is a single-operator desktop application: authentication is the PIN gate
 * in `src/proxy.ts`, and the data owner is the primary user of the database.
 * The user is selected deterministically (oldest membership) so a database that
 * acquires a second user row cannot silently pin every request to an arbitrary
 * tenant — and the tenant is verified to exist before it is handed out, because
 * a synthetic tenant id would make every insert fail its foreign key.
 */
export function getCurrentSession(): UserSession {
  const db = getDb();
  const user = db.prepare(`
    SELECT u.id, u.tenant_id, u.name, u.email, u.preferences, tm.role
    FROM users u
    JOIN tenant_memberships tm ON u.id = tm.user_id AND u.tenant_id = tm.tenant_id
    JOIN tenants t ON t.id = u.tenant_id
    ORDER BY u.created_at ASC, u.id ASC
    LIMIT 1
  `).get() as {
    id: string;
    tenant_id: string;
    name: string;
    email: string;
    preferences: string;
    role: string;
  } | undefined;

  if (!user) {
    throw new Error(
      'No operator account exists in this database. Run the app once against an empty file to seed it, or restore a backup.'
    );
  }

  let preferences: UserSession['preferences'] = {};
  try {
    const parsed: unknown = JSON.parse(user.preferences);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      preferences = parsed as UserSession['preferences'];
    }
  } catch {
    preferences = {};
  }

  return {
    userId: user.id,
    tenantId: user.tenant_id,
    name: user.name,
    email: user.email,
    role: user.role,
    preferences,
  };
}
