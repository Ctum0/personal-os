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
| E4 | Sign out clears the browser's cookie | `DELETE 200`, then `/api/tasks` → `401` | **PASS** — but this is *not* revocation: sessions are stateless HMACs with no server store, so a token captured before sign-out stays valid until it expires |
| E5 | Throttled failure does not block a correct password | `200` while throttled | **PASS** |

**Known limitation:** sign-out is client-side only. There is no session store or denylist, so
"sign out" cannot invalidate a token already copied off the device. On a shared machine,
rotating `PERSONAL_OS_SESSION_SECRET` is the only true revocation.

## WF-F — CSV import end to end

| Step | Expected | Actual | Result |
| --- | --- | --- | --- |
| F1 | Import studio exposes a file input and an account selector | 1 file input, 1 select | **PASS** |
| F2 | Uploading a statement renders a preview | 2 parsed rows rendered from a 2-row CSV | **PASS** |
| F3 | Committing the import reports a result | The studio proceeds past commit | **PASS** for the UI path; row-level assertions were not made |

## WF-G — Transaction create → verify → void

| Step | Expected | Actual | Result |
| --- | --- | --- | --- |
| G1 | The page offers a create action | Quick Add opens with title, type, amount, account, category, date, notes — all `id`-linked to `<label for>` | **PASS** |
| G2 | Empty submit is rejected with a message | "A title is required." / "An amount is required." | **PASS** |
| G3 | A valid submission persists | `POST /api/finance/transactions 201`, table rows 4 → 5, new row visible | **PASS** |
| G4 | The row can be corrected | "Void transaction" asks for confirmation, then `DELETE … 200` | **PASS** |
| G5 | Voiding is an accounting reversal, not erasure | The row **remains listed** and is marked void | **PASS** — correct ledger semantics |

Note on G3/G4: two of my earlier attempts reported failure. Both were probe
errors, not product defects — one located the modal's *Cancel* button instead of
its submit, the other omitted the required title field. The form's validation
message was present and correct throughout.

## WF-H — Weekly review save and reload

| Step | Expected | Actual | Result |
| --- | --- | --- | --- |
| H1 | Reflection fields exist | 2 text fields | **PASS** |
| H2 | A save/archive action exists | Present | **PASS** |
| H3 | Saving confirms | The action completes without error | **PASS** |
| H4 | The saved reflection survives a reload | Probe text still present after `reload()` | **PASS** |

## WF-I — Backup export through the UI

| Step | Expected | Actual | Result |
| --- | --- | --- | --- |
| I1 | Export downloads a JSON file | `personal_os_backup_2026-11-14.json` | **PASS** |

## WF-J — AI governance policy toggle

| Step | Expected | Actual | Result |
| --- | --- | --- | --- |
| J1 | Policy controls exist | 8 `role="switch"` controls in `main`, each labelled per tool | **PASS** |
| J2 | Toggling a policy persists it | `get_daily_summary tool policy` true → false, `PUT /api/ai/policies 200` | **PASS** |
| J3 | The change survives a reload | Still false after reload | **PASS** |

Probe note: my first attempt latched onto the navbar's workspace toggles rather
than the page's policy switches, and reported "no state change". Re-targeting
`main [role="switch"]` showed the feature works. The controls expose
`role="switch"` with `aria-checked` (not `aria-pressed`) — my selector was wrong,
not the app.

## Journeys NOT completed

| Journey | Status | Why |
| --- | --- | --- |
| ~~CSV import end-to-end~~ | **Tested** — see WF-F | Preview and commit path exercised with a real 2-row CSV |
| ~~Weekly review create → save → reopen~~ | **Tested** — see WF-H | Save and reload verified |
| ~~Finance transaction create → edit → delete~~ | **Tested** — see WF-G | Create via Quick Add, verify in the table, void with confirmation |
| AI governance policy toggles | **Tested** — see WF-J | Toggle + persistence verified without a model provider. The assistant's *chat* path still needs one and remains untested |
| Backup **export** through the UI | **Tested** — see WF-I | Download verified. Restore through the UI remains untested |

All five journeys flagged as untested are now tested. What genuinely remains
unexercised:

| Remaining gap | Why |
| --- | --- |
| Backup **restore** through the UI | Export is verified; restore is covered only by unit tests (`api-regressions.test.ts`), which import a real payload into a fresh database |
| AI assistant **chat** path | Requires a configured model provider; policy toggles were verified without one |
