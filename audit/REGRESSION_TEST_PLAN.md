# Regression Test Plan

Use after implementing anything from `IMPROVEMENT_ROADMAP.md`. Every case below is deterministic, seeds its own state, and checks observable behaviour rather than implementation.

## Preconditions

```bash
pnpm install
PERSONAL_OS_DB_PATH=/tmp/audit-db/profile.db E2E_DIST_DIR=.next-audit npx next dev --port 3550
```

The database is throwaway; a fresh one is seeded on first boot. Never point this at the operator's live database.

## Cases

| ID | Feature | Preconditions | Steps | Expected | Regression guard for |
| --- | --- | --- | --- | --- | --- |
| RT-01 | Palette filters commands | App loaded, palette closed | Ctrl+K, type `settings` | A row exists whose activation lands on `/overview/settings` | BUG-001 |
| RT-02 | Palette keeps both sources | Palette closed | Ctrl+K, type `finance` | At least one **command** and any matching records are both listed, in labelled groups | UX-002 |
| RT-03 | Palette empty query | Palette closed | Ctrl+K | All 10 commands listed, first `aria-selected="true"` | BUG-001 |
| RT-04 | Palette keyboard model | Palette open | ArrowDown ×2, ArrowUp, Enter | Selection follows arrows; Enter activates the selected row; Escape closes | INT-007/008 |
| RT-05 | Palette accessibility (open) | Palette open | Run axe with `wcag2a..wcag22aa` | 0 violations | A11Y-008 |
| RT-06 | Quick Add accessibility (open) | Ctrl+N | Run axe | 0 violations; focus inside; 25× Tab stays trapped | A11Y-001..003 |
| RT-07 | Calendar at 390px | 390×844 viewport | Open `/productivity/calendar` | Every weekday column's right edge is within the viewport **or** an `overflow-x-auto` ancestor makes it reachable | RESP-001 |
| RT-08 | Tables at 390px | 390×844 | Open `/finance/transactions`, `/finance/budgets`, `/finance/net-worth` | Content reachable via a scroll container with a visible affordance; no document-level horizontal scroll | RESP-002..004 |
| RT-09 | No document overflow | 8 viewports | Load each sampled route | `scrollWidth <= clientWidth` | RESP-* |
| RT-10 | Open-mode identity | No credentials configured | Load `/` | Account control does not imply a named user | BUG-003 |
| RT-11 | Capture feedback | Tasks page | Enter a title + Enter | Row inserted, visibly announced/highlighted | UX-001 |
| RT-12 | Capture dedupe | Tasks page | Enter one title, press Enter three times rapidly | Exactly one task | INT-003 |
| RT-13 | Archive round trip | Tasks page | Create task → Archive (accept confirm) → reload | `DELETE` sent, row gone, still gone after reload | WF-A3 |
| RT-14 | Archive cancel | Tasks page | Create task → Archive (dismiss) | No `DELETE`; row remains | WF-A4 |
| RT-15 | Search empty state | Tasks page | Search `zzzz-no-match-zzzz` | Empty-state text rendered, input still usable | INT-005 |
| RT-16 | Persistence | Tasks page | Create → `reload()` | Task present | WF-B1 |
| RT-17 | History | Finance ledger | Navigate to Accounts via sidebar → Back ×2 | `/finance/transactions`, then the previous section | WF-C1/C2 |
| RT-18 | Skip link | Any page | Tab, Enter | First Tab hits "Skip to main content"; URL gains `#main-content` | A11Y-006/007 |
| RT-19 | Console cleanliness | All 29 routes | Load each | 0 console errors, 0 failed requests | Baseline |
| RT-20 | Heading structure | All 29 routes | Load each | Exactly one `h1` (excluding the `/productivity/insights` redirect stub) | Baseline |
| RT-21 | Sign-in gate | Credentials configured | Load `/`; call `/api/tasks` | Page 307 → `/login`; API 401 | Auth contract |
| RT-22 | Correct password under throttle | Credentials configured | 6 wrong attempts, then the correct password | Wrong → 401 then 429; correct → 200 | Throttle contract |
| RT-23 | Sign-out | Signed in | Account menu → Sign out | Lands on `/login`; `/api/tasks` → 401; deep link cannot restore | Auth contract |

## Existing suites that must stay green

| Suite | Command | Baseline at audit time |
| --- | --- | --- |
| Typecheck | `npx tsc --noEmit` | 0 errors |
| Lint | `node node_modules/eslint/bin/eslint.js src e2e scripts` | 0 problems |
| Unit | `npx vitest run` | 28 files / 261 tests |
| E2E | `E2E_CHROMIUM_PATH=/usr/bin/chromium npx playwright test` | 107 passed |

Any change to the palette or the tables must leave these at or above the baseline.

## Reporting an outcome

Record pass/fail with the observed value, not the expected one. If a case cannot run, mark it **Blocked** with the reason — never **Pass**.
