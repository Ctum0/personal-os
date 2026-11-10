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

/**
 * @deprecated Prefer the middleware gate: `src/proxy.ts` (Next 16 proxy
 * `gateRequest()` in `@/lib/api/gate`. This function was previously dead code —
 * no route called it — which is why the middleware approach landed. Kept for
 * route-level defense in depth only; it performs no constant-time comparison.
 *
 * Validates request for local protection. If PERSONAL_OS_PIN is set in the environment,
 * requests must provide matching x-personal-os-pin header or personal_os_session cookie.
 *
 * TODO(post-A): delete once all routes rely solely on middleware (tracked in §7 of ACCEPTANCE-REPORT).
 */
export function validateApiRequest(request?: Request): { authorized: boolean; reason?: string } {
  const pin = process.env.PERSONAL_OS_PIN;
  if (!pin) {
    // Local workstation mode: open on 127.0.0.1 by default
    return { authorized: true };
  }

  if (!request) {
    return { authorized: true };
  }

  const headerPin = request.headers.get('x-personal-os-pin');
  const cookieHeader = request.headers.get('cookie') || '';
  const hasCookie = cookieHeader.includes(`personal_os_session=${pin}`);

  if (headerPin === pin || hasCookie) {
    return { authorized: true };
  }

  return { authorized: false, reason: 'Invalid or missing Personal OS authentication PIN' };
}
