# Architecture Inventory & Technology Baseline

**Audit Date**: November 6, 2026  
**Auditor**: Antigravity (Auditor Role)  
**Project**: Personal OS — Desktop-First Productivity & Finance Modular Platform  
**Repository Branch**: `hermes/hardening`

---

## 1. Core Framework & Runtime Stack

- **Runtime Environment**: Node.js v26.8.2 on Linux x86_64
- **Package Manager**: `pnpm` v12.11.2 (monorepo/strict lockfile mode enabled)
- **Application Framework**: Next.js v16.4.3 (Turbopack, App Router)
  - Partial Prefetching (`ppr`) enabled
  - Cache Components enabled
- **Language**: TypeScript v5.9.3 (Strict mode enabled, strict null checks)
- **UI Library**: React v19.3.0, React-DOM v19.3.0

---

## 2. Database & Data Architecture

- **Engine**: SQLite 3 via `better-sqlite3` v13.0.3
- **Storage Mode**: Write-Ahead Logging (`PRAGMA journal_mode = WAL`)
- **Integrity Constraints**: `PRAGMA foreign_keys = ON`
- **Schema Management**: Append-only versioned migrations controlled by `PRAGMA user_version`. Pre-migration automated WAL backups using `VACUUM INTO`.
- **Database Location**: Local file at `data/personal_os.db` (git-ignored, backed up to `data/backups/`)
- **Multi-Tenant Scoping**: All operational tables (`tasks`, `projects`, `goals`, `habits`, `finance_accounts`, `journal_transactions`, `journal_lines`, `budgets`, `ai_tool_policies`) enforce strict `tenant_id` isolation.

---

## 3. Styling, Typography & Design Tokens

- **CSS Engine**: Tailwind CSS v4 (`@tailwindcss/turbopack`)
- **Base Theme**: Dark mode default (`className="dark"`, `bg-zinc-950`, `text-zinc-100`)
- **Color Palette Tokens**:
  - Neutrals: `zinc-950` (page canvas), `zinc-900` (panel/surface), `zinc-800` (borders/dividers), `zinc-400`/`zinc-500` (muted secondary text)
  - Productivity Accent: `indigo-600` / `indigo-400`
  - Finance Accent: `emerald-600` / `emerald-400`
  - Warning / Alert: `amber-500` / `amber-400`
  - Destructive / Liability: `rose-600` / `rose-400`
- **Iconography**: `lucide-react` v1.62.0 (consistent stroke width and 16px/20px sizes)
- **Layout Model**: Fluid desktop-first width (`w-full px-8 py-6`) with persistent sticky sidebar and top global header.

---

## 4. Financial Calculation & Arithmetic Engine

- **Arithmetic Precision**: `decimal.js` v10.6.0 (28 digits precision, `ROUND_HALF_UP`)
- **Storage Format**: `TEXT` in SQLite for all currency values (`amount`, `base_amount`, `opening_balance`, `current_balance`, `allocated_amount`).
- **Summation Engine**: Exact `sumDecimalAmounts` helper function; zero SQLite `CAST(amount AS REAL)` float casting.
- **Accounting Model**: Double-entry journal lines (`journal_transactions` + `journal_lines` with debit/credit balancing).
- **Audit Rules**: Void transactions preserve `journal_lines` records intact; active balance and budget calculations filter strictly on `status = 'posted'`.

---

## 5. Client State, Navigation & Offline Support

- **Context State**: `WorkspaceContext` manages active workspace (`productivity`, `finance`, `overview`), connected space filter (`all`, `work`, `personal`, etc.), command palette state, quick-add state, explainer drawer state, and offline pending count.
- **Keyboard Shortcuts**: `Cmd+K` / `Ctrl+K` for global command palette; `Cmd+N` / `Ctrl+N` for universal quick-add.
- **PWA & Offline**:
  - `public/manifest.json` configured for standalone desktop display with 192x192 and 512x512 icons.
  - Client-side offline mutation queue (`src/lib/offline/queue.ts`) with idempotent keys and auto-sync on browser `online` event.

---

## 6. Build, Verification & Testing Tools

- **Test Runner**: Vitest v5.0.5 (`vitest.config.ts` configured with path alias `@ -> ./src`)
- **Accessibility Testing**: `axe-core` v4.14.0 + `jsdom`
- **Browser Automation**: Playwright MCP (`playwright-local`) for read-only accessibility tree inspection, DOM evaluation, and full-page screenshots.
