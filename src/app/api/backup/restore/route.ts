import { NextResponse } from 'next/server';
import { getDb, snapshotDatabase, schemaVersion } from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';
import { readJson, isISODateString } from '@/lib/db/validate';
import { Decimal } from 'decimal.js';

const RESTORE_TX_TYPES = ['income', 'expense', 'transfer', 'refund'];

export async function POST(request: Request) {
  try {
    const session = getCurrentSession();
    const db = getDb();
    const parsedBody = await readJson(request);
    if ("error" in parsedBody) {
      return NextResponse.json({ error: parsedBody.error }, { status: parsedBody.status });
    }
    const body = parsedBody.data;

    if (!body || !body.domains) {
      return NextResponse.json({ error: 'Invalid backup file format: missing domains object' }, { status: 400 });
    }

    // Pre-restore snapshot for guaranteed disaster recovery (full DB, includes
    // weekly_reviews and every other table — nothing is lost by a bad import).
    const ver = schemaVersion(db);
    const snapshotPath = snapshotDatabase(db, ver);

    const { productivity, finance } = body.domains;
    let importedTasks = 0;
    let skippedTasks = 0;
    let importedAccounts = 0;
    let skippedAccounts = 0;
    let importedTxs = 0;
    let importedLines = 0;
    let skippedTxs = 0;
    let invalidTxs = 0;
    let importedReviews = 0;
    let skippedReviews = 0;

    db.transaction(() => {
      // 1. Restore productivity tasks if present (upsert-only: unrelated data
      //    outside the backup payloads is never touched or wiped).
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
            const due = t.due_date || null;
            if (due && !isISODateString(due)) {
              skippedTasks++;
              continue;
            }
            stmt.run(
              t.id,
              session.tenantId,
              t.title,
              t.description || null,
              t.status || 'inbox',
              t.priority || 'normal',
              t.estimated_duration || 0,
              t.actual_duration || 0,
              due,
              t.space_id || null,
              t.project_id || null,
              t.goal_id || null
            );
            importedTasks++;
          } else {
            skippedTasks++;
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
          let opening = '0.00';
          if (a.opening_balance !== undefined && a.opening_balance !== null && a.opening_balance !== '') {
            try {
              const d = new Decimal(a.opening_balance);
              if (!d.isFinite()) {
                skippedAccounts++;
                continue;
              }
              opening = d.toFixed(2);
            } catch {
              skippedAccounts++;
              continue;
            }
          }
          if (a.id && a.name) {
            accStmt.run(
              a.id,
              session.tenantId,
              a.name,
              a.type || 'checking',
              a.currency || 'USD',
              opening,
              a.is_active !== undefined ? a.is_active : 1,
              a.display_color || '#10b981'
            );
            importedAccounts++;
          } else {
            skippedAccounts++;
          }
        }
      }

      // 3. Restore finance transactions if present. Validated strictly: amount
      //    must be a positive finite decimal, type an allowed enum, date a real
      //    calendar date. Posted movements also get balanced journal_lines so
      //    the ledger invariant (every posted transaction has at least one
      //    matching asset-side line) is preserved by restore.
      if (finance?.transactions && Array.isArray(finance.transactions)) {
        const txStmt = db.prepare(`
          INSERT INTO journal_transactions (
            id, tenant_id, transaction_type, status, date, amount, currency, base_amount,
            account_id, to_account_id, category_id, payee_name, description
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            status = excluded.status,
            amount = excluded.amount,
            base_amount = excluded.base_amount,
            updated_at = datetime('now')
        `);
        const existingTx = db.prepare('SELECT id FROM journal_transactions WHERE id = ?');
        const lineStmt = db.prepare(`
          INSERT INTO journal_lines (id, tenant_id, transaction_id, account_id, entry_type, amount, currency, base_amount, description)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const existingLine = db.prepare('SELECT id FROM journal_lines WHERE id = ?');

        for (const tx of finance.transactions) {
          if (!tx || !tx.id) {
            invalidTxs++;
            continue;
          }
          let dec: Decimal;
          try {
            dec = new Decimal(tx.amount ?? 0);
          } catch {
            invalidTxs++;
            continue;
          }
          if (!dec.isFinite() || dec.lte(0)) {
            invalidTxs++;
            continue;
          }
          const type = tx.transaction_type || 'expense';
          if (!RESTORE_TX_TYPES.includes(type)) {
            invalidTxs++;
            continue;
          }
          const date = tx.date || new Date().toISOString().slice(0, 10);
          if (!isISODateString(date)) {
            invalidTxs++;
            continue;
          }

          const amountStr = dec.toFixed(2);
          const existed = existingTx.get(tx.id);
          txStmt.run(
            tx.id,
            session.tenantId,
            type,
            tx.status || 'posted',
            date,
            amountStr,
            tx.currency || 'USD',
            amountStr,
            tx.account_id || null,
            tx.to_account_id || null,
            tx.category_id || null,
            tx.payee || tx.payee_name || null,
            tx.description || ''
          );
          importedTxs++;

          if (existed) {
            // Upserted: lines already exist in the ledger; do not create again.
            continue;
          }
          if ((tx.status || 'posted') === 'posted') {
            const lines: Array<{ id: string; account: string | null; entry: string; desc: string }> = [];
            if (type === 'income' || type === 'refund') {
              lines.push({ id: `jl_${tx.id}_1`, account: tx.account_id, entry: 'debit', desc: `Restore: ${tx.description || type}` });
            } else if (type === 'expense') {
              lines.push({ id: `jl_${tx.id}_1`, account: tx.account_id, entry: 'credit', desc: `Restore: ${tx.description || type}` });
            } else if (type === 'transfer') {
              lines.push({ id: `jl_${tx.id}_1`, account: tx.account_id, entry: 'credit', desc: `Restore: transfer to ${tx.to_account_id}` });
              lines.push({ id: `jl_${tx.id}_2`, account: tx.to_account_id, entry: 'debit', desc: `Restore: transfer from ${tx.account_id}` });
            }
            for (const l of lines) {
              if (!l.account || existingLine.get(l.id)) continue;
              lineStmt.run(l.id, session.tenantId, tx.id, l.account, l.entry, amountStr, tx.currency || 'USD', amountStr, l.desc);
              importedLines++;
            }
          }
        }
      }

      // 4. Restore weekly reviews (authoritative store, migration v4)
      if (productivity?.weeklyReviews && Array.isArray(productivity.weeklyReviews)) {
        const reviewStmt = db.prepare(`
          INSERT INTO weekly_reviews (id, tenant_id, week_start, week_end, title, summary, payload, created_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(tenant_id, week_start) DO UPDATE SET
            title = excluded.title,
            summary = excluded.summary,
            payload = excluded.payload,
            updated_at = datetime('now')
        `);
        for (const r of productivity.weeklyReviews) {
          const weekStart = r?.weekStart || r?.week_start;
          if (!weekStart || !isISODateString(String(weekStart).slice(0, 10))) {
            skippedReviews++;
            continue;
          }
          let payloadJson = '{}';
          if (r.payload !== undefined) {
            try {
              payloadJson = JSON.stringify(typeof r.payload === 'object' && r.payload !== null ? r.payload : {});
            } catch {
              payloadJson = '{}';
            }
          }
          reviewStmt.run(
            r.id || `wrev_${session.tenantId}_${String(weekStart).slice(0, 10)}`,
            session.tenantId,
            String(weekStart).slice(0, 10),
            r.weekEnd || r.week_end || String(weekStart).slice(0, 10),
            r.title || null,
            typeof r.summary === 'string' ? r.summary : null,
            payloadJson,
            r.created_by || session.userId
          );
          importedReviews++;
        }
      }

      // Record audit event
      db.prepare(`
        INSERT INTO audit_events (id, tenant_id, actor_id, domain, action, entity_type, entity_id, changes)
        VALUES (?, ?, ?, 'platform', 'restore_backup', 'system_backup', 'all', ?)
      `).run(
        `aud_restore_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        session.tenantId,
        session.userId,
        JSON.stringify({ importedTasks, skippedTasks, importedAccounts, skippedAccounts, importedTxs, invalidTxs, importedLines, importedReviews, skippedReviews, snapshotPath })
      );
    })();

    const importStats = {
      tasks: importedTasks,
      accounts: importedAccounts,
      transactions: importedTxs,
      journalLines: importedLines,
      weeklyReviews: importedReviews,
    };
    const skippedStats = { tasks: skippedTasks, accounts: skippedAccounts, transactions: skippedTxs, invalidTransactions: invalidTxs, weeklyReviews: skippedReviews };

    return NextResponse.json({
      success: true,
      snapshotPath,
      imported: importStats,
      stats: importStats,
      skipped: skippedStats,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
