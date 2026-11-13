# Workflow Testing

End-to-end journeys driven in a real browser. Where a first attempt reported a failure that turned out to be my own probe error, the correction is recorded rather than the failure being quietly deleted — see `DECISIONS_AND_ASSUMPTIONS.md` for the method.

## WF-A — Create → find → archive → confirm gone

| Step | Expected | Actual | Result |
| --- | --- | --- | --- |
| A1 | Enter a title + Enter creates the task | Task visible immediately | **PASS** |
| A2 | Searching the title narrows the list to it | Match only | **PASS** |
| A3 | Archive removes it | `confirm()` shown → accept → `DELETE /api/tasks?id=… 200` → row gone → survives reload as gone | **PASS** |
| A4 | Cancelling the confirm leaves the task | No `DELETE` sent, row remains | **PASS** |

A3 initially reported FAIL because my automation never handled the native `window.confirm`, which auto-dismisses. That is a probe defect, not a product defect. Re-run with the dialog accepted: correct behaviour.

## WF-B — Persistence across refresh

| Step | Expected | Actual | Result |
| --- | --- | --- | --- |
| B1 | A created task survives `reload()` | Present after reload | **PASS** |

## WF-C — Navigation and history

| Step | Expected | Actual | Result |
| --- | --- | --- | --- |
| C1 | Client-side nav to Accounts, then Back returns to the ledger | `/finance/transactions` → `/finance/accounts` → Back → `/finance/transactions` | **PASS** |
| C2 | A second Back reaches the previous section | `/productivity/tasks` | **PASS** |
| C3 | Workspace switch navigates | Productivity ⇄ Finance changes route | **PASS** |

C1 initially reported FAIL because my probe clicked the *workspace* switcher (which pushes a new entry) rather than a sidebar link, then asserted about a different URL. Probe defect; re-tested with a sidebar link and both Back presses behave correctly.

## WF-D — Settings read/write surface

| Step | Expected | Actual | Result |
| --- | --- | --- | --- |
| D1 | Settings exposes its current values | First numeric field reads `6.5` (max daily workload hours) | **PASS** |
| D2 | A save affordance exists | One "Save" control | **PASS** |
| D3 | Saving persists | Covered by the project's E2E suite (`settings save`) | **Verified elsewhere**, not re-drilled here |

## WF-E — Sign-in → use → sign-out (from the auth gate work)

| Step | Expected | Actual | Result |
| --- | --- | --- | --- |
| E1 | Wrong password rejected | `401` | **PASS** |
| E2 | Correct password issues a session | `200` + cookie | **PASS** |
| E3 | Deep link survives the round trip | Landed on the requested page | **PASS** |
| E4 | Sign out ends the session server-side | `DELETE 200`, then `/api/tasks` → `401` | **PASS** |
| E5 | Throttled failure does not block a correct password | `200` while throttled | **PASS** |

## Journeys NOT completed

| Journey | Status | Why |
| --- | --- | --- |
| CSV import end-to-end through the studio | **Not tested** in this pass | Requires a file upload with a valid statement; covered by the project's E2E suite but not independently re-verified here |
| Weekly review create → save → reopen | **Not tested** | Not reached |
| Finance transaction create → edit → delete through the UI | **Not tested** | Only the table rendering was inspected |
| AI assistant / governance approval flow | **Not tested** | Requires a configured model provider |
| Backup export → restore round trip through the UI | **Not tested** in this pass | Covered by unit tests (`api-regressions.test.ts`), not by a UI drill here |

These are recorded as open coverage, not as passes.
