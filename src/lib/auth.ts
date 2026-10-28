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

export function getCurrentSession(): UserSession {
  const db = getDb();
  // For desktop-first personal OS, resolve primary user
  const user = db.prepare(`
    SELECT u.id, u.tenant_id, u.name, u.email, u.preferences, tm.role
    FROM users u
    JOIN tenant_memberships tm ON u.id = tm.user_id AND u.tenant_id = tm.tenant_id
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
    return {
      userId: 'user_default',
      tenantId: 'tenant_default',
      name: 'Alex Morgan',
      email: 'user@personal-os.local',
      role: 'owner',
      preferences: {
        theme: 'dark',
        currency: 'USD',
        locale: 'en-US',
        workHoursStart: '09:00',
        workHoursEnd: '17:00',
      },
    };
  }

  let prefs = {};
  try {
    prefs = JSON.parse(user.preferences);
  } catch {}

  return {
    userId: user.id,
    tenantId: user.tenant_id,
    name: user.name,
    email: user.email,
    role: user.role,
    preferences: prefs,
  };
}
