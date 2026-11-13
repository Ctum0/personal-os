# Route Coverage

`Loaded` = page rendered in Chromium at 1440×900 with console/request capture.
`Axe` = axe-core AA scan.
`Interaction` = at least one control was driven and its result observed.
`Mobile` = included in the 8-viewport matrix.

| # | Route | Loaded | Axe | Interaction | Mobile | Status |
|---|---|---|---|---|---|---|
| 1 | `/` | Yes | Yes | Yes (Ctrl+K, Ctrl+N) | Yes | **Complete** |
| 2 | `/productivity/today` | Yes | — | No | No | Partially tested |
| 3 | `/productivity/plan` | Yes | — | No | No | Partially tested |
| 4 | `/productivity/tasks` | Yes | Yes | Yes (capture, search, archive, filters) | Yes | **Complete** |
| 5 | `/productivity/projects` | Yes | — | No | No | Partially tested |
| 6 | `/productivity/inbox` | Yes | — | No | No | Partially tested |
| 7 | `/productivity/calendar` | Yes | Yes | No | Yes | Partially tested (responsive defect confirmed) |
| 8 | `/productivity/habits` | Yes | Yes | No | No | Partially tested |
| 9 | `/productivity/goals` | Yes | — | No | No | Partially tested |
| 10 | `/productivity/focus` | Yes | Yes | No | No | Partially tested |
| 11 | `/productivity/analytics` | Yes | — | No | No | Partially tested |
| 12 | `/productivity/insights` | Yes | — | n/a (redirect) | No | **Complete** (redirect verified) |
| 13 | `/productivity/weekly-review` | Yes | — | Yes (WF-H: save + reload) | Yes | **Interaction verified** |
| 14 | `/finance` | Yes | — | No | No | Partially tested |
| 15 | `/finance/accounts` | Yes | Yes | No | No | Partially tested |
| 16 | `/finance/transactions` | Yes | Yes | Yes (WF-G: create → void) | Yes | **Interaction verified** |
| 17 | `/finance/budgets` | Yes | — | No | Yes | Partially tested |
| 18 | `/finance/recurring` | Yes | — | No | No | Partially tested |
| 19 | `/finance/savings` | Yes | — | No | No | Partially tested |
| 20 | `/finance/debts` | Yes | — | No | No | Partially tested |
| 21 | `/finance/net-worth` | Yes | — | No | Yes | Partially tested |
| 22 | `/finance/import` | Yes | Yes | Yes (WF-F: file → preview → commit) | Yes | **Interaction verified** |
| 23 | `/finance/reports` | Yes | — | No | No | Partially tested |
| 24 | `/overview` | Yes | — | No | No | Partially tested |
| 25 | `/overview/metrics` | Yes | — | No | No | Partially tested |
| 26 | `/overview/settings` | Yes | Yes | Yes (read values, save present) | Yes | **Complete** (save semantics verified by the project suite) |
| 27 | `/overview/ai-governance` | Yes | — | Yes (WF-J: policy toggle persists) | No | **Interaction verified** (chat path needs a provider) |
| 28 | `/overview/backup` | Yes | Yes | Yes (WF-I: real JSON download) | No | **Export verified**; restore untested |
| 29 | `/overview/formulas` | Yes | — | No | No | Partially tested |
| 30 | `/login` | Yes (via auth suite) | — | Yes (sign-in, wrong password, sign-out) | No | **Complete** (auth suite + KB checks) |

## Button-sweep coverage

Every route in rows 2–29 was additionally swept by clicking each enabled visible
button, reloading between clicks: **251 clicks, zero console errors**. That sweep
verifies "the control responds", not "the feature is complete" — it does not create
real records or assert resulting data.

Its detector keys only on URL change or `role="dialog"`, so 86 of those clicks
produced neither. Those break down as 23 workspace switches, 8 Next.js dev-overlay
buttons, and 55 others; 6 of the 55 were re-checked by hand and all worked. The
remaining 49 are **unclassified**, not proven dead or proven alive. Rows whose
behaviour rests only on the sweep are therefore still "partially tested".

## Totals

Derived by counting the Status column above. `audit/verify-consistency.mjs` reads
`evidence/reports/route-coverage.json` and fails if these figures stop matching the
table, so they cannot drift by hand-editing.

| Bucket | Count | Meaning |
| --- | --- | --- |
| **Complete** | **5** | UI + interaction verified with a named workflow: `/`, `/productivity/tasks`, `/productivity/insights`, `/overview/settings`, `/login` |
| **Interaction verified** | **4** | A named workflow drove the primary capability: `/productivity/weekly-review` (WF-H), `/finance/transactions` (WF-G), `/finance/import` (WF-F), `/overview/ai-governance` (WF-J) |
| **Export verified** | **1** | `/overview/backup` — export verified (WF-I); restore remains untested |
| **Partially tested** | **20** | Controls swept, rendered, no console errors; record-level behaviour not asserted |
| **Total** | **30** | Every discovered route |

No route is marked complete without interaction evidence. The 20 partials are not
failures — they are routes whose controls respond correctly but whose *data*
behaviour no workflow has asserted yet. Rule 10 applies: this audit is not 100%,
and says so.

Supplementary figures: axe-scanned **11** (10 static routes + the command palette;
Quick Add scanned separately as a dialog) · in the responsive matrix **8** ·
blocked **0** · not tested **0**.
