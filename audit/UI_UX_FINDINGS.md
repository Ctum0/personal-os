# UI / UX Findings

Design and usability findings. Defects with wrong behaviour live in `FUNCTIONAL_BUGS.md`.

---

## UX-001 — Creating a task gives almost no confirmation

**Severity: P2** · Route: `/productivity/tasks` · Category: feedback

Press Enter in quick capture: the input clears and the row is appended somewhere in the list. If the list is scrolled, or the new task sorts below the fold, **nothing visibly changes** except the input emptying. There is no toast, no row highlight, no scroll-to.

**Why it matters:** the moment of capture is the highest-frequency action in the product. An ambiguous result teaches the operator to re-enter the task — and INT-003 proves duplicates are only prevented by exact re-submission timing, not by making success obvious.

**Recommendation:** briefly highlight the inserted row (`aria-live="polite"` announcement + a 1.5s background flash), or scroll it into view. Reuse for all quick-capture surfaces.

---

## UX-002 — The command palette's purpose changes silently as you type

**Severity: P2** · Component: command palette · Category: mental model

With an empty query the palette lists 10 *commands*. On the first keystroke it becomes a *record search*. The placeholder ("Type a command or search all workspaces…") promises both, but the UI never shows a "Commands" section — the mode swap is invisible, and the command half simply disappears (see BUG-001).

**Recommendation:** two labelled sections in one list — *Commands* (filtered client-side) and *Records* (server results). This keeps both mental models true and makes the empty result self-explanatory.

---

## UI-001 — The account avatar displays an identity that no account holds

**Severity: P2** · Global shell. Full reproduction in `FUNCTIONAL_BUGS.md` BUG-003.

Visually, a two-letter avatar in the top-right is the universal "this is your account" signal. In open mode it says **OP**, which is not a person, a name, or a setting — it is `'OP'` used as a fallback string.

**Recommendation:** when no operator is configured, render a neutral control (e.g. a settings glyph labelled "Local session — no sign-in configured"). Never invent an identity.

---

## UI-002 — Sub-11px text is used for meaningful labels

**Severity: P3** · Multiple routes · Category: typography

Measured leaf text sizes below 11px on 3 of 8 sampled routes at narrow widths:

| Route | Examples |
| --- | --- |
| `/productivity/calendar` | weekday headers, `text-[10px]` |
| `/finance/*` tables | column meta, `text-[10px]` / `text-[11px]` |
| command palette | row subtitles and `kbd` hints, `text-[11px]` |

11px is defensible for a keyboard hint; it is not defensible for a weekday label the user must read to locate a date, and it is the element that also fails contrast (A11Y-008).

**Recommendation:** set a floor of 12px for anything carrying information (labels, table meta, weekday names) and reserve 10–11px for non-essential chrome such as shortcut hints. Pair with the contrast fix so the two are resolved once.

---

## UI-003 — Destructive affordances are icon-only and adjacent to benign ones

**Severity: P3** · `/productivity/tasks` · Category: error prevention

Each task row exposes "Toggle task …" and "Archive task …" as icon-only buttons of similar weight, side by side. Archiving is not reversible from the list itself.

**Recommendation:** give archive a confirmation or a visible undo (preferred — undo is cheaper than a dialog), and differentiate the destructive control's affordance from the toggle's.

---

## UI-004 — Empty vertical band above the fold on several routes

**Severity: P3** · `/productivity/plan`, `/productivity/focus` · Category: layout

On a 1440×900 viewport these pages place a short header then a large empty region before the primary work area, requiring a scroll to reach the main control even though usable space exists. Not a breakage; a utilisation issue.

**Recommendation:** pull the primary control into the first viewport. Verify at 1366×768, the smallest common desktop the audit targets.

---

## UX-003 — The palette reaches only 10 of 28 destinations

**Severity: P3** · Component: command palette · Category: information architecture

The palette is the advertised "jump anywhere" surface (`Ctrl+K`, placeholder "Type a command or search all workspaces"), but its command list covers 10 destinations. `/overview/backup`, `/productivity/goals`, `/productivity/calendar`, `/productivity/habits`, `/finance/budgets`, `/finance/accounts` and others are not among them — typing `backup` yields no command, only record hits.

This is **not** the BUG-001 defect (which was that *existing* commands became unreachable). It is a scope decision: the command list is a curated subset. Recorded rather than fixed, because extending it changes what the product offers, not whether it is correct.

**Recommendation:** generate the command list from the sidebar's route table so the two cannot drift, and keep curated commands (AI planner, focus timer) at the top.

---

## What is genuinely good (stated so the report is calibrated, not one-sided)

- **No horizontal document overflow at any of the 8 viewports** — the shell adapts properly, which is the failure most apps of this shape exhibit.
- **Zero console errors across the 29 scanned routes, and zero failed requests** — with one recorded exception: the `/productivity/insights` redirect stub aborts its own `_rsc` prefetch when it `router.replace()`s, which is expected navigation behaviour, not a defect (`evidence/reports/route-scan.json`). Console errors are per page load, not per control.
- **Skip link, focus traps, Escape handling and dialog focus-on-open all work** in both global dialogs.
- **Duplicate submission is prevented** under rapid Enter (INT-003) — a real robustness detail many apps get wrong.
- **Empty states exist** for no-results search rather than rendering a blank region.
- **One `h1` per page** across all real routes; heading structure is disciplined.
