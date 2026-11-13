# Blockers and Limitations

Nothing fully blocked the audit. These are the limits, stated so no result is read as broader than it is.

| # | Limitation | Impact | Workaround used |
| --- | --- | --- | --- |
| 1 | **Chromium only.** WebKit and Firefox were not available in this environment. | Safari/iOS rendering, `aria-*` propagation and scroll behaviour are **unverified**. | None. Claims are scoped to Chromium. |
| 2 | **Seeded, small dataset.** The audit profile holds a handful of tasks and the sample accounts from first boot. | Behaviour with hundreds of rows, dense calendars, or paginated tables is **untested**. Palette result counts and table density conclusions may not hold at volume. | Documented as an assumption; no volume claims made. |
| 3 | **AI surfaces need a provider.** `/overview/ai-governance`, the AI assistant drawer and plan generation require a configured model. | Those flows are **not tested**. | Presence and rendering verified only. |
| 4 | **Destructive finance operations were not driven.** Deleting accounts or transactions could corrupt the audit profile's coherence mid-run. | Finance CRUD flows are **not tested**. | Table rendering, overflow and accessibility were measured instead. |
| 5 | **Production performance not measured.** All timings came from `next dev`. | No Core Web Vitals claim is possible. | Reported as relative/dev-only and labelled. |
| 6 | **CSV import not exercised end-to-end.** Requires a valid statement file through the file input. | The import workflow is **not tested** here (it is covered by the project's own E2E suite, which I did not re-verify). | Recorded as open coverage. |
| 7 | **No non-Chromium automated accessibility tool.** | axe results reflect Chromium's accessibility tree only. | Manual keyboard checks supplemented axe. |

## Not a blocker but worth stating

The audit ran against a **local dev server in open mode**, not against production. Production carries an additional layer (auth gate, reverse proxy, TLS) that was verified separately in the deployment work, but the UI findings here are independent of that layer — open mode renders the same shell.
