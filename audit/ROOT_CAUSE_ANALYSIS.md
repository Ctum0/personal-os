# Root Cause Analysis

Most defects here are not independent. They cluster into three shared causes.

## RC-1 — Two lookup mechanisms were bolted together and neither owns "find anything"

**Symptoms:** BUG-001 (palette loses commands on typing), UX-002 (silent mode swap), and the confusing `q=tasks → 0 results`.

`CommandPaletteModal` decides its data source with a single ternary: `query.trim() ? results : commands`. The command array is client data; the record list is a server call. Nothing merges them, so the two halves of the palette can never coexist. The user sees one list whose *meaning* changes on the first keystroke.

**Why it recurs:** the same shape exists wherever a "search" UI was added beside an existing static list without a unified result model. Any future surface that gains search will inherit it.

**Fix once, everywhere:** model results as a typed union — `{ kind: 'command' | 'record' }` — and render grouped sections. Then filtering commands is a client predicate and records are a superset, not a replacement.

## RC-2 — Overflow handling is per-component, not systemic

**Symptoms:** RESP-001 (calendar clipped with no scroller), RESP-002/003/004 (tables scroll with no affordance), plus the discovery that only *some* tables have an `overflow-x-auto` ancestor.

Each surface solved narrow-viewport data independently: three tables wrapped themselves, the calendar did not. There is no shared "wide content" primitive, so correctness depends on every author remembering.

**Why it recurs:** it is invisible above ~1024px, which is where the app was developed and where every existing automated check runs (the project's E2E projects use 1440×900).

**Fix once, everywhere:** one `<OverflowRegion>` component that scopes `overflow-x: auto`, exposes `aria-label`, and renders an edge fade when `scrollWidth > clientWidth`. Adopt it in every table **and** the calendar. Then add a mobile viewport to the test suite so the omission cannot return.

## RC-3 — Accessibility coverage stopped at the resting page

**Symptoms:** A11Y-008 (3 violations in the palette) and A11Y-009 (the sweep never opens a dialog).

The sweep audits routes as they load. Every dialog in the product is keyboard-only or click-only and therefore untested. The palette's contrast and label-name defects survived a "0 violations" gate because the gate never opened it.

**Why it recurs:** any state reachable only through interaction is outside the gate's model of the app.

**Fix once, everywhere:** an open-state axe pass for each dialog with a keyboard entry point, driven by the same script that already presses Ctrl+K and Ctrl+N in the interaction suite.

---

## Secondary cause — identity is optional but rendered as mandatory

**Symptom:** BUG-003 ("OP").

The account menu assumes a username exists. Authentication is *optional by design* (open mode), so the absence case is normal, yet it renders a fabricated identity. The root cause is treating "no value" as "use a plausible default string" rather than "change the affordance".

---

## What this clustering implies for the roadmap

Fixing the 3 root causes resolves 6 of the 9 reported findings and prevents the next instance of each. Fixing the 9 findings one at a time would leave both the palette and the tables ready to reproduce the same class of defect on their next edit. This is why the roadmap is organised by root cause, not by page.
