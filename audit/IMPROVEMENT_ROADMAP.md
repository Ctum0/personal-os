# Improvement Roadmap

Organised by root cause (see `ROOT_CAUSE_ANALYSIS.md`), so each stage removes a class of defect rather than a single instance.

---

## Stage A — Critical fixes

Nothing here is a data-loss or security defect. A-2 is the one a phone user hits immediately; A-1 was re-graded to P2 during review because arrowing still reached every command.

### A-1 — Make the command palette filter its own commands · **P2** · DONE

| | |
| --- | --- |
| Fixes | BUG-001, UX-002 |
| Route | Global (Ctrl+K) |
| Root cause | RC-1 |
| Depends on | Nothing |
| Complexity | Small — one component, one predicate, grouped rendering |
| Acceptance | Typing `settings` surfaces the Settings command; commands and records render in labelled groups; empty query still lists all 10 commands; Escape/arrow/Enter behaviour unchanged |

**Approach:** change the result model to `{ kind: 'command' | 'record' }`, filter `commands` client-side by label + keywords on every keystroke, and concatenate with the debounced server results. Commands first.

### A-2 — Give wide content one overflow primitive, and use it everywhere · **P1** · DONE for the calendar; tables pending

| | |
| --- | --- |
| Fixes | RESP-001 (P1), RESP-002/003/004 |
| Routes | `/productivity/calendar`, all finance tables |
| Root cause | RC-2 |
| Depends on | Nothing |
| Complexity | Small component + mechanical adoption at 4 call sites |
| Acceptance | At 390px the calendar's last column is reachable (scroll or fit); every table and the calendar share one wrapper; a visible edge fade appears when content overflows; no horizontal document scroll at any of the 8 audited viewports |

### A-3 — Fix the palette's three AA violations · **P1** · DONE

| | |
| --- | --- |
| Fixes | A11Y-008 |
| Route | Global (Ctrl+K) |
| Root cause | RC-3 |
| Depends on | Nothing (can ship with A-1) |
| Complexity | Small — two colours and one label string |
| Acceptance | axe returns 0 violations with the palette **open**; the scope chip's accessible name starts with its visible text |

---

## Stage B — Major usability improvements

### B-1 — Automate the open-dialog accessibility pass · **P2**

| | |
| --- | --- |
| Fixes | A11Y-009 (prevents recurrence of A11Y-008) |
| Root cause | RC-3 |
| Complexity | Small — extend the existing sweep |
| Acceptance | The sweep opens each dialog via its keyboard shortcut, runs axe, closes it, and fails on violations |

### B-2 — Stop rendering a fabricated identity · **P2**

| | |
| --- | --- |
| Fixes | BUG-003, UI-001 |
| Root cause | Secondary (optional identity rendered as mandatory) |
| Complexity | Trivial |
| Acceptance | Open mode shows a neutral "no sign-in configured" affordance; a configured operator shows their initials |

### B-3 — Confirm task capture · **P2**

| | |
| --- | --- |
| Fixes | UX-001 |
| Root cause | None shared — a single missing feedback path |
| Complexity | Small |
| Acceptance | A captured task is announced via `aria-live` and visibly highlighted; the list scrolls it into view if off-screen |

### B-4 — Undo instead of confirm for archiving · **P3**

| | |
| --- | --- |
| Fixes | UI-003 |
| Complexity | Medium (needs a deferred-commit or restore endpoint) |
| Acceptance | Archiving is immediately reversible from a toast for at least 5 seconds; the native `confirm` is gone |
| Note | The current `window.confirm` works and is not a defect — this is a friction improvement, and the least urgent item here |

---

## Stage C — Refinement

| Item | Fixes | Complexity | Acceptance |
| --- | --- | --- | --- |
| Raise the minimum informational text size to 12px; reserve 10–11px for shortcut hints | UI-002 | Small | No leaf text carrying information measures below 12px |
| Debounce the palette to 250 ms and abort superseded requests | PERF-001 | Small | At most one in-flight search; no request per keystroke |
| Pull each page's primary control above the fold at 1366×768 | UI-004 | Small | Primary action visible without scrolling at 1366×768 on `/productivity/plan` and `/productivity/focus` |
| **Run the accessibility sweep at 390px as well as 1440** | A11Y-010 (found only by Lighthouse) | Small — one loop change | `axe-sweep` audits each route at both widths; the unnamed Productivity toggle fails at 390 and passes at 1440, so a desktop-only sweep cannot catch it |
| Automate the two remaining workflow gaps: backup **restore** through the UI, and the assistant chat path (needs a provider) | — | Medium | Each journey has an automated test |

---

## Sequencing

**A-1 → A-3** landed together (same component). **A-2** landed independently. **B-1** landed with them, so the open-dialog gate protects that fix. What is left in Stage C is independent and can be ordered by appetite.

A-1, A-2, A-3 and B-1 are **done** (see `MASTER_PROGRESS.md`); the roadmap is kept
for the reasoning, not as a to-do list.

## What is deliberately NOT recommended

- **No visual redesign.** The interface is coherent: consistent dark surface, disciplined heading hierarchy, one `h1` per page, working focus management. There is no evidence justifying a restyle, and the audit's rule is that decoration must earn its place with usability.
- **No change to the shell.** Navigation, workspace switching, history behaviour and skip-link semantics all tested correctly.
- **No performance work beyond PERF-001.** The production Lighthouse run (97/100/100/100; FCP/LCP 0.9 s, TBT 210 ms, CLS 0.012 on `/`) supports that: there is no measured defect to optimise. TBT sits marginally over the "good" boundary on a CPU-throttled mobile profile with no real-world symptom, so treating it as a target would be optimising the measurement, not the product.
