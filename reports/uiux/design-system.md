# Phase 3 — Design System Engineering Documentation

**System Name:** Precision Obsidian Design System  
**Product:** Personal OS  
**Implementation Target:** Next.js 15 + Tailwind CSS v4  
**Date:** 2026-11-06  
**Status:** Completed & Integrated

---

## 1. Design Token Architecture

The design system is implemented via CSS variables and Tailwind utility composition in `src/app/globals.css`.

### 1.1 Color Tokens

```css
:root {
  --background: #09090b;       /* Zinc 950 deep canvas */
  --foreground: #fafafa;       /* Zinc 50 primary text */
  --card-bg: #121215;          /* Zinc 900 translucent card surface */
  --card-border: #27272a;      /* Zinc 800 subtle card boundary */
  --accent-indigo: #6366f1;    /* Indigo 500 primary interaction */
}
```

### 1.2 Semantic Color Mapping

- **Income / Progress / Health:** `emerald-400` (`#10b981`), `bg-emerald-500/10`, `border-emerald-500/30`
- **Expense / Debt / Void / Danger:** `rose-400` (`#f43f5e`), `bg-rose-500/10`, `border-rose-500/30`
- **Warning / Due Soon / Pending:** `amber-400` (`#f59e0b`), `bg-amber-500/10`, `border-amber-500/30`
- **Brand / Primary Actions:** `indigo-600` (`#4f46e5`), hover `indigo-500` (`#6366f1`)
- **Muted Metadata & Hints:** `zinc-400` (`#a1a1aa`), `zinc-500` (`#71717a`)

---

## 2. Typography & Numerical Precision

- **Font Family:** Modern system font stack (`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto...`)
- **Tabular Figures:** Dedicated `.tabular-nums` utility enforcing `font-variant-numeric: tabular-nums; letter-spacing: -0.01em;`. This guarantees strict vertical decimal alignment in financial transaction ledgers, bank balances, countdown clocks, and percentage KPIs.
- **Scrollbars:** Custom 6px dark track scrollbar matching the zinc palette with rounded thumb and hover feedback.
- **Focus Indicators:** Universal `:focus-visible` ring (`2px solid #6366f1; outline-offset: 2px`) for keyboard accessibility.

---

## 3. Atomic Component Inventory (`src/components/ui/`)

### 3.1 Button (`src/components/ui/Button.tsx`)
- **Variants:**
  - `primary`: Solid indigo with subtle shadow and border highlight.
  - `secondary`: Subtle zinc-800 with hover lightens to zinc-700.
  - `outline`: Transparent background with zinc-700 border.
  - `ghost`: Completely flat with subtle hover background.
  - `danger`: Translucent rose tint with rose border.
- **Sizes:** `xs` (28px), `sm` (32px), `md` (38px), `lg` (44px).
- **Tactile Micro-interaction:** `active:scale-[0.98] transition-all duration-100 ease-out`.
- **States:** Built-in animated SVG spinner for `loading` prop, `disabled` opacity and pointer event prevention.

### 3.2 Card System (`src/components/ui/Card.tsx`)
- Modular components: `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`.
- Styling: `rounded-xl border border-zinc-800/80 bg-zinc-900/60 backdrop-blur-xs text-zinc-100 shadow-xs`.

### 3.3 Form Inputs (`src/components/ui/Input.tsx` & `src/components/ui/Select.tsx`)
- Accessible label binding via auto-generated or supplied `id`.
- Support for `leftIcon` and `rightIcon` adornments.
- Form validation error rendering with `aria-invalid="true"` and `aria-describedby`.
- Custom chevron styling for select dropdowns.

### 3.4 Badge (`src/components/ui/Badge.tsx`)
- Compact status pill with variants: `default`, `indigo`, `success`, `warning`, `danger`, `outline`.
- Sizes: `sm` (11px micro) and `md` (12px standard).

### 3.5 Empty State (`src/components/ui/EmptyState.tsx`)
- Centered empty container with dashed zinc border, rounded icon container, title, description, and optional action button.

### 3.6 StatCard (`src/components/ui/StatCard.tsx`)
- Standardized KPI card with top-level label, optional icon/badge, prominent tabular-num value, and bottom trend indicator (`↑`, `↓`) with secondary explanation.

---

## 4. Phase 3 Verification Checklist
- [x] Design tokens configured in `globals.css` with dark theme palette.
- [x] Custom scrollbar and focus ring system active.
- [x] Six reusable atomic primitives implemented in `src/components/ui/`.
- [x] TypeScript validation passing cleanly with 0 errors.
- [x] Component documentation completed.
