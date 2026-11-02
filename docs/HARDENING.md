# Personal OS - Hardening Plan

Living document. Written after a full read of the codebase and an independent
verification pass (file:line evidence below). Baseline at time of writing:
47 SQLite tables, 30 tests green, `tsc --noEmit` clean, branch `hermes/hardening`.

## Why this exists

This is not a feature problem. The app already has tasks, projects, goals,
habits, calendar, weekly review, a double-entry ledger, CSV import, budgets,
debts, an AI approval workflow, a formula evaluator and a command palette.
The gap between it and something you can trust with real money and real days is
**correctness, recovery, and honesty**. Features added before those three are
built on sand.

Guiding rules:

1. Never lose or silently corrupt data. A tool that is sometimes wrong is worse
   than a tool that does less.
2. No dead controls. A toggle that persists nothing teaches the user the app lies.
3. The daily loop must cost under a minute: capture -> today -> close the day.

## Verified defects

| # | Defect | Evidence | Status |
|---|---|---|---|
| 1 | Calendar dates computed in UTC. Every evening after 18:30 UTC (00:00 Asia/Colombo) habit logs, streaks, daily plan, dashboard "today" and due dates write to the previous day. | `src/lib/productivity/engine.ts:214`, `:324`, `src/app/page.tsx:37` + 46 `toISOString()` sites | **FIXED** in `57d92fd`, `1e09bc0` - `src/lib/time/index.ts`, 31 call sites converted, 8 new tests |
| 2 | Money aggregates cast TEXT to REAL inside SQL, so precision is lost before any decimal library runs. Balances drift. | `src/lib/finance/engine.ts:121,216,227,482,616` (`CAST(amount AS REAL)`); columns are `amount TEXT` | OPEN |
| 3 | Voiding a transaction deletes its `journal_lines`, contradicting the "preserve history" comment and leaving balances and audit trail inconsistent. | `src/app/api/finance/transactions/route.ts:177-184` | OPEN |
| 4 | No schema migration system. Tables are `CREATE TABLE IF NOT EXISTS` only; an existing DB can never gain a column. | `src/lib/db/index.ts:32-37`; no `PRAGMA user_version`, no `ALTER TABLE`, no `migrations/` | OPEN |
| 5 | No authentication. Anything that reaches the port reads and writes the DB. | no session/middleware under `src/app/api` | OPEN |
| 6 | No restore path. Backup page exports partial JSON; there is no import, no SQLite snapshot, no scheduled copy. | `src/app/overview/backup/page.tsx` | OPEN |
| 7 | Dead surfaces that silently discard input: focus sessions, settings save, AI governance toggles, metric dictionary, operating rules. | `focus/page.tsx:23`, `settings/page.tsx:28`, `ai-governance/page.tsx:15`, `metrics/page.tsx:30` | OPEN |
| 8 | Offline queue exported but never imported, so advertised offline behaviour does not exist. | `src/lib/offline/queue.ts` | OPEN |
| 9 | PWA manifest references `/icon.png` and `/icon-512.png`; neither exists. | `public/manifest.json` | OPEN |

## Phases

**P0 - Time (done).** Timezone-safe helpers, 31 call sites converted, tests added,
`npm test` script wired.

**P1 - Money and state integrity.** Integer minor units (or exact decimal strings
summed in JS) end to end: schema, engine aggregates, CSV import, API payloads,
UI formatting. Soft-void that preserves `journal_lines` and excludes voided rows
from balances. Requires defect 4 first.

**P2 - Schema migrations.** Versioned migrator on `PRAGMA user_version`, run on
open, with a backup taken before any upgrade. No column may be added without one.

**P3 - Trust and recovery.** Restore path that round-trips a real backup and is
tested. Scheduled SQLite snapshot. Local auth (PIN + session cookie), bound to
127.0.0.1 by default.

**P4 - Honesty pass.** Every dead surface either persists or is removed. No
control may claim to save and not save.

**P5 - Test depth.** Engine coverage for ledger arithmetic at 10k+ transactions,
date boundaries, CSV edge cases, migration upgrade paths.

## Non-goals (deliberate)

- Multi-tenant SaaS polish. The `tenants`/`users`/`spaces` tables exist; they are
  not the product. The single-user path must be airtight first.
- New features before P2 ships. Anything built on the current ledger will be
  rewritten.

## Verification (run after every change)

    npx tsc --noEmit
    npm test
    git log --oneline -3
