# Route & Interface Inventory

**Audit Date**: November 6, 2026  
**Total User-Facing Views**: 24 UI Routes  
**Total Server API Endpoints**: 20 REST Endpoints  
**Base Server URL**: `http://localhost:3001`

---

## 1. User-Facing UI Routes (App Router)

### 1.1 Productivity Workspace
| Route | Page Component | Primary Purpose & Key Features | Authentication |
| :--- | :--- | :--- | :---: |
| `/` | `src/app/page.tsx` | **Productivity Dashboard**: Today's priorities, active habits, projects in flight, recent activity | Local Session |
| `/productivity/inbox` | `src/app/productivity/inbox/page.tsx` | **GTD Capture & Triage**: Fast entry of raw thoughts, priority tagging, project assignment | Local Session |
| `/productivity/today` | `src/app/productivity/today/page.tsx` | **Today & Day Planner**: Time-blocked day calendar, unassigned backlog, AI Day-Plan schedule proposer | Local Session |
| `/productivity/weekly-review` | `src/app/productivity/weekly-review/page.tsx` | **Weekly Review Workspace**: Retrospective audit of completed work, habits, blockers, upcoming commitments | Local Session |
| `/productivity/tasks` | `src/app/productivity/tasks/page.tsx` | **Tasks & Views**: Multi-view task manager (List view, Kanban board, Eisenhower Priority Matrix) | Local Session |
| `/productivity/calendar` | `src/app/productivity/calendar/page.tsx` | **Interactive Calendar**: Monthly schedule grid with tasks, recurring bills, and milestone markers | Local Session |
| `/productivity/projects` | `src/app/productivity/projects/page.tsx` | **Projects & Milestones**: Multi-progress tracking (manual, completion %, weighted task duration, milestones) | Local Session |
| `/productivity/habits` | `src/app/productivity/habits/page.tsx` | **Habits & Routines**: Daily streaks, best streak, 7-day consistency dot grid, morning/evening routine checklists | Local Session |
| `/productivity/goals` | `src/app/productivity/goals/page.tsx` | **Goals & Targets**: Directional target tracking (ascending growth targets, descending debt/weight targets) | Local Session |
| `/productivity/focus` | `src/app/productivity/focus/page.tsx` | **Focus Timer**: Pomodoro & deep work sessions (15m/25m/50m), distraction logging, task linking, DB persistence | Local Session |
| `/productivity/insights` | `src/app/productivity/insights/page.tsx` | **Productivity Analytics**: Estimated vs actual duration delta, throughput velocity, habit consistency rates | Local Session |

### 1.2 Finance Workspace
| Route | Page Component | Primary Purpose & Key Features | Authentication |
| :--- | :--- | :--- | :---: |
| `/finance` | `src/app/finance/page.tsx` | **Finance Dashboard**: Liquid funds, Net Worth card, Safe-to-Spend pulse, Cashflow summary, recent ledger | Local Session |
| `/finance/transactions` | `src/app/finance/transactions/page.tsx` | **Transactions Ledger**: Double-entry journal lines, search, category filters, account reconciliation | Local Session |
| `/finance/accounts` | `src/app/finance/accounts/page.tsx` | **Accounts & Balances**: Checking, Savings, Credit Cards, Loans, Investments with exact balances | Local Session |
| `/finance/budgets` | `src/app/finance/budgets/page.tsx` | **Budgets & Envelopes**: Spending caps by category, spent tracking, rollover forward mechanics | Local Session |
| `/finance/recurring` | `src/app/finance/recurring/page.tsx` | **Bills & Subscriptions**: Recurring obligations calendar, projection vs auto-post, reminder lead times | Local Session |
| `/finance/savings` | `src/app/finance/savings/page.tsx` | **Savings Goals & Sinking Funds**: Earmarked reserves (Emergency Fund, Tax Buffer) subtracted from liquid spendable | Local Session |
| `/finance/debts` | `src/app/finance/debts/page.tsx` | **Debts & Liabilities**: Principal balance, APR %, Avalanche vs Snowball payoff simulators with extra monthly payment | Local Session |
| `/finance/net-worth` | `src/app/finance/net-worth/page.tsx` | **Net Worth Valuation**: Valued assets minus valued liabilities, ledger breakdown, drill-down queries | Local Session |
| `/finance/reports` | `src/app/finance/reports/page.tsx` | **Reports & Forecasts**: Operating income vs expense cashflow with transfers excluded and refunds netted | Local Session |
| `/finance/import` | `src/app/finance/import/page.tsx` | **CSV Import Studio**: Column mapping, deduplication check, atomic commit, 1-click batch rollback | Local Session |

### 1.3 Overview & Platform Domain
| Route | Page Component | Primary Purpose & Key Features | Authentication |
| :--- | :--- | :--- | :---: |
| `/overview` | `src/app/overview/page.tsx` | **Executive Pulse**: High-level cross-module summary with user-configurable cards (priorities, safe-to-spend, habits) | Local Session |
| `/overview/metrics` | `src/app/overview/metrics/page.tsx` | **Metric Dictionary**: Authoritative dictionary of calculation definitions, what counts, what does not count, formulas | Local Session |
| `/overview/formulas` | `src/app/overview/formulas/page.tsx` | **Custom Formula Studio**: Safe AST recursive descent formula evaluator without eval (`IF`, `ROUND`, `MIN`, `MAX`) | Local Session |
| `/overview/ai-governance` | `src/app/overview/ai-governance/page.tsx` | **AI Governance & Policies**: Capability level controls (read, prepare, auto-execute), diff hash requirement | Local Session |
| `/overview/settings` | `src/app/overview/settings/page.tsx` | **Personal Operating Rules**: Work hours, max daily workload, focus windows, safety buffer, quiet hours | Local Session |
| `/overview/backup` | `src/app/overview/backup/page.tsx` | **Backup & Portability**: Full JSON export and JSON restore with automated pre-restore WAL snapshot | Local Session |

---

## 2. Global Modals & Slide-Over Drawers

| Component | File Path | Interaction & Hotkey |
| :--- | :--- | :--- |
| **Command Palette** | `src/components/modals/CommandPaletteModal.tsx` | `Cmd+K` / `Ctrl+K`: Global fuzzy search across tasks, projects, transactions, navigation |
| **Universal Quick-Add** | `src/components/modals/QuickAddModal.tsx` | `Cmd+N` / `Ctrl+N`: Omnipresent capture modal for tasks, transactions, and habits |
| **Calculation Explainer Drawer** | `src/components/modals/ExplainerDrawer.tsx` | Click "How is this calculated?": Slide-over detailing formula, accounts, assumptions, inputs |
| **AI Assistant Drawer** | `src/components/modals/AiAssistantDrawer.tsx` | Assistant button: 3-tier capability chat, action proposal drafts, SHA-256 diff hash approval workflow |

---

## 3. Server REST API Inventory

- `/api/tasks` (GET, POST, PUT, DELETE)
- `/api/projects` (GET, POST, PUT)
- `/api/habits` (GET, POST)
- `/api/habits/log` (POST, DELETE)
- `/api/goals` (GET, POST)
- `/api/calendar` (GET)
- `/api/planning` (GET)
- `/api/focus` (GET, POST)
- `/api/finance/accounts` (GET, POST)
- `/api/finance/transactions` (GET, POST, DELETE)
- `/api/finance/budgets` (GET, POST)
- `/api/finance/safe-to-spend` (GET)
- `/api/finance/net-worth` (GET)
- `/api/finance/recurring` (GET, POST)
- `/api/finance/savings-goals` (GET, POST)
- `/api/finance/debts` (GET, POST)
- `/api/finance/import` (POST, DELETE)
- `/api/finance/reports` (GET)
- `/api/ai/chat` (POST)
- `/api/ai/approvals` (GET, POST)
- `/api/ai/policies` (GET, PUT)
- `/api/settings` (GET, PUT)
- `/api/backup/restore` (POST)
- `/api/search` (GET)
- `/api/spaces` (GET)
- `/api/customization/formula/test` (POST)
