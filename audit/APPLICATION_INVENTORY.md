# Application Inventory

30 user-facing routes were discovered from the filesystem (`src/app/**/page.tsx`), cross-checked against the sidebar navigation (28 entries) and the in-app link graph.

## Shell

| Element | Where |
| --- | --- |
| Top navbar | workspace switcher (Productivity / Finance), space menu, search trigger, Quick Add, Assistant console, sync indicator, account menu |
| Sidebar | 28 destinations grouped by workspace |
| Global dialogs | command palette (Ctrl+K), Quick Add (Ctrl+N), explainer drawer, AI assistant drawer |
| Sign-in | `/login`, outside the application shell |

## Routes

| # | Route | Purpose | Primary controls |
| --- | --- | --- | --- |
| 1 | `/` | Today's cockpit | 15 buttons, quick capture |
| 2 | `/productivity/today` | Daily focus | 23 buttons |
| 3 | `/productivity/plan` | AI day planner | 18 buttons, 2 inputs |
| 4 | `/productivity/tasks` | Task management | 24 buttons, search, 3 filters, quick capture |
| 5 | `/productivity/projects` | Projects | 9 buttons |
| 6 | `/productivity/inbox` | Capture triage | 11 buttons |
| 7 | `/productivity/calendar` | Time blocking | 15 buttons |
| 8 | `/productivity/habits` | Habits and routines | 15 buttons |
| 9 | `/productivity/goals` | Goals | 11 buttons |
| 10 | `/productivity/focus` | Focus timer | 14 buttons |
| 11 | `/productivity/analytics` | Analytics | 15 buttons |
| 12 | `/productivity/insights` | Redirect stub → analytics | none (redirect) |
| 13 | `/productivity/weekly-review` | Review workflow | 10 buttons, 2 inputs |
| 14 | `/finance` | Finance overview | 12 buttons |
| 15 | `/finance/accounts` | Accounts | 16 buttons |
| 16 | `/finance/transactions` | Ledger | 10 buttons, 3 inputs, 1 table |
| 17 | `/finance/budgets` | Budgets | 8 buttons, 1 table |
| 18 | `/finance/recurring` | Recurring rules | 8 buttons |
| 19 | `/finance/savings` | Savings goals | 8 buttons |
| 20 | `/finance/debts` | Debt payoff | 9 buttons, 1 table |
| 21 | `/finance/net-worth` | Net worth | 9 buttons, 1 table |
| 22 | `/finance/import` | CSV import | 7 buttons, 2 inputs |
| 23 | `/finance/reports` | Reports | 11 buttons, 2 inputs |
| 24 | `/overview` | Executive pulse | 8 buttons |
| 25 | `/overview/metrics` | Metric dictionary | 17 buttons |
| 26 | `/overview/settings` | Settings | 8 buttons, 10 inputs |
| 27 | `/overview/ai-governance` | AI policy controls | 19 buttons |
| 28 | `/overview/backup` | Export / restore | 9 buttons |
| 29 | `/overview/formulas` | Formula studio | 12 buttons, 2 inputs |
| 30 | `/login` | Sign-in | 2 inputs, 1 submit |

`/productivity/insights` is a client-side redirect stub to `/productivity/analytics`. It renders an `h1` before navigating, which is why a naive scan reports two `h1`s during the transition — **not a defect** (see `DECISIONS_AND_ASSUMPTIONS.md`).

## Control inventory (measured, not estimated)

Total interactive controls observed across the 29 routes loaded by the scan: **367 buttons**, **37 inputs/selects/textareas**, **4 data tables** (measured, from `evidence/reports/route-scan.json`). Global dialogs add a command palette (10 commands, searchable) and a Quick Add form.
