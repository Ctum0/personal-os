import { getDb } from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';
import { DRAFT_DECISIONS, DraftDecision, applyAiActionDraft } from '@/lib/ai/tools';
import { withApiLogging } from '@/lib/api/log';
import { FieldError, ok, readBody, routeError } from '@/lib/api/http';
import { requiredString } from '@/lib/api/fields';

/** Accepts the canonical decisions plus the short verbs older clients send. */
const DECISION_ALIASES: Record<string, DraftDecision> = {
  approved: 'approved',
  approve: 'approved',
  rejected: 'rejected',
  reject: 'rejected',
};

interface DraftRow {
  id: string;
  proposed_payload: string;
  [column: string]: unknown;
}

/** Raw draft row plus the parsed payload the drawer renders. */
type DraftResponse = DraftRow & { proposedPayload: unknown };

function parsePayload(raw: unknown): unknown {
  if (typeof raw !== 'string') return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export const GET = withApiLogging(async function GET() {
  try {
    const session = getCurrentSession();
    const db = getDb();

    const drafts = db.prepare(`
      SELECT * FROM ai_action_drafts
      WHERE tenant_id = ? AND status = 'draft' AND expires_at > datetime('now')
      ORDER BY created_at DESC
    `).all(session.tenantId) as DraftRow[];

    const pendingDrafts: DraftResponse[] = drafts.map((draft) => ({
      ...draft,
      proposedPayload: parsePayload(draft.proposed_payload),
    }));

    return ok({ pendingDrafts });
  } catch (err) {
    return routeError(err);
  }
});

export const POST = withApiLogging(async function POST(request: Request) {
  try {
    const session = getCurrentSession();
    const db = getDb();
    const body = await readBody(request);

    const draftId = requiredString(body.draftId, 'draftId', 200);
    const rawDecision = requiredString(body.decision, 'decision', 20).toLowerCase();
    const decision = DECISION_ALIASES[rawDecision];
    if (!decision) {
      throw new FieldError(`decision must be one of: ${DRAFT_DECISIONS.join(', ')}`);
    }

    const result = applyAiActionDraft(db, session.tenantId, session.userId, draftId, decision);
    return ok(result);
  } catch (err) {
    return routeError(err);
  }
});
