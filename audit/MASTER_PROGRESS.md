# Master Progress

**Status: complete for every surface exercised, with one carry-forward.**
Last updated: 2026-11-14 · Audit build: `6dbb094`, fixes verified at `6e9d183`

Carried forward: the **Phase 4 finance-table typography pass** — table density
and numeric alignment on `transactions`, `budgets`, `debts`, `net-worth` — has
never been run. Everything else below is done or explicitly declared untested.

## Quantitative state (evidence-derived)

| Metric | Value | Source |
| --- | --- | --- |
| Routes discovered | 30 (29 app routes + `/login`) | `APPLICATION_INVENTORY.md` |
| Routes loaded in a browser | 30 — 29 via the route scan, `/login` via the auth suite | `route-scan.json` + auth specs |
| Routes returning 200 | 29/29 scanned | `route-scan.json` |
| Routes with horizontal document overflow at 1440 | 0/29 | same |
| Routes with console errors on load | 0/29 (the insights redirect stub's aborted `_rsc` prefetch is expected) | same |
| Buttons observed | 367 | same |
| Inputs observed | 37 | same |
| Tables observed | 4 | same |
| Interaction tests recorded | 18 (INT-001..011, A11Y-001..007) | `INTERACTION_TESTS.md` |
| Interaction tests passing | 16 | same |
| Interaction tests failing at time of running | 2 (`BUG-001`, `A11Y-008`) — both since fixed | same |
| Dialogs audited with axe while open | 2 (Quick Add, command palette) | `axe-command-palette.json` |
| Static routes audited with axe | 10, plus the 28-route seeded sweep in CI | `axe-static-routes.json` |
| Viewports tested | **8 of 8** (64 measurements = 8 × 8 routes) | `responsive.json` |
| Findings recorded | **15** | the four findings files |
| — confirmed defects | 3 | `FUNCTIONAL_BUGS.md` |
| — usability / UI concerns | 7 | `UI_UX_FINDINGS.md` |
| — accessibility findings | 3 | `ACCESSIBILITY_FINDINGS.md` |
| — performance entries | 2 (one informational) | `PERFORMANCE_FINDINGS.md` |
| Resolved during the audit | **5** (`BUG-001`, `BUG-002`, `A11Y-008`, `A11Y-009`, `A11Y-010`) | with mutation-proven gates |
| Still open | **9** | `EXECUTIVE_SUMMARY.md` |
| Informational (not an action) | **1** (`PERF-002`, code splitting healthy) | `PERFORMANCE_FINDINGS.md` |

Reconciliation: 5 resolved + 9 open + 1 informational = **15**.

## Page completion

A page counts as complete only when its UI, interactions and applicable functional checks were performed. Opening it is not completion.

| Status | Count | Routes |
| --- | --- | --- |
| Fully audited (UI + interaction) | 4 | `/`, `/productivity/tasks`, `/overview/settings`, `/productivity/insights` |
| Controls swept (251 clicks, 0 console errors), behaviour verified where a workflow applies | 26 | all remaining app routes, including `/login`. Control-response verified; record-level behaviour only where a named workflow covers it |
| Not audited | 0 | — |
| Blocked | 0 | — |

## Fixes applied during the audit

| Finding | Fix | Verified |
| --- | --- | --- |
| BUG-001 (palette loses commands) | Merged row model, client-side command filter with keywords | 6 queries behave; activation navigates; axe clean |
| A11Y-008 (3 AA violations in palette) | Contrast raised, label-in-name corrected | axe on the **open** palette: 0 |
| BUG-002 (calendar clipped at 390px) | `overflow-x-auto` wrapper + `minmax(96px,1fr)` floor | 96px columns, Sunday reachable, no document overflow |
| A11Y-009 (sweep never opens dialogs) | 3 new specs in `axe-sweep.spec.ts`: palette open, Quick Add open, calendar at 390px | Each proven to **fail** when its fix is reverted, then pass |

Gates after the fixes: `tsc` 0 · ESLint 0 · **261 unit tests** · **112 E2E specs**.

Correction recorded: an earlier commit claimed these gates shipped when the edit
had silently not applied. The gates were then written for real and each was
verified by reverting its fix and observing the failure
(`narrowestColumn 49 < 90` for the calendar; `color-contrast` and
`label-content-name-mismatch` for the palette; a missing Settings row for the
filter).

## Current phase

Phase 3 (interaction): **done for the surfaces exercised** — every route's
controls were swept (251 clicks, zero console errors, zero dead controls
identified), and all five previously-untested workflows are verified end to end.

Phase 4 (visual/typography): **one carry-forward**. Typography and layout were
inspected per page and measured across 8 viewports, but the recognised finance
tables were never assessed for density or numeric alignment. Lighthouse does not
substitute: it measures contrast and heading order, not whether a 745px-wide
numeric table reads well.

## Exact next task

1. **Phase 4 carry-forward: the finance-table typography pass.** Open
   `/finance/transactions`, `/budgets`, `/debts`, `/net-worth` at 1440×900 and
   assess: right-aligned numeric columns, consistent decimal places, row density
   (is 745px of table readable?), header/label contrast, and whether amounts are
   scannable down a column. Record findings as `UI-*`.
2. **Backup restore through the UI** (export is verified; restore is covered only
   by unit tests).
3. **Assistant chat path**, which needs a configured model provider.

Do not redo: the route sweep, the five workflows, the 8-viewport matrix, the
palette verification, or the production Lighthouse pass. All are recorded with
evidence in this directory.

## Blockers

See `BLOCKERS.md`. No hard blockers for the remaining work.
