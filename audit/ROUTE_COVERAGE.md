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
| 13 | `/productivity/weekly-review` | Yes | — | No | Yes | Partially tested |
| 14 | `/finance` | Yes | — | No | No | Partially tested |
| 15 | `/finance/accounts` | Yes | Yes | No | No | Partially tested |
| 16 | `/finance/transactions` | Yes | Yes | No | Yes | Partially tested |
| 17 | `/finance/budgets` | Yes | — | No | Yes | Partially tested |
| 18 | `/finance/recurring` | Yes | — | No | No | Partially tested |
| 19 | `/finance/savings` | Yes | — | No | No | Partially tested |
| 20 | `/finance/debts` | Yes | — | No | No | Partially tested |
| 21 | `/finance/net-worth` | Yes | — | No | Yes | Partially tested |
| 22 | `/finance/import` | Yes | Yes | No | Yes | Partially tested |
| 23 | `/finance/reports` | Yes | — | No | No | Partially tested |
| 24 | `/overview` | Yes | — | No | No | Partially tested |
| 25 | `/overview/metrics` | Yes | — | No | No | Partially tested |
| 26 | `/overview/settings` | Yes | Yes | Yes (read values, save present) | Yes | **Complete** (save semantics verified by the project suite) |
| 27 | `/overview/ai-governance` | Yes | — | No | No | Partially tested |
| 28 | `/overview/backup` | Yes | Yes | No | No | Partially tested |
| 29 | `/overview/formulas` | Yes | — | No | No | Partially tested |
| 30 | `/login` | Yes (via auth suite) | — | Yes (sign-in, wrong password, sign-out) | No | Partially tested |

## Totals

- Routes discovered: **30**
- Loaded in a real browser: **30/30**
- Axe-scanned: **11** (10 static + palette; Quick Add scanned separately as a dialog)
- Interaction-tested: **5** (`/`, `/productivity/tasks`, `/overview/settings`, `/login`, plus global dialogs)
- In the responsive matrix: **8**
- Fully complete: **4**
- Partially tested: **26**
- Blocked: **0**
- Not tested: **0**

**No route is claimed as fully audited without interaction evidence.** The 26 partially-tested routes were verified to render, structurally parse, and produce no console errors — which is a real result, but it is not a functional audit of their controls.
