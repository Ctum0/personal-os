import { getDb } from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';
import { withApiLogging } from '@/lib/api/log';
import { conflict, ok, readBody, routeError } from '@/lib/api/http';
import { optionalString, requiredString } from '@/lib/api/fields';

/**
 * Slug normalization: lowercase, ASCII letters/digits kept, everything else
 * collapsed to a single dash. A fully non-ASCII name (e.g. "健康") normalizes to
 * an empty string, which would collide on `UNIQUE(tenant_id, slug)` for every
 * such name — the caller falls back to a random suffix in that case.
 */
function normalizeSlug(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export const GET = withApiLogging(async function GET() {
  try {
    const session = getCurrentSession();
    const db = getDb();

    const spaces = db.prepare(`
      SELECT * FROM spaces 
      WHERE tenant_id = ? 
      ORDER BY is_default DESC, name ASC
    `).all(session.tenantId);

    return ok({ spaces });
  } catch (err) {
    return routeError(err);
  }
});

export const POST = withApiLogging(async function POST(request: Request) {
  try {
    const session = getCurrentSession();
    const db = getDb();
    const body = await readBody(request);

    const name = requiredString(body.name, 'name', 200);
    const description = optionalString(body.description, 'description', 2000) ?? '';
    const icon = optionalString(body.icon, 'icon', 50) ?? 'Folder';
    const color = optionalString(body.color, 'color', 30) ?? '#6366f1';

    const requestedSlug = optionalString(body.slug, 'slug', 100);
    const baseSlug = normalizeSlug(requestedSlug ?? name);
    // Non-ASCII names normalize to nothing; a random suffix keeps the slug
    // unique instead of letting the insert fail on the UNIQUE constraint.
    const slug = baseSlug || `space-${Math.random().toString(36).substring(2, 8)}`;

    const slugTaken = db
      .prepare('SELECT id FROM spaces WHERE tenant_id = ? AND slug = ?')
      .get(session.tenantId, slug);
    if (slugTaken) conflict('A space with this name already exists');

    const spaceId = `space_${slug}_${Date.now().toString(36).substring(4)}`;

    db.prepare(`
      INSERT INTO spaces (id, tenant_id, name, slug, icon, color, description, is_default)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0)
    `).run(
      spaceId,
      session.tenantId,
      name,
      slug,
      icon,
      color,
      description
    );

    const space = db.prepare('SELECT * FROM spaces WHERE id = ? AND tenant_id = ?').get(spaceId, session.tenantId);
    return ok({ space }, 201);
  } catch (err) {
    return routeError(err);
  }
});
