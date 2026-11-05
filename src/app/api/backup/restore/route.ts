import { NextResponse } from 'next/server';
import { getDb, snapshotDatabase, schemaVersion } from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const session = getCurrentSession();
    const db = getDb();
    const body = await request.json();

    if (!body || !body.domains) {
      return NextResponse.json({ error: 'Invalid backup file format: missing domains object' }, { status: 400 });
    }

    // Pre-restore snapshot for guaranteed disaster recovery
    const ver = schemaVersion(db);
    const snapshotPath = snapshotDatabase(db, ver);

    const { productivity, finance } = body.domains;
    let importedTasks = 0;
    let importedAccounts = 0;
    let importedTxs = 0;

    db.transaction(() => {
      // 1. Restore productivity tasks if present
      if (productivity?.tasks && Array.isArray(productivity.tasks)) {
        const stmt = db.prepare(`
          INSERT INTO tasks (
            id, tenant_id, title, description, status, priority,
            estimated_duration, actual_duration, due_date, space_id, project_id, goal_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            title = excluded.title,
            status = excluded.status,
            priority = excluded.priority,
            due_date = excluded.due_date,
            updated_at = datetime('now')
        `);

        for (const t of productivity.tasks) {
          if (t.id && t.title) {
            stmt.run(
              t.id,
              session.tenantId,
              t.title,
              t.description || null,
              t.status || 'inbox',
              t.priority || 'normal',
              t.estimated_duration || 0,
              t.actual_duration || 0,
              t.due_date || null,
              t.space_id || null,
              t.project_id || null,
              t.goal_id || null
            );
            importedTasks++;
          }
        }
      }

      // 2. Restore finance accounts if present
      if (finance?.accounts && Array.isArray(finance.accounts)) {
        const accStmt = db.prepare(`
          INSERT INTO finance_accounts (
            id, tenant_id, name, type, currency, opening_balance, is_active, display_color
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            opening_balance = excluded.opening_balance,
            is_active = excluded.is_active,
            updated_at = datetime('now')
        `);

        for (const a of finance.accounts) {
          if (a.id && a.name) {
            accStmt.run(
              a.id,
              session.tenantId,
              a.name,
              a.type || 'checking',
              a.currency || 'USD',
              a.opening_balance || '0.00',
              a.is_active !== undefined ? a.is_active : 1,
              a.display_color || '#10b981'
            );
            importedAccounts++;
          }
        }
      }

      // 3. Restore finance transactions if present
      if (finance?.transactions && Array.isArray(finance.transactions)) {
        const txStmt = db.prepare(`
          INSERT INTO journal_transactions (
            id, tenant_id, transaction_type, status, date, amount, currency,
            account_id, to_account_id, category_id, payee, description
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            status = excluded.status,
            amount = excluded.amount,
            updated_at = datetime('now')
        `);

        for (const tx of finance.transactions) {
          if (tx.id && tx.amount) {
            txStmt.run(
              tx.id,
              session.tenantId,
              tx.transaction_type || 'expense',
              tx.status || 'posted',
              tx.date || new Date().toISOString().slice(0, 10),
              tx.amount,
              tx.currency || 'USD',
              tx.account_id || null,
              tx.to_account_id || null,
              tx.category_id || null,
              tx.payee || null,
              tx.description || ''
            );
            importedTxs++;
          }
        }
      }

      // Record audit event
      db.prepare(`
        INSERT INTO audit_events (id, tenant_id, actor_id, domain, action, entity_type, entity_id, changes)
        VALUES (?, ?, ?, 'platform', 'restore_backup', 'system_backup', 'all', ?)
      `).run(
        `aud_restore_${Date.now()}`,
        session.tenantId,
        session.userId,
        JSON.stringify({ importedTasks, importedAccounts, importedTxs, snapshotPath })
      );
    })();

    return NextResponse.json({
      success: true,
      snapshotPath,
      imported: {
        tasks: importedTasks,
        accounts: importedAccounts,
        transactions: importedTxs,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
