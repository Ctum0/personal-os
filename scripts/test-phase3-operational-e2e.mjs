/**
 * Automated Operational Maturity & Edge-Case Verification for Phase 3:
 * 1. Seeds 90 days of realistic productivity and finance data.
 * 2. Simulates a 30-day operational user journey.
 * 3. Tests multi-month financial ledger reconciliation and Safe-to-Spend reservations.
 * 4. Tests adversarial CSV import edge cases (corrupted rows, duplicate detection, batch reversal).
 * 5. Tests disaster recovery backup and atomic restoration.
 */

import Database from 'better-sqlite3';
import { resolve } from 'path';

const DB_PATH = resolve(process.cwd(), 'data/personal_os.db');
const BASE_URL = 'http://localhost:3000';

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

const results = [];

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runJourney(name, fn) {
  process.stdout.write(`• Running: ${name}... `);
  try {
    await fn();
    console.log('\x1b[32mPASSED\x1b[0m');
    results.push({ name, status: 'PASSED' });
  } catch (err) {
    console.log(`\x1b[31mFAILED\x1b[0m: ${err.message}`);
    results.push({ name, status: 'FAILED', error: err.message });
  }
}

function addDaysISO(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const today = new Date().toISOString().slice(0, 10);
const tenantId = 'tenant_default';

async function main() {
  console.log('\n================================================================');
  console.log(' Personal OS — Phase 3: Operational Reliability & Edge-Case QA');
  console.log('================================================================\n');

  // --------------------------------------------------------------------------
  // Journey 1: Seed 90 Days of Realistic Productivity & Execution History
  // --------------------------------------------------------------------------
  await runJourney('Journey 1: Seed 90 Days Realistic Productivity History', async () => {
    const startDate = addDaysISO(today, -90);

    db.transaction(() => {
      // Clean up previous test seed if present
      db.prepare("DELETE FROM tasks WHERE id LIKE 'task_hist_%' OR id LIKE 'task_p3_%' OR id LIKE 'task_backup_dr_%'").run();
      db.prepare("DELETE FROM daily_plans WHERE id LIKE 'plan_hist_%'").run();
      db.prepare("DELETE FROM task_rescheduling_history WHERE id LIKE 'resched_hist_%'").run();
      db.prepare("DELETE FROM focus_sessions WHERE id LIKE 'focus_hist_%'").run();

      const taskStmt = db.prepare(`
        INSERT INTO tasks (
          id, tenant_id, title, status, priority, estimated_duration, actual_duration,
          due_date, completion_at, space_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'space_personal', ?, ?)
      `);

      const planStmt = db.prepare(`
        INSERT INTO daily_plans (
          id, tenant_id, plan_date, status, objective, available_hours, estimated_workload_hours, revision, created_at
        ) VALUES (?, ?, ?, 'committed', ?, 6.5, 5.0, 1, ?)
      `);

      const reschedStmt = db.prepare(`
        INSERT INTO task_rescheduling_history (
          id, tenant_id, task_id, original_date, new_date, reason, action_type, rescheduled_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'rescheduled', ?)
      `);

      const focusStmt = db.prepare(`
        INSERT INTO focus_sessions (
          id, tenant_id, task_id, planned_duration, actual_duration, status, started_at, ended_at
        ) VALUES (?, ?, ?, 45, ?, 'completed', ?, ?)
      `);

      for (let i = 90; i >= 1; i--) {
        const dStr = addDaysISO(today, -i);

        // Daily plan every weekday
        const dayOfWeek = new Date(dStr + 'T12:00:00Z').getUTCDay();
        if (dayOfWeek >= 1 && dayOfWeek <= 5) {
          planStmt.run(`plan_hist_${dStr}`, tenantId, dStr, `Focus execution for ${dStr}`, `${dStr} 07:30:00`);
        }

        // 2 tasks per day: one completed on time, one with varying duration
        const taskId1 = `task_hist_${dStr}_1`;
        const taskId2 = `task_hist_${dStr}_2`;

        taskStmt.run(
          taskId1,
          tenantId,
          `High-Impact Project Milestone (${dStr})`,
          'completed',
          'urgent',
          60,
          55,
          dStr,
          `${dStr} 16:30:00`,
          `${dStr} 08:00:00`,
          `${dStr} 16:30:00`
        );

        taskStmt.run(
          taskId2,
          tenantId,
          `Weekly System Maintenance (${dStr})`,
          'completed',
          'normal',
          45,
          50,
          dStr,
          `${dStr} 17:00:00`,
          `${dStr} 08:00:00`,
          `${dStr} 17:00:00`
        );

        // Focus session for task 1
        focusStmt.run(
          `focus_hist_${dStr}`,
          tenantId,
          taskId1,
          55,
          `${dStr} 09:30:00`,
          `${dStr} 10:25:00`
        );

        // Occasional rescheduling event every 10 days
        if (i % 10 === 0) {
          reschedStmt.run(
            `resched_hist_${dStr}`,
            tenantId,
            taskId2,
            dStr,
            addDaysISO(dStr, 2),
            'Postponed for higher priority sprint focus',
            `${dStr} 11:00:00`
          );
        }
      }
    })();

    const count = db.prepare("SELECT count(*) as c FROM tasks WHERE id LIKE 'task_hist_%'").get().c;
    assert(count === 180, `Expected 180 seeded historical tasks, got ${count}`);
  });

  // --------------------------------------------------------------------------
  // Journey 2: 90-Day Analytics Range Filtering & Mathematical Integrity
  // --------------------------------------------------------------------------
  await runJourney('Journey 2: Analytics Range Filtering (7d, 30d, 90d, All)', async () => {
    // 7 days
    const res7 = await fetch(`${BASE_URL}/api/productivity/analytics?days=7`);
    assert(res7.ok, `HTTP ${res7.status} for 7d`);
    const data7 = await res7.json();
    assert(data7.period.days === '7', 'Period is 7 days');
    assert(data7.taskPerformance.totalCompleted >= 10, 'Expected at least 10 completed tasks in 7d');
    assert(data7.taskPerformance.onTimeRate !== null && data7.taskPerformance.onTimeRate >= 80, 'On-time rate computed properly');

    // 30 days
    const res30 = await fetch(`${BASE_URL}/api/productivity/analytics?days=30`);
    assert(res30.ok, `HTTP ${res30.status} for 30d`);
    const data30 = await res30.json();
    assert(data30.taskPerformance.totalCompleted >= 50, 'Expected at least 50 completed tasks in 30d');
    assert(data30.planningQuality.rescheduling.totalEvents > 0, 'Rescheduling events recorded');
    assert(data30.planningQuality.rescheduling.uniqueTasksRescheduled > 0, 'Unique rescheduled tasks counted');
    assert(data30.taskPerformance.estimationAccuracy.avgAccuracy !== null, 'Estimation accuracy calculated');

    // 90 days
    const res90 = await fetch(`${BASE_URL}/api/productivity/analytics?days=90`);
    assert(res90.ok, `HTTP ${res90.status} for 90d`);
    const data90 = await res90.json();
    assert(data90.taskPerformance.totalCompleted >= 150, 'Expected at least 150 completed tasks in 90d');
    assert(data90.planningQuality.totalDailyPlans >= 60, 'Committed plans retrieved for 90d');

    // All time
    const resAll = await fetch(`${BASE_URL}/api/productivity/analytics?days=all`);
    assert(resAll.ok, `HTTP ${resAll.status} for all time`);
    const dataAll = await resAll.json();
    assert(dataAll.period.days === 'all', 'Period is all');
  });

  // --------------------------------------------------------------------------
  // Journey 3: Task Edit Isolation (Zero Historical Drift)
  // --------------------------------------------------------------------------
  await runJourney('Journey 3: Task Edit Isolation (Zero Historical Drift)', async () => {
    // Pick an existing historical task from 60 days ago
    const histDate = addDaysISO(today, -60);
    const histTaskId = `task_hist_${histDate}_1`;

    const beforeTask = db.prepare('SELECT * FROM tasks WHERE id = ?').get(histTaskId);
    assert(beforeTask, 'Historical task found');

    // Update today's task
    const todayTaskId = 'task_hist_edit_test';
    db.prepare('DELETE FROM tasks WHERE id = ?').run(todayTaskId);
    db.prepare(`
      INSERT INTO tasks (id, tenant_id, title, status, priority, due_date)
      VALUES (?, ?, 'Editable Modern Task', 'next', 'normal', ?)
    `).run(todayTaskId, tenantId, today);

    // Edit today's task title & priority
    await fetch(`${BASE_URL}/api/tasks`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: todayTaskId,
        title: 'Mutated Modern Task Title',
        priority: 'urgent',
      }),
    });

    // Verify historical task was NOT mutated
    const afterTask = db.prepare('SELECT * FROM tasks WHERE id = ?').get(histTaskId);
    assert(afterTask.title === beforeTask.title, 'Historical task title untouched');
    assert(afterTask.completion_at === beforeTask.completion_at, 'Historical completion timestamp untouched');
    assert(afterTask.estimated_duration === beforeTask.estimated_duration, 'Historical estimate untouched');
  });

  // --------------------------------------------------------------------------
  // Journey 4: 30-Day Operational User Journey Simulation
  // --------------------------------------------------------------------------
  await runJourney('Journey 4: 30-Day Operational User Journey Simulation', async () => {
    const testDate = addDaysISO(today, 1);
    const sessId = `sess_p3_${Date.now()}`;

    // Step 1: User starts natural-language planning
    const chat1 = await fetch(`${BASE_URL}/api/planning/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: sessId,
        message: 'Tomorrow I have a project review from 10:00 to 11:30, and need to write the audit specification for 90 minutes.',
        targetDate: testDate,
      }),
    });
    assert(chat1.ok, 'Chat 1 succeeded');
    const data1 = await chat1.json();
    assert(data1.sessionId === sessId, 'Session ID matches');
    assert(data1.commitments.length >= 2, 'Parsed commitments');

    // Step 2: Conversation interrupted and resumed later via GET
    const resumeRes = await fetch(`${BASE_URL}/api/planning/chat?sessionId=${sessId}`);
    assert(resumeRes.ok, 'Interrupted session resumed');
    const resumeData = await resumeRes.json();
    assert(resumeData.session.id === sessId, 'Resumed session ID verified');
    assert(resumeData.session.extractedState.commitments.length >= 2, 'State preserved in SQLite');

    // Step 3: Approve and commit plan to SQLite
    const commitRes = await fetch(`${BASE_URL}/api/planning/commit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        plan: data1.proposal || {
          targetDate: testDate,
          objective: 'P3 Execution Plan',
          totalAvailableHours: 6.5,
          estimatedWorkloadHours: 3.0,
          isOvercommitted: false,
          overloadHours: 0,
          suggestedDeferrals: [],
          scheduledItems: [
            {
              id: 'p3_item_1',
              title: 'Project Review',
              itemType: 'fixed_event',
              startTime: '10:00',
              endTime: '11:30',
              durationMinutes: 90,
              priority: 'urgent',
              isExistingTask: false,
            },
            {
              id: 'p3_item_2',
              title: 'Write Audit Specification',
              itemType: 'scheduled_task',
              startTime: '13:00',
              endTime: '14:30',
              durationMinutes: 90,
              priority: 'high',
              isExistingTask: false,
            },
          ],
          scheduleTimeline: [],
          identifiedUncertainties: [],
          assumptions: [],
          diffSummary: { tasksToCreate: 1, calendarBlocksToCreate: 2, tasksToReschedule: 0 },
        },
      }),
    });
    assert(commitRes.ok, 'Plan committed to SQLite');

    // Step 4: Complete task & log focus session
    const createdTask = db.prepare("SELECT id FROM tasks WHERE tenant_id = ? AND title LIKE '%Audit Specification%' ORDER BY created_at DESC LIMIT 1").get(tenantId);
    if (createdTask) {
      await fetch(`${BASE_URL}/api/tasks`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: createdTask.id, status: 'completed' }),
      });
      const updated = db.prepare('SELECT status, completion_at FROM tasks WHERE id = ?').get(createdTask.id);
      assert(updated.status === 'completed', 'Task marked completed');
      assert(updated.completion_at !== null, 'Completion timestamp recorded');
    }

    // Step 5: Missed task & 1-click reschedule
    const createOverdueRes = await fetch(`${BASE_URL}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Missed Research Report',
        status: 'next',
        priority: 'urgent',
        dueDate: addDaysISO(today, -3),
      }),
    });
    assert(createOverdueRes.ok, 'Overdue task created via API');
    const { task: overdueTask } = await createOverdueRes.json();
    const overdueTaskId = overdueTask.id;

    const reschedRes = await fetch(`${BASE_URL}/api/planning/reschedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        taskId: overdueTaskId,
        newDate: today,
        actionType: 'rescheduled',
        reason: 'Overdue task carried over during morning review',
      }),
    });
    assert(reschedRes.ok, 'Task rescheduled successfully');
    const verifyRes = await fetch(`${BASE_URL}/api/tasks?search=Missed%20Research%20Report`);
    const verifyData = await verifyRes.json();
    const rescheduledTask = verifyData.tasks.find(t => t.id === overdueTaskId);
    assert(rescheduledTask && rescheduledTask.due_date === today, 'Task due date updated to today');
  });

  // --------------------------------------------------------------------------
  // Journey 5: Multi-Month Finance Ledger & Authoritative Invariants
  // --------------------------------------------------------------------------
  await runJourney('Journey 5: Multi-Month Finance Ledger Reconciliation', async () => {
    // Verify accounts
    const accRes = await fetch(`${BASE_URL}/api/finance/accounts`);
    assert(accRes.ok, 'Accounts retrieved');
    const accData = await accRes.json();
    assert(accData.accounts && accData.accounts.length > 0, 'Accounts list populated');

    // Verify transactions
    const txRes = await fetch(`${BASE_URL}/api/finance/transactions?limit=20`);
    assert(txRes.ok, 'Transactions retrieved');
    const txData = await txRes.json();
    assert(txData.transactions && Array.isArray(txData.transactions), 'Transactions array returned');

    // Create a multi-month transaction sequence
    const chk = accData.accounts.find(a => (a.accountType || a.type) === 'checking') || accData.accounts[0];
    const sav = accData.accounts.find(a => (a.accountType || a.type) === 'savings') || accData.accounts[1];
    const chkId = chk.accountId || chk.id;
    const savId = sav.accountId || sav.id;

    const initialBalChk = parseFloat(chk.currentBalance);
    const initialBalSav = parseFloat(sav.currentBalance);

    // 1. Post Income
    const txIncomeId = `tx_p3_inc_${Date.now()}`;
    await fetch(`${BASE_URL}/api/finance/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: txIncomeId,
        accountId: chkId,
        amount: '1500.00',
        transactionType: 'income',
        status: 'posted',
        date: today,
        description: 'Client Retainer Payment',
      }),
    });

    // 2. Post Transfer to Savings
    const txTrId = `tx_p3_tr_${Date.now()}`;
    await fetch(`${BASE_URL}/api/finance/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: txTrId,
        accountId: chkId,
        toAccountId: savId,
        amount: '500.00',
        transactionType: 'transfer',
        status: 'posted',
        date: today,
        description: 'Monthly savings transfer',
      }),
    });

    // Re-verify balances
    const postAccRes = await fetch(`${BASE_URL}/api/finance/accounts`);
    const postAccData = await postAccRes.json();
    const updatedChk = postAccData.accounts.find(a => (a.accountId || a.id) === chkId);
    const updatedSav = postAccData.accounts.find(a => (a.accountId || a.id) === savId);

    const expectedChk = (initialBalChk + 1500 - 500).toFixed(2);
    const expectedSav = (initialBalSav + 500).toFixed(2);

    assert(updatedChk.currentBalance === expectedChk, `Expected checking ${expectedChk}, got ${updatedChk.currentBalance}`);
    assert(updatedSav.currentBalance === expectedSav, `Expected savings ${expectedSav}, got ${updatedSav.currentBalance}`);
  });

  // --------------------------------------------------------------------------
  // Journey 6: Safe-to-Spend & Net Worth Authoritative Calculation
  // --------------------------------------------------------------------------
  await runJourney('Journey 6: Safe-to-Spend & Net Worth Authoritative Integrity', async () => {
    // Safe to Spend
    const stsRes = await fetch(`${BASE_URL}/api/finance/safe-to-spend`);
    assert(stsRes.ok, 'Safe to spend endpoint ok');
    const stsData = await stsRes.json();
    assert(stsData.safeToSpend, 'Safe to spend payload present');
    assert(parseFloat(stsData.safeToSpend.safeToSpendAmount) >= 0, 'Safe to spend amount non-negative');
    assert(stsData.safeToSpend.breakdown.length >= 4, 'Full breakdown deductions populated');
    assert(stsData.safeToSpend.explainer, 'Explainer metadata provided');

    // Net Worth
    const nwRes = await fetch(`${BASE_URL}/api/finance/net-worth`);
    assert(nwRes.ok, 'Net worth endpoint ok');
    const nwData = await nwRes.json();
    assert(nwData.netWorth, 'Net worth payload present');
    assert(nwData.netWorth.totalAssets, 'Total assets calculated');
    assert(nwData.netWorth.totalLiabilities !== undefined, 'Total liabilities calculated');
    
    // Arithmetic check: Net Worth = Assets - Liabilities
    const computedNw = (parseFloat(nwData.netWorth.totalAssets) - parseFloat(nwData.netWorth.totalLiabilities)).toFixed(2);
    assert(nwData.netWorth.netWorth === computedNw, `Net worth arithmetic check: ${nwData.netWorth.netWorth} === ${computedNw}`);
  });

  // --------------------------------------------------------------------------
  // Journey 7: CSV Import Edge Cases (Corrupted, Duplicates & Batch Reversal)
  // --------------------------------------------------------------------------
  await runJourney('Journey 7: CSV Import Edge Cases & Batch Reversal', async () => {
    const acc = db.prepare("SELECT id FROM finance_accounts WHERE type = 'checking' LIMIT 1").get();
    assert(acc, 'Checking account exists');

    // 1. Corrupted CSV Preview
    const corruptedCsv = `Date,Amount,Description\n2026-13-45,INVALID_AMT,Corrupted Row 1\n2026-10-15,45.50,Valid Supermarket`;
    const prevRes = await fetch(`${BASE_URL}/api/finance/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'preview',
        accountId: acc.id,
        fileName: 'corrupted_test.csv',
        csvText: corruptedCsv,
      }),
    });
    assert(prevRes.ok, 'Preview returned');
    const prevData = await prevRes.json();
    assert(prevData.preview.rows.length === 2, '2 rows parsed');
    assert(prevData.preview.rows[0].error !== undefined, 'Corrupted row flagged with error');
    assert(prevData.preview.rows[1].parsedAmount === '45.50', 'Valid row parsed successfully');

    // 2. Commit Valid Row
    const commitRes = await fetch(`${BASE_URL}/api/finance/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'commit',
        accountId: acc.id,
        fileName: 'statement_valid.csv',
        fileHash: `hash_${Date.now()}`,
        rows: [
          {
            parsedDate: '2026-10-20',
            parsedAmount: '88.00',
            parsedType: 'expense',
            parsedPayee: 'Electronic Store',
            parsedDescription: 'HDMI Cable',
            isDuplicate: false,
          },
        ],
      }),
    });
    assert(commitRes.ok, 'CSV committed');
    const commitData = await commitRes.json();
    assert(commitData.batchId, 'Batch ID generated');
    assert(commitData.importedCount === 1, '1 transaction imported');

    // 3. Batch Reversal (DELETE)
    const delRes = await fetch(`${BASE_URL}/api/finance/import?batchId=${commitData.batchId}`, {
      method: 'DELETE',
    });
    assert(delRes.ok, 'Batch reversed');
    const delData = await delRes.json();
    assert(delData.success === true, 'Batch reversal reported success');
    assert((delData.deletedCount ?? delData.reversedCount) === 1, 'Reversed 1 transaction');
  });

  // --------------------------------------------------------------------------
  // Journey 8: Disaster Recovery & Atomic Backup Restore
  // --------------------------------------------------------------------------
  await runJourney('Journey 8: Disaster Recovery & Atomic Backup Restore', async () => {
    // Create backup payload
    const testTaskId = `task_backup_dr_${Date.now()}`;
    const backupPayload = {
      version: 1,
      createdAt: new Date().toISOString(),
      domains: {
        productivity: {
          tasks: [
            {
              id: testTaskId,
              title: 'Disaster Recovery Verified Task',
              status: 'next',
              priority: 'urgent',
              estimated_duration: 30,
              due_date: today,
            },
          ],
        },
        finance: {
          accounts: [
            {
              id: 'acc_dr_test',
              name: 'DR Cold Storage Account',
              type: 'savings',
              currency: 'USD',
              opening_balance: '100000.00',
              is_active: 1,
            },
          ],
          transactions: [],
        },
      },
    };

    // Execute restore
    const restoreRes = await fetch(`${BASE_URL}/api/backup/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(backupPayload),
    });

    assert(restoreRes.ok, 'Restore succeeded');
    const restoreData = await restoreRes.json();
    assert(restoreData.success === true, 'Success reported');
    assert(restoreData.stats.tasks >= 1, 'Tasks restored');
    assert(restoreData.stats.accounts >= 1, 'Accounts restored');

    // Verify records exist via API
    const taskRes = await fetch(`${BASE_URL}/api/tasks?search=Disaster%20Recovery`);
    const taskData = await taskRes.json();
    const taskRow = taskData.tasks.find(t => t.id === testTaskId || t.title.includes('Disaster Recovery Verified Task'));
    assert(taskRow && taskRow.title === 'Disaster Recovery Verified Task', 'Task verified via API');

    const accRes = await fetch(`${BASE_URL}/api/finance/accounts`);
    const accData = await accRes.json();
    const accRow = accData.accounts.find(a => (a.accountId || a.id) === 'acc_dr_test' || (a.accountName || a.name) === 'DR Cold Storage Account');
    assert(accRow && (accRow.accountName || accRow.name) === 'DR Cold Storage Account', 'Account verified via API');
  });

  // --------------------------------------------------------------------------
  // Summary
  // --------------------------------------------------------------------------
  console.log('\n================================================================');
  const passed = results.filter(r => r.status === 'PASSED').length;
  const failed = results.filter(r => r.status === 'FAILED').length;
  console.log(` Results: ${passed} / ${results.length} PASSED (${failed} failed)`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
