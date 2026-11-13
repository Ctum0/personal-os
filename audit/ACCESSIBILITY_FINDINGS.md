# Accessibility Findings

Tool: axe-core 4.x injected into the live page, tags `wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa`. Manual checks: keyboard traversal, focus containment, skip link. Raw reports in `evidence/reports/`.

## Coverage

| Surface | Result |
| --- | --- |
| 10 static routes at 1440×900 | **0 violations** |
| Quick Add dialog (open) | **0 violations**; focus enters, Tab trap holds |
| Command palette (open) | **3 violations** — A11Y-008 |

The project's own sweep (`e2e/axe-sweep.spec.ts`) audits pages in their closed state. The palette is only reachable by keyboard, so its violations were invisible to that sweep until dialogs were audited open. That is a coverage gap I am recording as a finding in its own right (A11Y-009).

---

## A11Y-008 — Three AA violations in the open command palette

**Severity: P1 (High)** · Component: `CommandPaletteModal` · Discovered: axe, open-state · **Status: RESOLVED**

**Resolution:** subtitles raised from `text-[11px] text-zinc-500` to `text-xs text-zinc-400`, the result-type chip from `text-zinc-400` to `text-zinc-300`, and the ESC hint given an explicit `text-zinc-300`. The scope chip's accessible name now begins with its visible text (`"Global Scope — search scope, activate to switch"`), satisfying WCAG 2.5.3. Verified: axe on the **open** palette returns 0 violations.

### 1. `color-contrast` (serious, 2 nodes)

| Node | Rendered |
| --- | --- |
| Row subtitle | `<span class="block text-[11px] text-zinc-500 truncate">Interview-driven scheduling with a visual timeline</span>` |
| Key hint | `<kbd class="px-1 py-0.5 bg-zinc-800 rounded border border-zinc-700">ESC</kbd>` |

Both are 11px text at `text-zinc-500` / dark-on-dark. Fails 1.4.3 (minimum contrast) for normal text.

**Fix:** raise the subtitle to the palette's secondary ink (≥ `#a1a1aa` on this background) and give `kbd` an explicit foreground colour rather than inheriting.

### 2. `label-content-name-mismatch` (serious, 1 node)

```html
<button aria-label="Search scope: productivity. Activate to switch."
        class="px-2 py-0.5 ...">…</button>
```

Visible text is the scope chip (e.g. "productivity"); the accessible name is a sentence that does not contain that visible string. Fails WCAG 2.5.3 (Label in Name).

**Fix:** make the accessible name start with the visible text — `aria-label={`${scope} — search scope, activate to switch`}` — the same pattern used to fix the account menu.

**Verification:** re-run axe against the palette while open; expect 0. Add it to the project sweep so it cannot regress.

---

## A11Y-009 — The accessibility sweep never audits anything that opens

**Severity: P2 (Medium)** · Audit coverage, not a user-facing bug

`e2e/axe-sweep.spec.ts` visits routes and audits the resting page. Every dialog in the product (command palette, Quick Add, explainer drawer, AI drawer) is excluded, so an entire interaction class has no automated accessibility gate. A11Y-008 existed unnoticed because of this.

**Recommendation:** extend the sweep with an open-dialog pass for each dialog that has a keyboard entry point.

---

## Manual checks that passed

| Check | Result |
| --- | --- |
| Skip link is the first focusable element | Pass |
| Skip link moves focus to `#main-content` | Pass |
| Focus enters modal on open (Quick Add, palette) | Pass |
| Tab does not escape the modal (25 presses) | Pass |
| Escape closes both dialogs and restores focus | Pass |
| Every audited page has exactly one `h1` | Pass (29/29, excluding the redirect stub) |
| Named buttons: no icon-only control without an accessible name on audited routes | Pass |
