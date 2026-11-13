# Functional Bugs

Confirmed defects only. Each entry has a reproduction that was actually run.

**Status legend:** OPEN · RESOLVED (with the verification that closed it).

---

## BUG-001 — Command palette loses its own commands when you type

**Severity: P2 (Medium)** · Route: global (Ctrl+K) · Category: functional / search · **Status: RESOLVED**

**Resolution:** the palette now renders one flat row list — commands filtered
client-side (title, subtitle and a keyword list per command) followed by record
hits — instead of switching data source on the first keystroke.
`CommandPaletteModal.tsx`. Verified on a freshly booted server: empty query shows
10 commands; `settings` → 1 command; `plan` → 1; `today` → 1; `import` → 1;
`metrics` → 1; `zzzz` → 0 with an explicit "no commands or records match" message;
activating the `settings` row navigates to `/overview/settings`. axe on the open
palette: clean.

**Reproduction**
1. Press `Ctrl+K`. Ten commands are listed, including *Personal Operating Rules & Settings* and *Open Weekly Review Workspace*.
2. Type `settings`.
3. Observe: **0 results**. The list is empty.

Also reproduces with `backup` → 0 results. Typing `finance` returns one *data* record ("Personal OS System Implementation"), not the "Switch to Finance OS" command that was visible a moment earlier.

**Expected:** typing filters the command list, so "settings" surfaces the Settings command.

**Actual:** any non-empty query replaces the command list with a backend record search (`/api/search`), which only knows about tasks/records. The commands become unreachable by name.

**Root cause** (`src/components/modals/CommandPaletteModal.tsx`): `rowCount` is `query.trim() ? results.length : commands.length`. The command array is only consulted when the query is empty; there is no client-side command filter. Verified by reading the component *after* observing the behaviour.

**Impact:** typing a command's name yields nothing, so anyone who types rather than arrowing must clear the query first. It is friction, not a broken workflow: with an empty query all 10 commands are listed and ↑/↓/Enter activate them, and every destination they point to is also reachable from the sidebar. Graded P2 on that basis — an earlier draft called this P1, which overstated it.

**Recommended fix:** filter `commands` locally by label/keywords and merge with backend results (commands first, records after), so a query never reduces reachable commands to zero.

**Verification:** add an interaction test asserting that typing `settings` yields a row whose action opens `/overview/settings`.

---

## BUG-002 — Calendar is cut off at mobile width with no way to reach the content

**Severity: P1 (High)** · Route: `/productivity/calendar` · Category: responsive / data loss (visual) · **Status: RESOLVED**

**Resolution:** the week grid sits in an `overflow-x-auto` wrapper and its columns
have a `minmax(96px, 1fr)` floor with `min-w-[742px]`, so the grid scrolls rather
than compressing or clipping. Measured at 390×844: scroller 356px, content 742px,
all seven headers exactly 96px, **no document overflow**, and after scrolling to
the end Sunday is fully visible (`lastRight == scrollerRight`). At 1440×900 the
columns are 152px and no scrolling is needed, so the desktop layout is unchanged.
At 1024×768 it scrolls with 96px columns — legible, not squeezed.

**Reproduction**
1. Open `/productivity/calendar` at 390×844.
2. Inspect the weekday header row.

**Expected:** the month grid fits, or scrolls horizontally.

**Actual:** the last column ("Sun 15") extends to x=438 in a 390px viewport and the ancestor chain has **no scroll container** (`overflow-x` is `visible` up to `main`, which is `overflow-x: hidden`). The content is permanently clipped — not scrollable, not reachable.

**Contrast:** `/finance/transactions`, `/finance/budgets` and `/finance/net-worth` place tables inside `overflow-x-auto` wrappers, so their overflow *is* reachable. Only the calendar lacks the wrapper — an inconsistency in how overflow is handled, not a global design decision.

**Impact:** on a phone the calendar's final day column is unreadable and its events are unreachable.

**Recommended fix:** wrap the grid in the same `overflow-x-auto` container used by the finance tables (or switch to a 7-column grid that shrinks). Prefer the existing pattern for consistency.

**Verification:** at 390px, assert `scrollWidth > clientWidth` on the wrapper **or** that every column's right edge is within the viewport.

---

## BUG-003 — The account menu shows an identity that does not exist

**Severity: P2 (Medium)** · Route: global shell · Category: data presentation · **Status: OPEN**

**Reproduction**
1. Run the app in open mode (no credentials configured) — the documented local-development path.
2. Look at the navbar's right edge.

**Actual:** the avatar renders **"OP"** and its accessible name is "OP — account menu". There is no operator. `OperatorMenu` falls back to `(username ?? 'OP').slice(0, 2).toUpperCase()`, so the absence of a username is rendered as a plausible-looking identity.

**Expected:** in open mode show a neutral, non-identity affordance (e.g. a "Local session" label or no initials at all), since no account is signed in.

**Impact:** misrepresents system state. A user could reasonably believe an account named "OP" is signed in.

**Verification:** open-mode assertion that the trigger's accessible name does not imply a specific user.

---

## Not defects (recorded so they are not re-reported)

| Observation | Why it is not a defect |
| --- | --- |
| `/productivity/insights` appears to render two `h1`s | It is a redirect stub. The second `h1` belongs to the destination page after `router.replace`. A static scan catches both during the transition. |
| `/api/search?q=tasks` returns 0 results | Search covers records, not route names. Route names are a *command* concern — which is exactly BUG-001. |
