import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { todayISO } from "@/lib/time";
import { mkdirSync as __mkdirSync } from "node:fs";
import { dirname as __dirnameOf, join as __joinPath } from "node:path";
import { maybeRunMaintenance, registerDbPath } from "./maintenance";

// Database directory in project root; path is resolvable at call time so
// sandboxed tests and isolated profiles can override PERSONAL_OS_DB_PATH
// between invocations (used by backup/restore tooling too).
function resolveDbPath(): string {
  const configured = process.env.PERSONAL_OS_DB_PATH;
  if (configured) {
    __mkdirSync(__dirnameOf(configured), { recursive: true });
    return configured;
  }
  const DB_DIR = path.join(process.cwd(), 'data');
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }
  return path.join(DB_DIR, 'personal_os.db');
}

let dbInstance: Database.Database | null = null;
let dbInstancePath: string | null = null;

/** Current resolved live DB file path (exported for maintenance tooling). */
export function resolveLiveDbPath(): string {
  return resolveDbPath();
}

export function getDb(): Database.Database {
  const dbPath = resolveDbPath();
  if (!dbInstance || dbInstancePath !== dbPath) {
    dbInstance = new Database(dbPath);
    dbInstance.pragma('journal_mode = WAL');
    dbInstance.pragma('busy_timeout = 5000');
    dbInstance.pragma('foreign_keys = ON');
    runMigrations(dbInstance);
    dbInstancePath = dbPath;
    registerDbPath(dbPath);
    maybeRunMaintenance(dbInstance);
  }
  return dbInstance;
}

export function getInMemoryDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  initSchema(db);
  return db;
}

export function initSchema(db: Database.Database) {
  // Execute schema DDL inside transaction
  db.transaction(() => {
    // Common / SaaS foundation
    db.exec(`
      CREATE TABLE IF NOT EXISTS tenants (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        plan TEXT NOT NULL DEFAULT 'standard',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        email TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        avatar_url TEXT,
        preferences TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS tenant_memberships (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role TEXT NOT NULL DEFAULT 'owner',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS spaces (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        slug TEXT NOT NULL,
        icon TEXT NOT NULL DEFAULT 'Folder',
        color TEXT NOT NULL DEFAULT '#6366f1',
        description TEXT,
        is_default INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(tenant_id, slug)
      );

      CREATE TABLE IF NOT EXISTS tags (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        color TEXT NOT NULL DEFAULT '#64748b',
        domain TEXT NOT NULL DEFAULT 'all',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(tenant_id, name, domain)
      );

      CREATE TABLE IF NOT EXISTS custom_field_definitions (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        entity_type TEXT NOT NULL,
        name TEXT NOT NULL,
        field_key TEXT NOT NULL,
        field_type TEXT NOT NULL,
        options TEXT DEFAULT '[]',
        default_value TEXT,
        validation_rules TEXT DEFAULT '{}',
        is_required INTEGER NOT NULL DEFAULT 0,
        is_visible INTEGER NOT NULL DEFAULT 1,
        sort_order INTEGER NOT NULL DEFAULT 0,
        schema_version INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(tenant_id, entity_type, field_key)
      );

      CREATE TABLE IF NOT EXISTS custom_field_values (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        field_id TEXT NOT NULL REFERENCES custom_field_definitions(id) ON DELETE CASCADE,
        value TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(tenant_id, entity_type, entity_id, field_id)
      );

      CREATE TABLE IF NOT EXISTS saved_views (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        entity_type TEXT NOT NULL,
        name TEXT NOT NULL,
        filters TEXT NOT NULL DEFAULT '{}',
        sorts TEXT NOT NULL DEFAULT '[]',
        grouping TEXT NOT NULL DEFAULT '{}',
        visible_columns TEXT NOT NULL DEFAULT '[]',
        density TEXT NOT NULL DEFAULT 'standard',
        display_mode TEXT NOT NULL DEFAULT 'table',
        is_default INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS dashboard_layouts (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        workspace TEXT NOT NULL,
        name TEXT NOT NULL,
        is_default INTEGER NOT NULL DEFAULT 1,
        widgets TEXT NOT NULL DEFAULT '[]',
        schema_version INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS templates (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        entity_type TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        content TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS audit_events (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        actor_id TEXT,
        domain TEXT NOT NULL,
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        changes TEXT DEFAULT '{}',
        metadata TEXT DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'info',
        link TEXT,
        is_read INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      -- Productivity domain
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        space_id TEXT REFERENCES spaces(id) ON DELETE SET NULL,
        goal_id TEXT,
        name TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        objective TEXT,
        definition_of_done TEXT,
        start_date TEXT,
        target_date TEXT,
        progress_method TEXT NOT NULL DEFAULT 'completion',
        manual_progress INTEGER NOT NULL DEFAULT 0,
        color TEXT NOT NULL DEFAULT '#3b82f6',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS project_milestones (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        description TEXT,
        target_date TEXT,
        is_completed INTEGER NOT NULL DEFAULT 0,
        completed_at TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS goals (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        space_id TEXT REFERENCES spaces(id) ON DELETE SET NULL,
        title TEXT NOT NULL,
        description TEXT,
        type TEXT NOT NULL DEFAULT 'numeric',
        start_value REAL NOT NULL DEFAULT 0,
        target_value REAL NOT NULL DEFAULT 100,
        current_value REAL NOT NULL DEFAULT 0,
        unit TEXT NOT NULL DEFAULT '%',
        direction TEXT NOT NULL DEFAULT 'ascending',
        progress_method TEXT NOT NULL DEFAULT 'log_latest',
        start_date TEXT,
        deadline TEXT,
        cadence TEXT NOT NULL DEFAULT 'quarterly',
        status TEXT NOT NULL DEFAULT 'in_progress',
        linked_savings_goal_id TEXT,
        color TEXT NOT NULL DEFAULT '#10b981',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS goal_progress_logs (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        goal_id TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
        value REAL NOT NULL,
        delta REAL NOT NULL DEFAULT 0,
        note TEXT,
        source TEXT NOT NULL DEFAULT 'manual',
        logged_at TEXT NOT NULL DEFAULT (datetime('now')),
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS task_series (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        recurrence_rule TEXT NOT NULL,
        start_date TEXT NOT NULL,
        end_date TEXT,
        timezone TEXT NOT NULL DEFAULT 'UTC',
        base_task_template TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        space_id TEXT REFERENCES spaces(id) ON DELETE SET NULL,
        project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
        goal_id TEXT REFERENCES goals(id) ON DELETE SET NULL,
        parent_task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
        series_id TEXT REFERENCES task_series(id) ON DELETE SET NULL,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'inbox',
        priority TEXT NOT NULL DEFAULT 'normal',
        due_date TEXT,
        due_time TEXT,
        start_date TEXT,
        start_time TEXT,
        estimated_duration INTEGER NOT NULL DEFAULT 0,
        actual_duration INTEGER NOT NULL DEFAULT 0,
        is_recurring INTEGER NOT NULL DEFAULT 0,
        recurrence_rule TEXT,
        completion_at TEXT,
        completion_metadata TEXT DEFAULT '{}',
        tags TEXT DEFAULT '[]',
        sort_order INTEGER NOT NULL DEFAULT 0,
        origin_plan_item_id TEXT,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS task_dependencies (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        depends_on_task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        dependency_type TEXT NOT NULL DEFAULT 'blocks',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(task_id, depends_on_task_id)
      );

      CREATE TABLE IF NOT EXISTS habits (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        space_id TEXT REFERENCES spaces(id) ON DELETE SET NULL,
        title TEXT NOT NULL,
        description TEXT,
        tracking_type TEXT NOT NULL DEFAULT 'boolean',
        unit TEXT NOT NULL DEFAULT 'times',
        target_value REAL NOT NULL DEFAULT 1,
        minimum_threshold REAL NOT NULL DEFAULT 1,
        ideal_target REAL NOT NULL DEFAULT 1,
        schedule_type TEXT NOT NULL DEFAULT 'daily',
        schedule_days TEXT NOT NULL DEFAULT '[1,2,3,4,5,6,7]',
        frequency_target INTEGER NOT NULL DEFAULT 1,
        time_of_day TEXT DEFAULT 'anytime',
        start_date TEXT NOT NULL DEFAULT (date('now')),
        end_date TEXT,
        is_paused INTEGER NOT NULL DEFAULT 0,
        pause_reason TEXT,
        color TEXT NOT NULL DEFAULT '#8b5cf6',
        icon TEXT NOT NULL DEFAULT 'CheckCircle2',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS habit_logs (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        habit_id TEXT NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
        log_date TEXT NOT NULL,
        value REAL NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'completed',
        notes TEXT,
        logged_at TEXT NOT NULL DEFAULT (datetime('now')),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(tenant_id, habit_id, log_date)
      );

      CREATE TABLE IF NOT EXISTS routines (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        space_id TEXT REFERENCES spaces(id) ON DELETE SET NULL,
        title TEXT NOT NULL,
        description TEXT,
        routine_type TEXT NOT NULL DEFAULT 'morning',
        schedule_time TEXT DEFAULT '07:00',
        days_of_week TEXT NOT NULL DEFAULT '[1,2,3,4,5,6,7]',
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS routine_steps (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        routine_id TEXT NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        duration_minutes INTEGER NOT NULL DEFAULT 10,
        habit_id TEXT REFERENCES habits(id) ON DELETE SET NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS calendar_events (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        space_id TEXT REFERENCES spaces(id) ON DELETE SET NULL,
        title TEXT NOT NULL,
        description TEXT,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        is_all_day INTEGER NOT NULL DEFAULT 0,
        event_type TEXT NOT NULL DEFAULT 'time_block',
        task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
        project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
        color TEXT DEFAULT '#3b82f6',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS focus_sessions (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
        project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
        planned_duration INTEGER NOT NULL DEFAULT 25,
        actual_duration INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'completed',
        notes TEXT,
        interruptions_count INTEGER NOT NULL DEFAULT 0,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS daily_plans (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        plan_date TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft',
        objective TEXT,
        available_hours REAL NOT NULL DEFAULT 8,
        estimated_workload_hours REAL NOT NULL DEFAULT 0,
        summary TEXT,
        revision INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(tenant_id, plan_date, revision)
      );

      CREATE TABLE IF NOT EXISTS daily_plan_items (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        plan_id TEXT NOT NULL REFERENCES daily_plans(id) ON DELETE CASCADE,
        task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
        title TEXT NOT NULL,
        item_type TEXT NOT NULL DEFAULT 'scheduled_task',
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        duration_minutes INTEGER NOT NULL DEFAULT 30,
        priority TEXT NOT NULL DEFAULT 'normal',
        status TEXT NOT NULL DEFAULT 'scheduled',
        sort_order INTEGER NOT NULL DEFAULT 0,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS task_rescheduling_history (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        original_date TEXT,
        new_date TEXT NOT NULL,
        reason TEXT,
        action_type TEXT NOT NULL DEFAULT 'rescheduled',
        rescheduled_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS ai_planning_sessions (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        target_date TEXT NOT NULL,
        conversation TEXT NOT NULL DEFAULT '[]',
        extracted_state TEXT NOT NULL DEFAULT '{}',
        proposed_plan TEXT,
        status TEXT NOT NULL DEFAULT 'interviewing',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      -- Finance domain
      CREATE TABLE IF NOT EXISTS finance_accounts (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'checking',
        currency TEXT NOT NULL DEFAULT 'USD',
        opening_balance TEXT NOT NULL DEFAULT '0.00',
        opening_date TEXT NOT NULL DEFAULT (date('now')),
        institution TEXT,
        masked_number TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        display_color TEXT NOT NULL DEFAULT '#10b981',
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'expense',
        parent_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
        icon TEXT NOT NULL DEFAULT 'Tag',
        color TEXT NOT NULL DEFAULT '#64748b',
        is_hidden INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(tenant_id, name, type)
      );

      CREATE TABLE IF NOT EXISTS payees (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        default_category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(tenant_id, name)
      );

      CREATE TABLE IF NOT EXISTS import_batches (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        account_id TEXT NOT NULL REFERENCES finance_accounts(id) ON DELETE CASCADE,
        file_name TEXT NOT NULL,
        file_hash TEXT NOT NULL,
        total_rows INTEGER NOT NULL DEFAULT 0,
        accepted_rows INTEGER NOT NULL DEFAULT 0,
        skipped_rows INTEGER NOT NULL DEFAULT 0,
        duplicate_rows INTEGER NOT NULL DEFAULT 0,
        column_mapping TEXT NOT NULL DEFAULT '{}',
        status TEXT NOT NULL DEFAULT 'committed',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS journal_transactions (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        transaction_type TEXT NOT NULL DEFAULT 'expense',
        date TEXT NOT NULL,
        account_id TEXT NOT NULL REFERENCES finance_accounts(id) ON DELETE CASCADE,
        to_account_id TEXT REFERENCES finance_accounts(id) ON DELETE SET NULL,
        amount TEXT NOT NULL,
        currency TEXT NOT NULL DEFAULT 'USD',
        base_amount TEXT NOT NULL,
        exchange_rate TEXT NOT NULL DEFAULT '1.000000',
        payee_id TEXT REFERENCES payees(id) ON DELETE SET NULL,
        payee_name TEXT,
        category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
        description TEXT NOT NULL,
        notes TEXT,
        status TEXT NOT NULL DEFAULT 'posted',
        is_reconciliation_adjustment INTEGER NOT NULL DEFAULT 0,
        import_batch_id TEXT REFERENCES import_batches(id) ON DELETE SET NULL,
        original_transaction_id TEXT REFERENCES journal_transactions(id) ON DELETE SET NULL,
        tags TEXT DEFAULT '[]',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS journal_lines (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        transaction_id TEXT NOT NULL REFERENCES journal_transactions(id) ON DELETE CASCADE,
        account_id TEXT NOT NULL REFERENCES finance_accounts(id) ON DELETE CASCADE,
        entry_type TEXT NOT NULL,
        amount TEXT NOT NULL,
        currency TEXT NOT NULL DEFAULT 'USD',
        base_amount TEXT NOT NULL,
        description TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS transaction_splits (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        transaction_id TEXT NOT NULL REFERENCES journal_transactions(id) ON DELETE CASCADE,
        category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
        amount TEXT NOT NULL,
        memo TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS import_rows (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        batch_id TEXT NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
        row_index INTEGER NOT NULL,
        raw_data TEXT NOT NULL,
        parsed_date TEXT,
        parsed_amount TEXT,
        parsed_payee TEXT,
        parsed_category TEXT,
        status TEXT NOT NULL DEFAULT 'accepted',
        error_message TEXT,
        transaction_id TEXT REFERENCES journal_transactions(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS budgets (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        budget_type TEXT NOT NULL DEFAULT 'category_limit',
        period_type TEXT NOT NULL DEFAULT 'monthly',
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        currency TEXT NOT NULL DEFAULT 'USD',
        rollover_mode TEXT NOT NULL DEFAULT 'none',
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS budget_lines (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        budget_id TEXT NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
        category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
        allocated_amount TEXT NOT NULL DEFAULT '0.00',
        rollover_amount TEXT NOT NULL DEFAULT '0.00',
        notes TEXT,
        UNIQUE(budget_id, category_id)
      );

      CREATE TABLE IF NOT EXISTS envelope_movements (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        budget_id TEXT NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
        from_category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
        to_category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
        amount TEXT NOT NULL,
        notes TEXT,
        moved_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS recurring_financial_rules (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        rule_type TEXT NOT NULL DEFAULT 'bill',
        frequency TEXT NOT NULL DEFAULT 'monthly',
        interval_count INTEGER NOT NULL DEFAULT 1,
        day_of_month INTEGER DEFAULT 1,
        day_of_week INTEGER,
        start_date TEXT NOT NULL,
        end_date TEXT,
        expected_amount TEXT NOT NULL,
        currency TEXT NOT NULL DEFAULT 'USD',
        account_id TEXT NOT NULL REFERENCES finance_accounts(id) ON DELETE CASCADE,
        to_account_id TEXT REFERENCES finance_accounts(id) ON DELETE SET NULL,
        category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
        payee_id TEXT REFERENCES payees(id) ON DELETE SET NULL,
        auto_action TEXT NOT NULL DEFAULT 'reminder_only',
        reminder_days_before INTEGER NOT NULL DEFAULT 3,
        last_generated_at TEXT,
        next_due_date TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS savings_goals (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        target_amount TEXT NOT NULL,
        current_amount TEXT NOT NULL DEFAULT '0.00',
        currency TEXT NOT NULL DEFAULT 'USD',
        target_date TEXT,
        linked_account_id TEXT REFERENCES finance_accounts(id) ON DELETE SET NULL,
        linked_goal_id TEXT REFERENCES goals(id) ON DELETE SET NULL,
        notes TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS debts (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        liability_type TEXT NOT NULL DEFAULT 'credit_card',
        principal_balance TEXT NOT NULL,
        interest_rate TEXT NOT NULL DEFAULT '0.00',
        minimum_payment TEXT NOT NULL DEFAULT '0.00',
        due_day_of_month INTEGER DEFAULT 15,
        payoff_strategy TEXT NOT NULL DEFAULT 'avalanche',
        linked_account_id TEXT REFERENCES finance_accounts(id) ON DELETE SET NULL,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS exchange_rates (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        base_currency TEXT NOT NULL,
        quote_currency TEXT NOT NULL,
        rate TEXT NOT NULL,
        effective_date TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'manual',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(tenant_id, base_currency, quote_currency, effective_date)
      );

      CREATE TABLE IF NOT EXISTS net_worth_snapshots (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        snapshot_date TEXT NOT NULL,
        total_assets TEXT NOT NULL,
        total_liabilities TEXT NOT NULL,
        net_worth TEXT NOT NULL,
        currency TEXT NOT NULL DEFAULT 'USD',
        breakdown TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(tenant_id, snapshot_date)
      );

      CREATE TABLE IF NOT EXISTS account_reconciliations (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        account_id TEXT NOT NULL REFERENCES finance_accounts(id) ON DELETE CASCADE,
        statement_date TEXT NOT NULL,
        statement_balance TEXT NOT NULL,
        calculated_balance TEXT NOT NULL,
        difference TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'balanced',
        adjustment_transaction_id TEXT REFERENCES journal_transactions(id) ON DELETE SET NULL,
        reconciled_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      -- AI and approvals
      CREATE TABLE IF NOT EXISTS ai_tool_policies (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        tool_name TEXT NOT NULL,
        permission_level TEXT NOT NULL DEFAULT 'prepare_and_confirm',
        is_enabled INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(tenant_id, tool_name)
      );

      CREATE TABLE IF NOT EXISTS ai_action_drafts (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        action_type TEXT NOT NULL,
        proposed_payload TEXT NOT NULL,
        target_entity_type TEXT NOT NULL,
        target_entity_id TEXT,
        reason TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft',
        idempotency_key TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        expires_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS ai_action_approvals (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        draft_id TEXT NOT NULL REFERENCES ai_action_drafts(id) ON DELETE CASCADE,
        approved_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        decision TEXT NOT NULL,
        changes_applied TEXT NOT NULL DEFAULT '{}',
        diff_hash TEXT NOT NULL,
        decided_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS ai_audit_events (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        tool_name TEXT NOT NULL,
        input_payload TEXT NOT NULL DEFAULT '{}',
        result_summary TEXT NOT NULL,
        execution_status TEXT NOT NULL DEFAULT 'success',
        policy_decision TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      -- Safe-to-spend settings
      CREATE TABLE IF NOT EXISTS safe_to_spend_settings (
        tenant_id TEXT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
        safety_buffer TEXT NOT NULL DEFAULT '500.00',
        include_credit_lines INTEGER NOT NULL DEFAULT 0,
        days_horizon INTEGER NOT NULL DEFAULT 30,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    // Create helpful performance indexes
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_tasks_tenant_status ON tasks(tenant_id, status);
      CREATE INDEX IF NOT EXISTS idx_tasks_tenant_due ON tasks(tenant_id, due_date);
      CREATE INDEX IF NOT EXISTS idx_tasks_tenant_space ON tasks(tenant_id, space_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_tenant_origin_plan_item ON tasks(tenant_id, origin_plan_item_id) WHERE origin_plan_item_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_tasks_tenant_status_created ON tasks(tenant_id, status, created_at);
      CREATE INDEX IF NOT EXISTS idx_habit_logs_tenant_date ON habit_logs(tenant_id, log_date);
      CREATE INDEX IF NOT EXISTS idx_habit_logs_tenant_habit_date ON habit_logs(tenant_id, habit_id, log_date);
      CREATE INDEX IF NOT EXISTS idx_calendar_events_tenant_time ON calendar_events(tenant_id, start_time, end_time);
      CREATE INDEX IF NOT EXISTS idx_focus_sessions_tenant_started ON focus_sessions(tenant_id, started_at);
      CREATE INDEX IF NOT EXISTS idx_journal_tenant_date ON journal_transactions(tenant_id, date);
      CREATE INDEX IF NOT EXISTS idx_journal_tenant_account ON journal_transactions(tenant_id, account_id);
      CREATE INDEX IF NOT EXISTS idx_journal_lines_account ON journal_lines(tenant_id, account_id);
      CREATE INDEX IF NOT EXISTS idx_budget_lines_budget ON budget_lines(budget_id);
      CREATE INDEX IF NOT EXISTS idx_daily_plans_date ON daily_plans(tenant_id, plan_date);
      CREATE INDEX IF NOT EXISTS idx_daily_plan_items_plan ON daily_plan_items(plan_id);
      CREATE INDEX IF NOT EXISTS idx_task_resched_task ON task_rescheduling_history(task_id);
      CREATE INDEX IF NOT EXISTS idx_ai_planning_target ON ai_planning_sessions(tenant_id, target_date);
    `);

    // Seed default tenant and user if none exist
    const countTenants = db.prepare('SELECT count(*) as count FROM tenants').get() as { count: number };
    if (countTenants.count === 0) {
      seedDefaultData(db);
    }
  })();
}

export function seedDefaultData(db: Database.Database) {
  const tenantId = 'tenant_default';
  const userId = 'user_default';

  db.prepare(`
    INSERT INTO tenants (id, name, slug, plan)
    VALUES (?, ?, ?, ?)
  `).run(tenantId, 'Personal Workspace', 'personal', 'standard');

  db.prepare(`
    INSERT INTO users (id, tenant_id, email, name, preferences)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    userId,
    tenantId,
    'user@personal-os.local',
    'Alex Morgan',
    JSON.stringify({
      theme: 'dark',
      currency: 'USD',
      locale: 'en-US',
      workHoursStart: '09:00',
      workHoursEnd: '17:00',
      aiAutoApproveLowRisk: false,
    })
  );

  db.prepare(`
    INSERT INTO tenant_memberships (id, tenant_id, user_id, role)
    VALUES (?, ?, ?, ?)
  `).run('mem_default', tenantId, userId, 'owner');

  // Spaces
  const spaces = [
    { id: 'space_personal', name: 'Personal', slug: 'personal', icon: 'User', color: '#10b981', is_default: 1 },
    { id: 'space_work', name: 'Work', slug: 'work', icon: 'Briefcase', color: '#3b82f6', is_default: 0 },
    { id: 'space_study', name: 'Learning & Study', slug: 'study', icon: 'BookOpen', color: '#f59e0b', is_default: 0 },
    { id: 'space_health', name: 'Health & Fitness', slug: 'health', icon: 'Activity', color: '#ef4444', is_default: 0 },
  ];

  const insertSpace = db.prepare(`
    INSERT INTO spaces (id, tenant_id, name, slug, icon, color, is_default)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  for (const s of spaces) {
    insertSpace.run(s.id, tenantId, s.name, s.slug, s.icon, s.color, s.is_default);
  }

  // Categories for Finance
  const categories = [
    { id: 'cat_salary', name: 'Salary & Wages', type: 'income', icon: 'Briefcase', color: '#10b981' },
    { id: 'cat_investments', name: 'Investment Income', type: 'income', icon: 'TrendingUp', color: '#059669' },
    { id: 'cat_side_gig', name: 'Side Projects', type: 'income', icon: 'Code', color: '#34d399' },
    { id: 'cat_housing', name: 'Housing & Rent', type: 'expense', icon: 'Home', color: '#6366f1' },
    { id: 'cat_groceries', name: 'Groceries & Food', type: 'expense', icon: 'ShoppingCart', color: '#f59e0b' },
    { id: 'cat_utilities', name: 'Utilities & Bills', type: 'expense', icon: 'Zap', color: '#eab308' },
    { id: 'cat_transport', name: 'Transport & Fuel', type: 'expense', icon: 'Car', color: '#3b82f6' },
    { id: 'cat_health', name: 'Health & Wellness', type: 'expense', icon: 'Heart', color: '#ec4899' },
    { id: 'cat_entertainment', name: 'Entertainment & Leisure', type: 'expense', icon: 'Film', color: '#8b5cf6' },
    { id: 'cat_tech', name: 'Software & Technology', type: 'expense', icon: 'Laptop', color: '#06b6d4' },
    { id: 'cat_dining', name: 'Dining Out', type: 'expense', icon: 'Coffee', color: '#f97316' },
  ];

  const insertCat = db.prepare(`
    INSERT INTO categories (id, tenant_id, name, type, icon, color)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  for (const c of categories) {
    insertCat.run(c.id, tenantId, c.name, c.type, c.icon, c.color);
  }

  // Default AI Tool Policies (spec section 10.3)
  const defaultPolicies = [
    { tool: 'get_daily_summary', level: 'read_and_recommend' },
    { tool: 'list_tasks', level: 'read_and_recommend' },
    { tool: 'get_calendar_availability', level: 'read_and_recommend' },
    { tool: 'get_goal_progress', level: 'read_and_recommend' },
    { tool: 'get_habit_summary', level: 'read_and_recommend' },
    { tool: 'get_spending_summary', level: 'read_and_recommend' },
    { tool: 'get_budget_status', level: 'read_and_recommend' },
    { tool: 'list_upcoming_obligations', level: 'read_and_recommend' },
    { tool: 'draft_daily_plan', level: 'prepare_and_confirm' },
    { tool: 'create_task_draft', level: 'prepare_and_confirm' },
    { tool: 'propose_budget_changes', level: 'prepare_and_confirm' },
    { tool: 'suggest_transaction_category', level: 'prepare_and_confirm' },
  ];

  const insertPolicy = db.prepare(`
    INSERT INTO ai_tool_policies (id, tenant_id, tool_name, permission_level, is_enabled)
    VALUES (?, ?, ?, ?, 1)
  `);
  for (const p of defaultPolicies) {
    insertPolicy.run(`pol_${p.tool}`, tenantId, p.tool, p.level);
  }

  // Safe to spend default settings
  db.prepare(`
    INSERT INTO safe_to_spend_settings (tenant_id, safety_buffer, include_credit_lines, days_horizon)
    VALUES (?, '500.00', 0, 30)
  `).run(tenantId);

  // Default initial productivity seed data
  // Projects
  db.prepare(`
    INSERT INTO projects (id, tenant_id, space_id, name, description, status, objective, definition_of_done, start_date, target_date, progress_method, color)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'proj_personal_os',
    tenantId,
    'space_work',
    'Personal OS System Implementation',
    'Complete personal management system with dual Productivity & Finance workspaces',
    'active',
    'Deliver a quiet-premium, production-ready system with 100% spec coverage',
    'All workflows, ledger invariants, calculators, and offline support fully functional',
    '2026-10-25',
    '2026-11-15',
    'completion',
    '#6366f1'
  );

  // Project milestones
  db.prepare(`
    INSERT INTO project_milestones (id, tenant_id, project_id, title, target_date, is_completed, sort_order)
    VALUES (?, ?, ?, ?, ?, 1, 0), (?, ?, ?, ?, ?, 0, 1), (?, ?, ?, ?, ?, 0, 2)
  `).run(
    'ms_1', tenantId, 'proj_personal_os', 'Foundation & Architecture Schema', '2026-10-29',
    'ms_2', tenantId, 'proj_personal_os', 'Core Productivity & Daily Planning', '2026-11-05',
    'ms_3', tenantId, 'proj_personal_os', 'Finance Engine & Deterministic Ledger', '2026-11-12'
  );

  // Goals
  db.prepare(`
    INSERT INTO goals (id, tenant_id, space_id, title, description, type, start_value, target_value, current_value, unit, direction, progress_method, start_date, deadline, cadence, status, color)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'goal_marathon',
    tenantId,
    'space_health',
    'Run 100 Kilometers this Month',
    'Improve cardiovascular endurance and maintain consistent running habits',
    'numeric',
    0,
    100,
    42.5,
    'km',
    'ascending',
    'log_sum',
    '2026-10-01',
    '2026-10-31',
    'monthly',
    'on_track',
    '#10b981'
  );

  // Habits
  const habits = [
    { id: 'habit_read', title: 'Deep Reading', type: 'duration', unit: 'mins', target: 30, min: 15, ideal: 45, space: 'space_study', icon: 'BookOpen', color: '#f59e0b' },
    { id: 'habit_workout', title: 'Daily Movement / Workout', type: 'boolean', unit: 'times', target: 1, min: 1, ideal: 1, space: 'space_health', icon: 'Activity', color: '#ef4444' },
    { id: 'habit_meditation', title: 'Mindfulness & Reflection', type: 'duration', unit: 'mins', target: 15, min: 10, ideal: 20, space: 'space_personal', icon: 'Sparkles', color: '#8b5cf6' },
    { id: 'habit_water', title: 'Hydration Target', type: 'quantity', unit: 'liters', target: 2.5, min: 2.0, ideal: 3.0, space: 'space_health', icon: 'Droplets', color: '#06b6d4' },
  ];

  const insertHabit = db.prepare(`
    INSERT INTO habits (id, tenant_id, space_id, title, tracking_type, unit, target_value, minimum_threshold, ideal_target, color, icon)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const h of habits) {
    insertHabit.run(h.id, tenantId, h.space, h.title, h.type, h.unit, h.target, h.min, h.ideal, h.color, h.icon);
  }

  // Sample habit logs for current week
  const today = todayISO();
  db.prepare(`
    INSERT OR REPLACE INTO habit_logs (id, tenant_id, habit_id, log_date, value, status)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run('hl_1', tenantId, 'habit_read', today, 35, 'completed');

  // Tasks
  const tasks = [
    { id: 'task_1', title: 'Review weekly strategic objectives', status: 'next', priority: 'high', due: today, duration: 45, space: 'space_work', proj: 'proj_personal_os' },
    { id: 'task_2', title: 'Set up financial ledger reconciliation accounts', status: 'in_progress', priority: 'urgent', due: today, duration: 60, space: 'space_work', proj: 'proj_personal_os' },
    { id: 'task_3', title: 'Grocery run: produce and pantry restock', status: 'inbox', priority: 'normal', due: today, duration: 30, space: 'space_personal', proj: null },
    { id: 'task_4', title: 'Complete chapter 4 of Distributed Systems text', status: 'next', priority: 'normal', due: null, duration: 45, space: 'space_study', proj: null },
    { id: 'task_5', title: 'Review monthly cloud infrastructure bills', status: 'completed', priority: 'normal', due: today, duration: 20, space: 'space_work', proj: 'proj_personal_os' },
  ];

  const insertTask = db.prepare(`
    INSERT INTO tasks (id, tenant_id, space_id, project_id, title, status, priority, due_date, estimated_duration)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const t of tasks) {
    insertTask.run(t.id, tenantId, t.space, t.proj, t.title, t.status, t.priority, t.due, t.duration);
  }

  // Default accounts for Finance
  const accounts = [
    { id: 'acc_checking', name: 'Primary Checking', type: 'checking', currency: 'USD', balance: '4850.00', color: '#3b82f6' },
    { id: 'acc_savings', name: 'High-Yield Savings', type: 'savings', currency: 'USD', balance: '18500.00', color: '#10b981' },
    { id: 'acc_credit', name: 'Sapphire Credit Card', type: 'credit_card', currency: 'USD', balance: '-620.50', color: '#ef4444' },
    { id: 'acc_cash', name: 'Physical Cash Wallet', type: 'cash', currency: 'USD', balance: '180.00', color: '#8b5cf6' },
  ];

  const insertAccount = db.prepare(`
    INSERT INTO finance_accounts (id, tenant_id, name, type, currency, opening_balance, display_color)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  for (const a of accounts) {
    insertAccount.run(a.id, tenantId, a.name, a.type, a.currency, a.balance, a.color);
  }

  // Payees
  const payees = [
    { id: 'pay_employer', name: 'Acme Technologies Inc' },
    { id: 'pay_grocer', name: 'Whole Foods Market' },
    { id: 'pay_landlord', name: 'Metropolitan Properties' },
    { id: 'pay_electric', name: 'City Power & Light' },
    { id: 'pay_coffee', name: 'Blue Bottle Coffee' },
  ];

  const insertPayee = db.prepare(`INSERT INTO payees (id, tenant_id, name) VALUES (?, ?, ?)`);
  for (const p of payees) {
    insertPayee.run(p.id, tenantId, p.name);
  }

  // Seed sample transactions with balanced ledger journal lines
  const tx1Id = 'tx_sample_salary';
  db.prepare(`
    INSERT INTO journal_transactions (id, tenant_id, transaction_type, date, account_id, amount, currency, base_amount, payee_id, payee_name, category_id, description, status)
    VALUES (?, ?, 'income', ?, 'acc_checking', '3500.00', 'USD', '3500.00', 'pay_employer', 'Acme Technologies Inc', 'cat_salary', 'Bi-weekly Direct Deposit', 'posted')
  `).run(tx1Id, tenantId, today);

  db.prepare(`
    INSERT INTO journal_lines (id, tenant_id, transaction_id, account_id, entry_type, amount, currency, base_amount, description)
    VALUES (?, ?, ?, 'acc_checking', 'debit', '3500.00', 'USD', '3500.00', 'Direct Deposit Salary')
  `).run('jl_1', tenantId, tx1Id);

  const tx2Id = 'tx_sample_groceries';
  db.prepare(`
    INSERT INTO journal_transactions (id, tenant_id, transaction_type, date, account_id, amount, currency, base_amount, payee_id, payee_name, category_id, description, status)
    VALUES (?, ?, 'expense', ?, 'acc_credit', '142.85', 'USD', '142.85', 'pay_grocer', 'Whole Foods Market', 'cat_groceries', 'Weekly organic grocery restock', 'posted')
  `).run(tx2Id, tenantId, today);

  db.prepare(`
    INSERT INTO journal_lines (id, tenant_id, transaction_id, account_id, entry_type, amount, currency, base_amount, description)
    VALUES (?, ?, ?, 'acc_credit', 'credit', '142.85', 'USD', '142.85', 'Weekly groceries')
  `).run('jl_2', tenantId, tx2Id);

  // Seed default budget for current month
  const currentMonthStart = today.slice(0, 7) + '-01';
  const currentMonthEnd = today.slice(0, 7) + '-28';
  const budgetId = 'bgt_current_month';

  db.prepare(`
    INSERT INTO budgets (id, tenant_id, name, budget_type, period_type, start_date, end_date, currency, rollover_mode)
    VALUES (?, ?, 'Current Month Budget', 'category_limit', 'monthly', ?, ?, 'USD', 'carry_unused')
  `).run(budgetId, tenantId, currentMonthStart, currentMonthEnd);

  const budgetLines = [
    { cat: 'cat_housing', allocated: '1800.00' },
    { cat: 'cat_groceries', allocated: '650.00' },
    { cat: 'cat_utilities', allocated: '250.00' },
    { cat: 'cat_transport', allocated: '200.00' },
    { cat: 'cat_dining', allocated: '300.00' },
    { cat: 'cat_entertainment', allocated: '150.00' },
  ];

  const insertBgtLine = db.prepare(`
    INSERT INTO budget_lines (id, tenant_id, budget_id, category_id, allocated_amount, rollover_amount)
    VALUES (?, ?, ?, ?, ?, '0.00')
  `);
  for (let i = 0; i < budgetLines.length; i++) {
    insertBgtLine.run(`bl_${i}`, tenantId, budgetId, budgetLines[i].cat, budgetLines[i].allocated);
  }

  // Seed recurring bill
  db.prepare(`
    INSERT INTO recurring_financial_rules (
      id, tenant_id, name, rule_type, frequency, interval_count, day_of_month, start_date, expected_amount, currency, account_id, category_id, auto_action, next_due_date
    ) VALUES (
      'rec_rent', ?, 'Apartment Rent', 'bill', 'monthly', 1, 1, '2026-01-01', '1800.00', 'USD', 'acc_checking', 'cat_housing', 'reminder_only', ?
    )
  `).run(tenantId, today.slice(0, 7) + '-01');

  // Seed savings goal
  db.prepare(`
    INSERT INTO savings_goals (id, tenant_id, name, target_amount, current_amount, currency, target_date, linked_account_id, notes, status)
    VALUES (?, ?, 'Emergency Fund (6 Months)', '20000.00', '18500.00', 'USD', '2026-12-31', 'acc_savings', 'Maintain 6 months of living expenses in liquid high-yield savings', 'active')
  `).run('sg_emergency', tenantId);

  // Seed debt
  db.prepare(`
    INSERT INTO debts (id, tenant_id, name, liability_type, principal_balance, interest_rate, minimum_payment, due_day_of_month, payoff_strategy, linked_account_id)
    VALUES (?, ?, 'Sapphire Credit Card Balance', 'credit_card', '620.50', '18.99', '50.00', 15, 'avalanche', 'acc_credit')
  `).run('debt_sapphire', tenantId);
}

// ---------------------------------------------------------------------------
// Schema migrations
// ---------------------------------------------------------------------------


export type Migration = {
  version: number;
  name: string;
  up: (db: Database.Database) => void;
};

/**
 * Ordered and append-only. Never edit a shipped migration - add a new one.
 * Migration 1 is the baseline: it runs the original DDL, which is idempotent,
 * so it is safe on a fresh database and on one created before versioning existed.
 */
const MIGRATIONS: Migration[] = [
  { version: 1, name: "baseline", up: (db) => initSchema(db) },
  {
    version: 2,
    name: "ai_planning_and_rescheduling",
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS daily_plans (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          plan_date TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'draft',
          objective TEXT,
          available_hours REAL NOT NULL DEFAULT 8,
          estimated_workload_hours REAL NOT NULL DEFAULT 0,
          summary TEXT,
          revision INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(tenant_id, plan_date, revision)
        );

        CREATE TABLE IF NOT EXISTS daily_plan_items (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          plan_id TEXT NOT NULL REFERENCES daily_plans(id) ON DELETE CASCADE,
          task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
          title TEXT NOT NULL,
          item_type TEXT NOT NULL DEFAULT 'scheduled_task',
          start_time TEXT NOT NULL,
          end_time TEXT NOT NULL,
          duration_minutes INTEGER NOT NULL DEFAULT 30,
          priority TEXT NOT NULL DEFAULT 'normal',
          status TEXT NOT NULL DEFAULT 'scheduled',
          sort_order INTEGER NOT NULL DEFAULT 0,
          notes TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS task_rescheduling_history (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
          original_date TEXT,
          new_date TEXT NOT NULL,
          reason TEXT,
          action_type TEXT NOT NULL DEFAULT 'rescheduled',
          rescheduled_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS ai_planning_sessions (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          target_date TEXT NOT NULL,
          conversation TEXT NOT NULL DEFAULT '[]',
          extracted_state TEXT NOT NULL DEFAULT '{}',
          proposed_plan TEXT,
          status TEXT NOT NULL DEFAULT 'interviewing',
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_daily_plans_date ON daily_plans(tenant_id, plan_date);
        CREATE INDEX IF NOT EXISTS idx_daily_plan_items_plan ON daily_plan_items(plan_id);
        CREATE INDEX IF NOT EXISTS idx_task_resched_task ON task_rescheduling_history(task_id);
        CREATE INDEX IF NOT EXISTS idx_ai_planning_target ON ai_planning_sessions(tenant_id, target_date);
      `);
    },
  },
  {
    version: 3,
    name: "planner_task_origin_identity",
    up: (db) => {
      const cols = db.pragma("table_info(tasks)") as Array<{ name: string }>;
      if (!cols.some((c) => c.name === "origin_plan_item_id")) {
        db.exec("ALTER TABLE tasks ADD COLUMN origin_plan_item_id TEXT;");
      }
      db.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_tenant_origin_plan_item
        ON tasks(tenant_id, origin_plan_item_id)
        WHERE origin_plan_item_id IS NOT NULL;
      `);
    },
  },
  {
    version: 4,
    name: "weekly_reviews_authoritative_store",
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS weekly_reviews (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          week_start TEXT NOT NULL,
          week_end TEXT,
          title TEXT,
          summary TEXT,
          payload TEXT NOT NULL DEFAULT '{}',
          created_by TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(tenant_id, week_start)
        );
        CREATE INDEX IF NOT EXISTS idx_weekly_reviews_tenant_week ON weekly_reviews(tenant_id, week_start);
      `);

      // Move historical reviews out of users.preferences (JSON blob) into the
      // authoritative table. Preferences entries can carry older, ambiguous
      // shapes; entries are normalized and unknown shapes are preserved in
      // preferences rather than dropped.
      const users = db.prepare('SELECT id, tenant_id, preferences FROM users').all() as Array<{
        id: string;
        tenant_id: string;
        preferences: string;
      }>;
      const insertReview = db.prepare(`
        INSERT INTO weekly_reviews (id, tenant_id, week_start, week_end, title, summary, payload, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(tenant_id, week_start) DO UPDATE SET
          payload = excluded.payload,
          summary = excluded.summary,
          updated_at = datetime('now')
      `);
      for (const u of users) {
        let prefs: any = {};
        try {
          prefs = JSON.parse(u.preferences || '{}');
        } catch {
          continue;
        }
        const entries = prefs?.weeklyReviews;
        if (!Array.isArray(entries)) continue;
        const migrated: unknown[] = [];
        entries.forEach((e: any, idx: number) => {
          try {
            if (!e || typeof e !== 'object') {
              migrated.push(e);
              return;
            }
            // A review needs a week anchor: weekEnding / weekStart / date — else it
            // stays in preferences as an unknown-shape entry (preserved, not dropped).
            const anchor: string | undefined = e.weekEnding || e.weekStart || e.date;
            if (!anchor || !/^\d{4}-\d{2}-\d{2}/.test(String(anchor))) {
              migrated.push(e);
              return;
            }
            const weekStart = String(anchor).slice(0, 10);
            const payload = {
              weekEnding: e.weekEnding,
              completedCount: e.completedCount ?? 0,
              missedCount: e.missedCount ?? e.openCount ?? 0,
              openCount: e.openCount,
              habitsCount: e.habitsCount,
              reflectionNotes: e.reflectionNotes ?? e.reflection ?? '',
              nextWeekCommitments: e.nextWeekCommitments ?? '',
            };
            insertReview.run(
              e.id || `wrev_${u.tenant_id}_${weekStart}_${idx}`,
              u.tenant_id,
              weekStart,
              weekStart,
              e.title || null,
              payload.reflectionNotes || null,
              JSON.stringify(payload),
              e.createdBy || u.id
            );
            migrated.push(e);
          } catch {
            migrated.push(e);
          }
        });
        if (migrated.length !== entries.length || migrated.length > 0) {
          // Keep preferences as the mirror for one release (read-compat) but the
          // table is authoritative going forward.
          prefs.weeklyReviews = migrated;
        }
        db.prepare('UPDATE users SET preferences = ? WHERE id = ?').run(JSON.stringify(prefs), u.id);
      }
    },
  },
];

export function schemaVersion(db: Database.Database): number {
  return Number(db.pragma("user_version", { simple: true }) ?? 0);
}

/** Snapshot with VACUUM INTO (WAL-safe). A raw file copy can miss uncommitted WAL pages. */
export function snapshotDatabase(db: Database.Database, version: number): string {
  const dir = __joinPath(__dirnameOf(resolveDbPath()), "backups");
  __mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = __joinPath(dir, "personal_os-v" + version + "-" + stamp + ".db");
  db.exec("VACUUM INTO '" + file.replace(/'/g, "''") + "'");
  return file;
}

export type MigrationResult = {
  from: number;
  to: number;
  applied: number[];
  backup: string | null;
};

export function runMigrations(db: Database.Database): MigrationResult {
  const from = schemaVersion(db);
  const pending = MIGRATIONS.filter((m) => m.version > from).sort((a, b) => a.version - b.version);
  if (pending.length === 0) {
    return { from, to: from, applied: [], backup: null };
  }
  const backup = from > 0 ? snapshotDatabase(db, from) : null;
  const apply = db.transaction(() => {
    for (const m of pending) {
      m.up(db);
      db.pragma("user_version = " + m.version);
    }
  });
  apply();
  return { from, to: schemaVersion(db), applied: pending.map((m) => m.version), backup };
}
