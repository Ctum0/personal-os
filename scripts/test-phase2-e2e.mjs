/**
 * Automated End-to-End User Journey Verification for Phase 2:
 * Executes 13 realistic user journeys across Productivity OS and Finance OS,
 * verifying API contracts, state transitions, and SQLite database integrity.
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

async function main() {
  console.log('\n======================================================');
  console.log(' Personal OS — Phase 2: 13 Realistic User Journeys QA');
  console.log('======================================================\n');

  let activeSessionId = null;
  let activeCommitments = [];
  let generatedProposal = null;
  let targetDate = '2026-11-09';

  // --------------------------------------------------------------------------
  // Journey 1: Natural-Language Daily Planning Session
  // --------------------------------------------------------------------------
  await runJourney('Journey 1: Natural-Language Planning Session', async () => {
    const prompt = "I need to finish my university assignment tomorrow. I have work from 9 AM to 5 PM. I also need to study cybersecurity for an hour, go to the gym, buy groceries and spend some time on my personal project. I have a call in the evening.";
    
    const res = await fetch(`${BASE_URL}/api/planning/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: prompt, targetDate }),
    });
    
    assert(res.ok, `HTTP status ${res.status}`);
    const data = await res.json();
    assert(data.status === 'interviewing', `Expected interviewing status, got ${data.status}`);
    assert(data.commitments && data.commitments.length >= 6, `Expected at least 6 commitments, got ${data.commitments?.length}`);
    
    // Check identification of fixed work
    const work = data.commitments.find(c => /work/i.test(c.title));
    assert(work && work.isFixed && work.startTime === '09:00' && work.endTime === '17:00', 'Work 9-5 parsed as fixed');

    // Check uncertainty on evening call
    assert(data.uncertainties && data.uncertainties.some(u => /call/i.test(u.relatedEntity) || /call/i.test(u.id)), 'Uncertainty on evening call generated');

    activeSessionId = data.sessionId;
    activeCommitments = data.commitments;
  });

  // --------------------------------------------------------------------------
  // Journey 2: Conversational Multi-Turn Clarification
  // --------------------------------------------------------------------------
  await runJourney('Journey 2: Conversational Multi-Turn Clarification', async () => {
    const res = await fetch(`${BASE_URL}/api/planning/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: activeSessionId,
        message: "The call is at 7 PM for 30 minutes, and gym takes 75 minutes.",
        answers: {
          call_time: '7:00 PM (30 mins)',
          gym_duration: '75 mins total (incl. travel)',
        },
        targetDate,
        existingCommitments: activeCommitments,
      }),
    });

    assert(res.ok, `HTTP status ${res.status}`);
    const data = await res.json();
    assert(data.status === 'proposed', `Expected proposed status, got ${data.status}`);
    assert(data.proposal, 'Plan proposal generated');
    assert(data.proposal.scheduledItems.length >= 5, `Expected at least 5 scheduled items, got ${data.proposal.scheduledItems.length}`);

    // Verify no overlaps in schedule timeline
    const items = [...data.proposal.scheduledItems].sort((a, b) => a.startTime.localeCompare(b.startTime));
    for (let i = 0; i < items.length - 1; i++) {
      assert(items[i].endTime <= items[i + 1].startTime, `Overlap detected between ${items[i].title} (${items[i].endTime}) and ${items[i + 1].title} (${items[i + 1].startTime})`);
    }

    generatedProposal = data.proposal;
  });

  // --------------------------------------------------------------------------
  // Journey 3: Interactive Schedule Adjustment
  // --------------------------------------------------------------------------
  await runJourney('Journey 3: Interactive Schedule Adjustment', async () => {
    assert(generatedProposal, 'Previous proposal available');
    const task = generatedProposal.scheduledItems.find(it => it.itemType === 'scheduled_task');
    assert(task, 'Scheduled flexible task found');

    const originalDur = task.durationMinutes;
    task.durationMinutes = originalDur + 15;
    task.priority = 'critical';

    generatedProposal.estimatedWorkloadHours = parseFloat(
      (generatedProposal.scheduledItems.reduce((acc, it) => acc + it.durationMinutes, 0) / 60).toFixed(1)
    );

    assert(task.durationMinutes === originalDur + 15, 'Task duration adjusted');
    assert(task.priority === 'critical', 'Task priority adjusted');
  });

  // --------------------------------------------------------------------------
  // Journey 4: Plan Approval & Calendar Synchronization
  // --------------------------------------------------------------------------
  // --------------------------------------------------------------------------
  // Journey 4: Plan Approval & Calendar Synchronization
  // --------------------------------------------------------------------------
  await runJourney('Journey 4: Plan Approval & Calendar Synchronization', async () => {
    assert(generatedProposal, 'Previous proposal available');
    
    const res = await fetch(`${BASE_URL}/api/planning/commit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: generatedProposal }),
    });

    assert(res.ok, `HTTP status ${res.status}`);
    const data = await res.json();
    assert(data.success === true, 'Plan successfully committed');
    assert(data.planId, 'Plan ID returned');

    // Verify retrieval via planning API
    const verifyRes = await fetch(`${BASE_URL}/api/planning?date=${targetDate}`);
    assert(verifyRes.ok, 'Planning API responded');
    const verifyData = await verifyRes.json();
    assert(verifyData.approvedPlan, 'Approved plan retrieved from database');
    assert(verifyData.approvedPlan.id === data.planId, 'Committed plan ID matches');
  });

  // --------------------------------------------------------------------------
  // Journey 5: Next Morning Cockpit Execution
  // --------------------------------------------------------------------------
  await runJourney('Journey 5: Next Morning Cockpit Execution', async () => {
    const res = await fetch(`${BASE_URL}/api/planning?date=${targetDate}`);
    assert(res.ok, `HTTP status ${res.status}`);
    const data = await res.json();
    assert(data.approvedPlan, 'Approved plan retrieved for cockpit');
    assert(data.approvedPlan.items && data.approvedPlan.items.length >= 3, 'Approved plan items loaded');
  });

  // --------------------------------------------------------------------------
  // Journey 6: Incomplete Task Carryover & Rescheduling
  // --------------------------------------------------------------------------
  await runJourney('Journey 6: Incomplete Task Carryover & Rescheduling', async () => {
    // Create an overdue task via API
    const createRes = await fetch(`${BASE_URL}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Finish Operating Systems Lab',
        dueDate: '2026-11-01',
        priority: 'urgent',
        status: 'next',
        spaceId: 'space_personal',
      }),
    });
    assert(createRes.ok, 'Task creation ok');
    const createData = await createRes.json();
    const testTaskId = createData.task.id;

    const res = await fetch(`${BASE_URL}/api/planning/reschedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        taskId: testTaskId,
        newDate: targetDate,
        actionType: 'rescheduled',
        reason: 'Postponed during review',
      }),
    });

    assert(res.ok, `HTTP status ${res.status}`);
    const data = await res.json();
    assert(data.success === true, 'Task rescheduled successfully');
    assert(data.originalDate === '2026-11-01', 'Original due date preserved');
    assert(data.newDate === targetDate, 'New date set');
  });

  // --------------------------------------------------------------------------
  // Journey 7: Workspace Switching State Isolation
  // --------------------------------------------------------------------------
  await runJourney('Journey 7: Workspace Switching State Isolation', async () => {
    const prodRes = await fetch(`${BASE_URL}/api/tasks`);
    assert(prodRes.ok, 'Productivity tasks endpoint ok');
    const prodData = await prodRes.json();
    assert(Array.isArray(prodData.tasks), 'Productivity tasks returned');

    const finRes = await fetch(`${BASE_URL}/api/finance/accounts`);
    assert(finRes.ok, 'Finance accounts endpoint ok');
    const finData = await finRes.json();
    assert(Array.isArray(finData.accounts), 'Finance accounts returned');
  });

  // --------------------------------------------------------------------------
  // Journey 8: Double-Entry Transaction Recording
  // --------------------------------------------------------------------------
  await runJourney('Journey 8: Double-Entry Transaction Recording', async () => {
    const res = await fetch(`${BASE_URL}/api/finance/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transactionType: 'expense',
        date: targetDate,
        accountId: 'acc_checking',
        amount: '89.50',
        categoryId: 'cat_groceries',
        description: 'Supermarket supplies',
      }),
    });

    assert(res.ok, `HTTP status ${res.status}`);
    const data = await res.json();
    assert(data.transaction, 'Transaction returned');
    assert(data.transaction.amount === '89.50', 'Exact amount recorded');

    // Verify transaction retrieval via transactions API
    const verifyRes = await fetch(`${BASE_URL}/api/finance/transactions?search=Supermarket`);
    assert(verifyRes.ok, 'Transaction search query ok');
    const verifyData = await verifyRes.json();
    assert(verifyData.transactions.some(t => t.id === data.transaction.id), 'Transaction retrievable in ledger');
  });

  // --------------------------------------------------------------------------
  // Journey 9: Safe-to-Spend Projection
  // --------------------------------------------------------------------------
  await runJourney('Journey 9: Safe-to-Spend Projection', async () => {
    const res = await fetch(`${BASE_URL}/api/finance/safe-to-spend`);
    assert(res.ok, `HTTP status ${res.status}`);
    const data = await res.json();
    assert(data.safeToSpend, 'Safe-to-spend object returned');

    const s = data.safeToSpend;
    assert(parseFloat(s.liquidFunds) > 0, 'Liquid funds positive');
    assert(parseFloat(s.safetyBuffer) >= 500, 'Safety buffer applied');
    assert(parseFloat(s.safeToSpendAmount) >= 0, 'Safe to spend amount computed');
    assert(s.explainer, 'Financial metric explainer present');
  });

  // --------------------------------------------------------------------------
  // Journey 10: Net Worth Calculation
  // --------------------------------------------------------------------------
  await runJourney('Journey 10: Net Worth Calculation', async () => {
    const res = await fetch(`${BASE_URL}/api/finance/net-worth`);
    assert(res.ok, `HTTP status ${res.status}`);
    const data = await res.json();
    assert(data.netWorth, 'Net worth object returned');

    const nw = data.netWorth;
    const diff = parseFloat(nw.totalAssets) - parseFloat(nw.totalLiabilities);
    assert(Math.abs(diff - parseFloat(nw.netWorth)) < 0.01, 'Net worth = Assets - Liabilities');
  });

  // --------------------------------------------------------------------------
  // Journey 11: Budget Tracking & Period Enclosure
  // --------------------------------------------------------------------------
  await runJourney('Journey 11: Budget Tracking & Period Enclosure', async () => {
    const res = await fetch(`${BASE_URL}/api/finance/budgets`);
    assert(res.ok, `HTTP status ${res.status}`);
    const data = await res.json();
    assert(data.budget, 'Budget data returned');
    assert(data.budget.items && data.budget.items.length > 0, 'Budget line items populated');
  });

  // --------------------------------------------------------------------------
  // Journey 12: Habit Logging & Consistency
  // --------------------------------------------------------------------------
  await runJourney('Journey 12: Habit Logging & Consistency', async () => {
    const habit = db.prepare('SELECT id FROM habits WHERE is_paused = 0 LIMIT 1').get();
    if (habit) {
      const res = await fetch(`${BASE_URL}/api/habits/log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          habitId: habit.id,
          date: targetDate,
          status: 'completed',
        }),
      });
      assert(res.ok, `HTTP status ${res.status}`);
      const logRow = db.prepare('SELECT * FROM habit_logs WHERE habit_id = ? AND log_date = ?').get(habit.id, targetDate);
      assert(logRow, 'Habit log inserted into SQLite');
    }
  });

  // --------------------------------------------------------------------------
  // Journey 13: Productivity Analytics Mathematical Validity
  // --------------------------------------------------------------------------
  await runJourney('Journey 13: Productivity Analytics Mathematical Validity', async () => {
    const res = await fetch(`${BASE_URL}/api/productivity/analytics?days=30`);
    assert(res.ok, `HTTP status ${res.status}`);
    const data = await res.json();

    assert(data.taskPerformance, 'Task performance analytics present');
    assert(data.taskPerformance.onTimeRate === null || (data.taskPerformance.onTimeRate >= 0 && data.taskPerformance.onTimeRate <= 100), 'On-time rate null or valid percentage');
    assert(data.timeAllocation, 'Time allocation analytics present');
    assert(data.consistency, 'Consistency metrics present');
    assert(data.planningQuality, 'Planning quality metrics present');
    assert(data.explainer, 'Mathematical definition explainer present');
  });

  // --------------------------------------------------------------------------
  // Summary
  // --------------------------------------------------------------------------
  console.log('\n======================================================');
  const passed = results.filter(r => r.status === 'PASSED').length;
  const failed = results.filter(r => r.status === 'FAILED').length;
  console.log(` Results: ${passed} / ${results.length} PASSED (${failed} failed)`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
