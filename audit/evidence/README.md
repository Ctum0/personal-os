# Evidence index

Every file here is cited by at least one document in `audit/`, and
`audit/verify-consistency.mjs` fails if that stops being true in either direction —
a doc citing a missing file, or a committed file no doc mentions.

## `reports/`

| File | Produced by | Cited in |
| --- | --- | --- |
| `route-scan.json` | Loading all 29 app routes in Chromium at 1440×900; `h1`/control counts, console errors, failed requests | `APPLICATION_INVENTORY.md`, `MASTER_PROGRESS.md`, `UI_UX_FINDINGS.md` |
| `responsive.json` | 8 viewports × 8 routes = 64 measurements of document and descendant geometry | `RESPONSIVE_TESTING.md`, `MASTER_PROGRESS.md` |
| `axe-static-routes.json` | axe-core (WCAG 2.2 A/AA tags) on 10 static routes | `ACCESSIBILITY_FINDINGS.md` |
| `axe-command-palette.json` | axe-core on the **open** command palette — the run that found `A11Y-008`'s three violations | `ACCESSIBILITY_FINDINGS.md` |
| `interaction-runs.json` | Scripted interaction results (capture, search, palette, dialogs) | `INTERACTION_TESTS.md` |
| `route-interaction-scan.json` | 251 button clicks across 26 routes, reloading between clicks | `INTERACTION_TESTS.md`, `ROUTE_COVERAGE.md` |
| `finance-table-typography.json` | Per-column alignment, font size, row height and decimal count on the four finance tables | `UI_UX_FINDINGS.md` |
| `lighthouse-home-summary.json` | Trimmed extract of the production-build Lighthouse run: categories, six metrics, audits of interest | `PERFORMANCE_FINDINGS.md` |

Raw Lighthouse output (~584 KB of trace payload) is deliberately **not** committed;
`PERFORMANCE_FINDINGS.md` carries the regeneration recipe.

## `screenshots/`

| File | Shows | Cited in |
| --- | --- | --- |
| `UI-000-home-1440.png` | Dashboard at 1440×900, the baseline for layout judgement | `screenshots/README.md` |
| `A11Y-008-command-palette-open.png` | The palette in its open state — the surface `A11Y-008` was raised against | `screenshots/README.md` |
| `RESP-004-transactions-390px.png` | Ledger table at 390px: 8 columns in a 356px scroller, scrollable with no affordance | `screenshots/README.md`, `RESPONSIVE_TESTING.md` |
| `BUG-002-calendar-390px.png` | Calendar at 390px **before** the fix: the last weekday column extends past the viewport with no scroller | `screenshots/README.md`. Historical — superseded by the resolved `BUG-002` |

Two screenshots were captured before the responsive findings were reclassified;
they are named for their **current** register IDs, not the ones in force at capture.

## `recordings/`

Empty. No recordings were captured; every finding rests on JSON geometry, axe
output, screenshots or a named reproduction instead.
