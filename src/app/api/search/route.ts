import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';
import { taskVisibleClause } from '@/lib/db/visibility';

export async function GET(request: Request) {
  try {
    const session = getCurrentSession();
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q') || '';
    const scope = searchParams.get('scope') || 'current'; // 'productivity', 'finance', 'global'

    if (!q.trim()) {
      return NextResponse.json({ results: [] });
    }

    const term = `%${q.trim()}%`;
    const results: Array<{
      id: string;
      type: string;
      title: string;
      subtitle?: string;
      workspace: 'productivity' | 'finance';
      link: string;
    }> = [];

    // Search Productivity
    if (scope === 'productivity' || scope === 'global' || scope === 'current') {
      const tasks = db.prepare(`
        SELECT id, title, priority, status FROM tasks
        WHERE tenant_id = ? AND is_deleted = 0 AND (title LIKE ? OR description LIKE ?)
          AND ${taskVisibleClause()}
        LIMIT 5
      `).all(session.tenantId, term, term) as any[];

      for (const t of tasks) {
        results.push({
          id: t.id,
          type: 'Task',
          title: t.title,
          subtitle: `Status: ${t.status} • Priority: ${t.priority}`,
          workspace: 'productivity',
          link: '/productivity/tasks',
        });
      }

      const projects = db.prepare(`
        SELECT id, name, status FROM projects
        WHERE tenant_id = ? AND (name LIKE ? OR description LIKE ?)
        LIMIT 5
      `).all(session.tenantId, term, term) as any[];

      for (const p of projects) {
        results.push({
          id: p.id,
          type: 'Project',
          title: p.name,
          subtitle: `Status: ${p.status}`,
          workspace: 'productivity',
          link: '/productivity/projects',
        });
      }

      const goals = db.prepare(`
        SELECT id, title, current_value, target_value, unit FROM goals
        WHERE tenant_id = ? AND (title LIKE ? OR description LIKE ?)
        LIMIT 5
      `).all(session.tenantId, term, term) as any[];

      for (const g of goals) {
        results.push({
          id: g.id,
          type: 'Goal',
          title: g.title,
          subtitle: `${g.current_value} / ${g.target_value} ${g.unit}`,
          workspace: 'productivity',
          link: '/productivity/goals',
        });
      }
    }

    // Search Finance
    if (scope === 'finance' || scope === 'global') {
      const accounts = db.prepare(`
        SELECT id, name, type, currency FROM finance_accounts
        WHERE tenant_id = ? AND (name LIKE ? OR institution LIKE ?)
        LIMIT 5
      `).all(session.tenantId, term, term) as any[];

      for (const a of accounts) {
        results.push({
          id: a.id,
          type: 'Account',
          title: a.name,
          subtitle: `${a.type.toUpperCase()} • ${a.currency}`,
          workspace: 'finance',
          link: '/finance/accounts',
        });
      }

      const transactions = db.prepare(`
        SELECT id, description, amount, currency, date FROM journal_transactions
        WHERE tenant_id = ? AND (description LIKE ? OR payee_name LIKE ?)
        LIMIT 5
      `).all(session.tenantId, term, term) as any[];

      for (const tx of transactions) {
        results.push({
          id: tx.id,
          type: 'Transaction',
          title: tx.description,
          subtitle: `$${tx.amount} on ${tx.date}`,
          workspace: 'finance',
          link: '/finance/transactions',
        });
      }
    }

    return NextResponse.json({ results });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
