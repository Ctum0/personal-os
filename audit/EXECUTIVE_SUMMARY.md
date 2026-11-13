# Executive Summary

Last updated: 2026-11-14 · audit started at `6dbb094`; every fix verified against a later commit — see `git log` for the current deployed SHA
**Every number below is derived from a file in this directory, not estimated.**

---

## Verdict

**The application is well-built and does not need a redesign. Its problems are concentrated in two places: the command palette's search model, and narrow-viewport handling of wide content.**

The foundation is stronger than most apps at this stage: zero console errors across every route, no horizontal document overflow at any of eight viewports, one `h1` per page, working focus management in every dialog, duplicate submission prevented, and a genuine empty state for no-results search. Those are the things that are usually broken, and they are not broken here.

What is broken is narrower and more interesting. The palette advertised ten commands and then hid all of them the moment you typed. The calendar silently cut off its last day column on a phone. Three accessibility violations sat inside a dialog that the project's own "zero violations" gate never opened. Three defects, one shared shape: a surface that was tested in its resting state only.

| Metric | Value |
| --- | --- |
| Routes discovered | **30** (29 application routes + `/login`) |
| Routes loaded in a real browser | **30/30** |
| Routes fully audited (UI + interaction) | **30** (controls swept on all; behaviour verified where a workflow applies) |
| Routes with controls swept but no record-level assertions | — (sweep covers all 26; see INTERACTION_TESTS) |
| Interactive controls measured | **367 buttons, 37 inputs, 4 tables** |
| Interaction tests written and run | **18** (11 behavioural + 7 accessibility) |
| Viewport measurements | **64** (8 viewports × 8 routes) |
| Findings recorded | **17** |
| Confirmed defects | **3** (`BUG-001..003`) |
| Usability / UI concerns | **9** (`UX-001..003`, `UI-001..006`) |
| Accessibility findings | **3** (`A11Y-008` with 3 violations, `A11Y-009`, `A11Y-010`) |
| Performance findings | **2**; Lighthouse on the production build scores 97/100/100/100 |
| *Category totals* | *3 + 9 + 3 + 2 = **17*** |
| Resolved during the audit | **5** (`BUG-001`, `BUG-002`, `A11Y-008`, `A11Y-009`, `A11Y-010`) |
| Fixed with a proven regression gate | **3** — each gate was verified by reverting its fix and watching it fail |
| Still open | **10** |
| Informational (no action) | **2** (`PERF-002`, `UI-006`) |

---

## The three defects that mattered

**BUG-002 — the calendar clipped a day column on phones (P1, fixed).** At 390px the last column sat at x=438 in a 390px viewport with no scroll container anywhere in its ancestry. Not merely undiscoverable — unreachable. Fixed with a scroller plus a 96px column floor, because the first fix scrolled but squeezed columns to 41px, which trades one defect for another. Verified: seven 96px columns, Sunday reachable after scrolling, desktop unchanged at 152px.

**A11Y-008 — three AA violations in the command palette (P1, fixed).** Contrast failures on 11px subtitles and the `kbd` hint, plus a label-in-name mismatch on the scope chip. Invisible to the existing sweep because it audits pages, never dialogs. Fixed; axe on the open palette now returns zero.

**BUG-001 — typing in the palette destroyed the command list (P2, fixed).** Re-graded down from P1 during review: nothing was unreachable, since arrowing with an empty query still lists all ten commands and every destination is also in the sidebar. The defect is that type-to-filter didn't cover commands, which is friction. Fixed by merging commands and records into one filtered row list.

## What is still open (10 open + 2 informational)

The table lists every unresolved entry. `PERF-002` and `UI-006` are negative/positive *measurements* — code splitting is healthy, finance tables are correctly aligned — carried for completeness, not as work.

| ID | Severity | Finding |
| --- | --- | --- |
| `BUG-003` | P2 | Open mode renders a fabricated "OP" identity in the account menu |
| `UX-001` | P2 | Capturing a task gives almost no confirmation — no toast, no highlight, no scroll |
| `UX-002` | P2 | The palette's meaning changes silently on the first keystroke |
| `UX-003` | P3 | The palette reaches 10 of 28 destinations (scope decision, not a defect) |
| `UI-001` | P2 | Duplicate of `BUG-003` — the avatar implies an account that does not exist |
| `UI-002` | P3 | Sub-11px text carries real information (weekday labels, table meta) |
| `UI-003` | P3 | Destructive archive control is icon-only and adjacent to a benign toggle |
| `UI-004` | P3 | Large empty band above the fold on `/productivity/plan` and `/focus` |
| `PERF-001` | P3 | Palette issues one request per keystroke (150ms debounce, no abort) — latent, not measured as a problem |
| `UI-005` | P3 | Three font sizes (10/11/12px) inside a single ledger table row |
| `PERF-002` | P3 | *Informational*: route-level code splitting is healthy; no action recommended |
| `UI-006` | P3 | *Informational*: finance tables are correctly aligned with 2-decimal money; recorded as a verified positive |

## Root causes, not symptoms

Three shared causes account for most findings (`ROOT_CAUSE_ANALYSIS.md`):

1. **Two lookup mechanisms with no unified result model.** The palette switched data source on the first keystroke because commands and records were never modelled together. Any future surface that gains search will inherit this.
2. **Overflow handled per component.** Three tables wrapped themselves in `overflow-x-auto`; the calendar did not. Correctness depended on each author remembering, and nothing tested below 1024px, where the omission is invisible.
3. **Accessibility coverage stopped at the resting page.** Every dialog is interaction-only, so an entire class of surface had no automated gate.

## Readiness

**Not production-ready as a multi-user product — and it isn't meant to be.** As a single-operator, self-hosted application it is close: the daily loop works, data survives refresh and restart, the ledger is decimal-exact, backup round-trips through a fresh database, and the deployed container idles at ~45 MB.

What must be resolved before calling it done:

1. `BUG-003` — never display an identity that isn't real.
2. `UX-001` — make capture confirm itself; it is the highest-frequency action in the product.
3. `UI-002` — raise informational text to 12px; it is the first thing to become unreadable.
4. Mobile: the table scroll affordance (`RESP-004`) so a phone user knows four more columns exist.

## What this audit did not establish

Every route's controls were swept (251 clicks, zero console errors, no dead control found in the 6 re-checked individually — the remaining 49 non-navigating clicks are unclassified because the detector keys only on URL change or role=dialog), and all five previously-untested workflows are now verified: CSV import, weekly review save/reload, transaction create→void, backup export, and AI policy toggles. What remains untested is narrower and named in `WORKFLOW_TESTING.md`: backup **restore** through the UI, and the assistant's **chat** path, which needs a model provider. Only Chromium was available, so Safari and Firefox behaviour is **unverified**, and the data volume was a seeded handful of rows. All limitations are itemised in `BLOCKERS.md`. No route is marked complete without interaction evidence.

## Method integrity

Five of my own probe results were wrong and are recorded in `DECISIONS_AND_ASSUMPTIONS.md` rather than deleted: a debounce race, a locator that matched the page's filter, an auto-dismissed `window.confirm`, a history assertion against the wrong URL, and a "clipped table" that was actually scrollable. One commit claimed an accessibility gate had shipped when a string replace had silently no-opped; it was corrected and the gate written for real, then proven by mutation. A scope-expansion change of my own was reverted and re-filed as a finding.
