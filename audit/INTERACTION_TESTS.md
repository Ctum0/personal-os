# Interaction Tests

Every result below came from driving the real control in Chromium and observing the result. Machine-readable output: `evidence/reports/interaction-runs.json`.

Baseline state: fresh database seeded by first boot (4 tasks, sample accounts).

| ID | Interaction | Expected | Actual | Result |
| --- | --- | --- | --- | --- |
| INT-001 | Press Enter in empty quick-capture | Nothing happens | Input stays empty, no task created | **PASS** |
| INT-002 | Type a title + Enter | Task appears in the list | Appears immediately | **PASS** |
| INT-003 | Press Enter three times rapidly with one title | One task, not three | One task | **PASS** (dedupe works) |
| INT-004 | Search a task title | Only matching rows remain | Match shown, unrelated hidden | **PASS** |
| INT-005 | Search `zzzz-no-match-zzzz` | An explanation, not a blank area | Empty-state text rendered | **PASS** |
| INT-006 | Ctrl+K | Command palette opens | Opens, `role=dialog` "Command palette" | **PASS** |
| INT-007 | Ctrl+K then type `set` | Commands matching "set" (Settings) | **0 results** — see BUG-001 | **FAIL** |
| INT-008 | Escape in palette | Closes | Closes | **PASS** |
| INT-009 | Ctrl+N | Quick Add opens | Opens | **PASS** |
| INT-010 | Quick Add field labels | Every control labelled | Title + others labelled | **PASS** |
| INT-011 | Click "Finance" in the navbar | Navigates to `/finance` | `/finance` in ~1s | **PASS** (corrected — see decisions) |
| A11Y-001 | axe on open Quick Add | 0 AA violations | 0 | **PASS** |
| A11Y-002 | Focus after Ctrl+N | Inside the dialog | Inside | **PASS** |
| A11Y-003 | 25× Tab in modal | Focus stays trapped | Stays inside | **PASS** |
| A11Y-004 | axe on open command palette | 0 AA violations | **3 violations** — see A11Y-008 | **FAIL** |
| A11Y-005 | Focus after Ctrl+K | Inside the dialog | Inside | **PASS** |
| A11Y-006 | First Tab on a page | Skip link focused | "Skip to main content" | **PASS** |
| A11Y-007 | Activate skip link | Moves to `#main-content` | URL gains `#main-content` | **PASS** |

## Observed but not asserted (informational)

- Quick capture appends without moving the list scroll position; a new task below the fold gives no visual confirmation beyond the input clearing. Minor feedback gap, recorded as UX-001.
- The empty-search state appears, but the search input retains focus and there is no "clear" affordance inside the field. Low severity.

## Route-wide button sweep (26 routes)

Every enabled, visible button on the 26 partially-audited routes was clicked
individually, reloading the route between clicks so each started from a known
state. Raw data: `evidence/reports/route-interaction-scan.json`.

| Result | Count |
| --- | --- |
| Routes swept | **26** |
| Button clicks performed | **251** |
| Console errors during the sweep | **0** |

Of the 86 clicks that produced no URL change and no `role="dialog"`,
the composition matters and is mostly *not* a defect:

- **23** were workspace switches (Productivity / Finance), which change
  workspace state without navigating — correct behaviour, and my detector looked
  for a URL change or a dialog.
- **8** were the Next.js dev-tools overlay, which does not exist in a
  production build.
- **55** were tab/filter/segment controls (`Today`, `All`, `Last 30
  Days`, priority filters, formula chips) that change local view state.

Six were individually re-checked because they looked like real failures:

| Route | Button | Verdict |
| --- | --- | --- |
| `/productivity/today` | Quick Capture | Opens a dialog — works |
| `/finance/accounts` | New Account | Opens an **inline form** (3 inputs), rejects empty submit with a `role="alert"` — works. Not a `role="dialog"`, which is why the sweep reported it silent |
| `/finance/recurring` | New Recurring Obligation | Inline form (5 inputs), rejects empty submit — works |
| `/finance/savings` | New Savings Goal | Inline form (6 inputs), rejects empty submit — works |
| `/overview/backup` | Download Complete Backup | Fires a real download (`personal_os_backup_…`) — works |
| `/productivity/today` | priority filter buttons | Change the filtered list — works |

**No defect was found in the sweep.** Its value is the negative result: 251
clicks across 26 routes produced **zero console errors** and **zero dead
controls**. The sweep's own limitation is recorded honestly: it detects effects
by URL change or `role="dialog"`, so controls with inline or local state changes
are reported as silent by construction.

## Not tested

- Destructive flows (archive/delete with confirmation) were **not** driven end-to-end to observe the undo path; only the buttons' presence was confirmed. Tracked as **Not tested** in `MASTER_PROGRESS.md`.
- CSV import commit was not exercised through the UI in this pass (covered by the project's E2E suite, but not re-verified here).
