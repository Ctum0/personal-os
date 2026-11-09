# Baseline UX/UI Issues & Diagnostic Log

**Date**: November 6, 2026  
**Auditor**: Antigravity  
**Audit Standard**: Master Execution Specification § 3.3  
**Status**: Initial Baseline Identified (Ready for Phase 1 In-Depth Investigation)

---

## 1. Summary of Baseline Observations

While the backend logic, ledger integrity, calculations, and feature set are comprehensive and hardened, the user interface currently exhibits several classic engineering-first design symptoms:

1. **Visual Hierarchy & Weight**: Card headers, subheadings, and data values often share similar font weights and neutral contrast, causing "visual monotony" where everything looks equally important.
2. **Information Density & Breathing Room**: Certain views (like Transactions and Tasks) have good data density, but lack subtle zebra striping, row hover highlights, and refined micro-padding, leading to visual fatigue during long sessions.
3. **Typography & Font Sizing**: The application relies almost entirely on Tailwind's default sans stack (`font-sans`) and default `text-xs` / `text-sm` without a deliberate typographical scale with distinct tracking and tabular figures (`font-mono` / `tabular-nums`) for financial figures.
4. **Form Controls & Inputs**: Inputs throughout modals (`QuickAddModal`, `CommandPaletteModal`) and inline creation bars use default dark borders (`border-zinc-800`) with high focus jumps that lack smooth focus rings (`ring-2 ring-indigo-500/20`) and clear validation hints.
5. **Interactive Feedback States**: Buttons often have simple background color swaps on hover (`hover:bg-zinc-800`), with missing active/pressed feedback (`active:scale-[0.98]`) or loading skeleton states.
6. **Mobile / Viewport Adaptation**: While desktop widescreen expansion (`w-full px-8 py-6`) resolved the desktop constraint, viewports below 1024px experience table overflow and cramped sidebars that need refined drawer collapsing.
7. **Accessibility (WCAG 2.2 AA)**: Certain subtle text colors (`text-zinc-500`) against dark backgrounds (`bg-zinc-950` / `bg-zinc-900`) fall below the 4.5:1 contrast ratio threshold. Several icon-only buttons lack explicit `aria-label` attributes.

---

## 2. Baseline Issue Inventory

| Issue ID | Area | Severity | Description | User Impact |
| :--- | :--- | :---: | :--- | :--- |
| **BL-01** | Typography | High | Financial figures lack `tabular-nums` formatting; columns containing decimals do not align vertically on decimal points. | Harder to scan and compare financial amounts at a glance. |
| **BL-02** | Contrast | Medium | `text-zinc-500` (#71717a) on `zinc-900` (#18181b) yields ~3.6:1 contrast ratio, failing WCAG AA (requires 4.5:1). | Reduced legibility for users with visual fatigue or low-contrast displays. |
| **BL-03** | Interactive Feedback | Medium | Action buttons lack smooth transition timings, active states, and focus rings for keyboard users. | Interface feels rigid or unresponsive during rapid keyboard navigation. |
| **BL-04** | Responsive Layout | High | Sidebar is fixed at 240px and does not collapse gracefully on tablet (768px - 1024px) or mobile viewports (<768px). | Mobile and tablet viewports experience horizontal clipping and cramped main content. |
| **BL-05** | Empty & Loading States | Medium | When data is empty, plain italic text is displayed without helpful onboarding CTAs or guided starter actions. | First-time users are greeted with blank spaces rather than encouraging onboarding prompts. |
| **BL-06** | Modals & Dialogs | Medium | Modal close buttons and backdrop dismiss animations lack spring physics and keyboard Escape trap management. | Dialog interactions feel abrupt. |
| **BL-07** | Accessibility Attributes | High | Several icon-only buttons (theme toggle, quick add trigger, close buttons) lack accessible `aria-label` or `aria-expanded` attributes. | Screen-reader users cannot determine the function of key navigation controls. |
| **BL-08** | Visual Separation | Low | Heavy reliance on nested dark gray borders (`border-zinc-800`) creates a "grid of boxes" rather than natural hierarchical grouping. | Creates unnecessary visual clutter and cognitive load. |

---

## 3. Next Steps
These baseline issues will be thoroughly investigated and expanded in **Phase 1: Comprehensive UX and UI Investigation** (`reports/uiux/phase-1-comprehensive-audit.md`), followed by systematic resolution in the Design System Engineering and Redesign phases.
