# Blockers and Limitations

Nothing fully blocked the audit. These are the limits, stated so no result is read as broader than it is.

| # | Limitation | Impact | Workaround used |
| --- | --- | --- | --- |
| 1 | **Chromium only.** WebKit and Firefox were not available in this environment. | Safari/iOS rendering, `aria-*` propagation and scroll behaviour are **unverified**. | None. Claims are scoped to Chromium. |
| 2 | **Seeded, small dataset.** The audit profile holds a handful of tasks and the sample accounts from first boot. | Behaviour with hundreds of rows, dense calendars, or paginated tables is **untested**. Palette result counts and table density conclusions may not hold at volume. | Documented as an assumption; no volume claims made. |
| 3 | **AI chat needs a provider.** `/overview/ai-governance` policy switches were verified (WF-J); the assistant *chat* path and plan generation require a configured model. | Chat and generation **not tested**. | Policy toggles verified end to end; the chat path is the remaining gap. |
| 4 | *(Resolved)* Finance CRUD was driven against a **disposable profile** (`PERSONAL_OS_DB_PATH=/tmp/wf-db`), never the operator's database. | Tested — WF-G. | Create → verify → void, all against a throwaway DB. |
| 5 | *(Resolved)* Production performance **was** measured — Lighthouse against the standalone build. | Tested — `PERFORMANCE_FINDINGS.md`. | 97/100/100/100; FCP/LCP 0.9 s, TBT 210 ms, CLS 0.012 on `/`. Other routes remain unprofiled. |
| 6 | *(Resolved)* CSV import exercised end to end with a real 2-row file: upload → preview → commit (WF-F). | Tested. | Row-level assertions on the committed transactions were not made; the UI path was verified. |
| 7 | **No non-Chromium automated accessibility tool.** | axe results reflect Chromium's accessibility tree only. | Manual keyboard checks supplemented axe. |

## Not a blocker but worth stating

The audit ran against a **local dev server in open mode**, not against production. Production carries an additional layer (auth gate, reverse proxy, TLS) that was verified separately in the deployment work, but the UI findings here are independent of that layer — open mode renders the same shell.
