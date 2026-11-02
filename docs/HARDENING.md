# Personal OS - Hardening Plan

Baseline: 47 SQLite tables, 30 tests green, `tsc` clean, branch `hermes/hardening`.

## Why this exists

This is not a feature problem. The app already has tasks, projects, goals, habits,
calendar, weekly review, a double-entry ledger, CSV import, budgets, debts, an AI
approval workflow, a formula evaluator and a command palette.

The gap between it and something you can trust with real money and real days is
**correctness, recovery and honesty**. Features built before those three are built
on sand.

Guiding rules:

1. Never silently corrupt data. A tool that is sometimes wrong is worse than a tool
   that does less.
2. No dead controls. A toggle that persists nothing teaches the user the app lies.
3. The daily loop must cost under a minute: capture -> today -> close the day.

## Verified defects

| # | Defect | Evidence | Status |
|---|--------|----------|--------|
| 1 | Calendar dates computed in UTC. Before the fix, `toISOString()` appeared 46 times across 25 files; zero remain outside `src/lib/time` and tests. | `src/lib/time/index.ts` | **FIXED** in `57d92fd` and `1e09bc0`; 30 tests green |
| 2 | Money aggregates cast TEXT to REAL in SQL, so precision is lost before any decimal library runs. Balances drift. | `CAST(amount AS REAL)` appears 13 times in `src/lib/finance/engine.ts`; the columns are `amount TEXT` | OPEN |
| 3 | The DELETE handler deletes `journal_lines` right after setting `status='voided'`, contradicting its own preserve-history comment and leaving balances and audit trail inconsistent. | `src/app/api/finance/transactions/route.ts` | OPEN |
| 4 | No migration system. Tables are `CREATE TABLE IF NOT EXISTS` only; an existing DB can never gain a column. | `src/lib/db/index.ts` runs `initSchema()`; no `PRAGMA user_version`, no `ALTER TABLE`, no `migrations/` | OPEN |
| 5 | No authentication. Anything that reaches the port reads and writes the database. | no session or middleware under `src/app/api` | OPEN |
| 6 | No restore path. The backup page exports partial JSON; there is no import, no SQLite snapshot, no scheduled copy. | `src/app/overview/backup/page.tsx` | OPEN |
| 7 | Dead surfaces that silently discard input: focus sessions, settings save, AI governance toggles, metric dictionary, operating rules. | `focus/page.tsx`, `settings/page.tsx`, `ai-governance/page.tsx`, `metrics/page.tsx` | OPEN |
| 8 | Offline queue exported but never imported, so advertised offline behaviour does not exist. | `src/lib/offline/queue.ts` | OPEN |
| 9 | PWA manifest references `/icon.png` and `/icon-512.png`; neither exists. | `public/manifest.json` | OPEN |

Line numbers drift as code changes. Every pointer in the table above is a grep token,
not a line number; re-derive positions with `grep -rn` before acting.

## Phases

**P0 - Time (done).** Timezone-safe helpers in `src/lib/time/index.ts`, UTC date call
sites replaced, `npm test` script wired.

**P1 - Money and state integrity.** Integer minor units (or exact decimal strings
summed in JS) end to end: schema, engine aggregates, CSV import, API payloads, UI
formatting. Soft-void that preserves `journal_lines` and excludes voided rows from
balances. Requires P2 first.

**P2 - Schema migrations.** Versioned migrator on `PRAGMA user_version`, run on open,
with a backup taken before any upgrade. No column may be added without one.

**P3 - Trust and recovery.** A restore path that round-trips a real backup and is
tested. Scheduled SQLite snapshot. Local auth (PIN plus session cookie) bound to
127.0.0.1 by default.

**P4 - Honesty pass.** Every dead surface either persists or is removed. No control
may claim to save and not save.

**P5 - Test depth.** Engine coverage for ledger arithmetic at 10k+ transactions, date
boundaries, CSV edge cases, migration upgrade paths.

## Non-goals

- No multi-tenant SaaS polish. The `tenants`/`users`/`spaces` tables exist; they are
  not the product. The single-user path must be airtight first.
- No new features before P2 ships. Anything built on the current ledger will be
  rewritten.

## Verification

Run after every change:

    npx tsc --noEmit
    npm test
    git log --oneline -3
