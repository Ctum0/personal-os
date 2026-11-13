# Feature Inventory

| Feature | Surface | Exercised? | Evidence |
| --- | --- | --- | --- |
| Quick capture (task) | `/productivity/tasks`, `/`, navbar Quick Add | **Yes** — create, empty-submit, rapid-submit | INT-001..003 |
| Task search | `/productivity/tasks` | **Yes** — match and no-match | INT-004/005 |
| Task archive | `/productivity/tasks` | **Yes** — with confirm accepted and dismissed | WF-A3/A4 |
| Task filters (priority, project, tabs) | `/productivity/tasks` | Partially — controls present and labelled by `aria-label`/`id`; filtering logic not driven per-option | scan |
| Command palette | Global Ctrl+K | **Yes** — open, type, arrow, Escape, scope chip | INT-006..008, BUG-001 |
| Quick Add dialog | Global Ctrl+N | **Yes** — open, labels, focus trap, Escape | INT-009/010, A11Y-001..003 |
| Account menu / sign-out | Global | **Yes** | Auth suite, WF-E |
| Workspace switch | Navbar | **Yes** | WF-C3 |
| Sidebar navigation | All routes | **Yes** — all 28 destinations return 200 | route scan |
| Space selector | Navbar (productivity) | No — menu opens but selection not verified | — |
| Sync / offline indicator | Navbar | No | — |
| Skip link | All pages | **Yes** | A11Y-006/007 |
| Calendar time blocking | `/productivity/calendar` | No — rendered and measured only | — |
| Habits / routines | `/productivity/habits` | No | — |
| Goals | `/productivity/goals` | No | — |
| Focus timer | `/productivity/focus` | No | — |
| Analytics / insights | `/productivity/analytics` | No | — |
| Weekly review | `/productivity/weekly-review` | No | — |
| Finance accounts | `/finance/accounts` | No | — |
| Transactions ledger | `/finance/transactions` | No — table rendered and measured only | — |
| Budgets | `/finance/budgets` | No | — |
| Recurring rules | `/finance/recurring` | No | — |
| Savings goals | `/finance/savings` | No | — |
| Debt payoff | `/finance/debts` | No | — |
| Net worth | `/finance/net-worth` | No | — |
| CSV import | `/finance/import` | No — form rendered; upload not driven | — |
| Reports | `/finance/reports` | No | — |
| Metric dictionary | `/overview/metrics` | No | — |
| Settings read/write | `/overview/settings` | **Yes** — values read, save control confirmed | WF-D |
| AI governance | `/overview/ai-governance` | No — requires a model provider | — |
| Backup export/restore | `/overview/backup` | No — covered by unit tests, not by UI drill | — |
| Formula studio | `/overview/formulas` | No | — |
| Sign-in / sign-out | `/login` | **Yes** | WF-E |

## Coverage summary

**Exercised through real interaction: 9 features.** **Rendered and structurally verified only: 24 features.** **Not reached: 0 features were skipped without record.**

The distinction matters: a rendered form is not a tested form. Everything marked "No" above is an open coverage gap, listed again in `MASTER_PROGRESS.md` as remaining work.
