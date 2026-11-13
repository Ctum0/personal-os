# Responsive Testing

Measured `document.documentElement.scrollWidth` vs `clientWidth`, plus geometry inspection of overflowing descendants. 8 viewports × 8 representative routes = 64 measurements (`evidence/reports/responsive.json`).

## Document-level overflow

| Viewport | Routes measured | Horizontal document overflow |
| --- | --- | --- |
| 1920×1080 | 8 | 0 |
| 1600×900 | 8 | 0 |
| 1440×900 | 8 | 0 |
| 1366×768 | 8 | 0 |
| 1280×720 | 8 | 0 |
| 1024×768 | 8 | 0 |
| 768×1024 | 8 | 0 |
| 390×844 | 8 | 0 |

No page produces a horizontal document scrollbar. That is genuinely good — the shell, sidebar and cards all adapt without the classic sideways-scroll failure.

## Component-level overflow (the failures the document metric hides)

| ID | Route | Viewport | Behaviour | Reachable? | Severity |
| --- | --- | --- | --- | --- | --- |
| ~~RESP-001~~ → **BUG-002** | `/productivity/calendar` | 390×844 | Last weekday column reached x=438 in a 390px viewport with no ancestor scroller | **Was No — RESOLVED**: the grid now scrolls with a 96px column floor, and the fix is guarded by a mutation-tested spec | **P1** |
| RESP-002 | `/finance/budgets` | 390×844 | Table overflows its wrapper by 312px | **Yes** — inside `overflow-x-auto` | P3 (no scroll affordance) |
| RESP-003 | `/finance/net-worth` | 390×844 | Table overflows its wrapper by 149px | **Yes** — inside `overflow-x-auto` | P3 |
| RESP-004 | `/finance/transactions` | 390×844 | 8-column table is 745px wide in a 356px wrapper; 4 of 8 columns sit off-screen | **Yes** — scrollable, but no visual cue that more exists | P2 |

### Note on RESP-002/003/004

Horizontal scrolling *works* in these wrappers, so this is not breakage. The usability problem is discoverability: at 390px the table renders cleanly to the edge with no fade, shadow or scrollbar hint, so a user has no reason to suspect four more columns exist. On touch devices the scrollbar is typically invisible until touched.

**Recommendation (shared):** one reusable table wrapper that (a) always scopes `overflow-x-auto`, (b) shows an edge fade when `scrollWidth > clientWidth`, and (c) is used by *every* table and the calendar. The calendar should adopt the same wrapper rather than a one-off fix — the inconsistency is the root cause of RESP-001.

## Viewport-specific observations

| Viewport | Observation |
| --- | --- |
| 1920×1080 | Content is capped by `max-w-[1720px]`; comfortable line lengths, no wasted band larger than the gutter. Acceptable. |
| 1366×768 | Layout intact; the sidebar collapses below `lg`. |
| 1024×768 | Sidebar becomes a drawer; no overlap, no clipped controls. |
| 768×1024 | Tablets: cards reflow to one column. No overlap. |
| 390×844 | Shell adapts; the calendar column loss (RESP-001) and table scroll discoverability (RESP-004) are the failures. |

## Text size at narrow widths

3 of 8 routes sampled contain leaf text below 11px (e.g. `text-[10px]` labels in the calendar header and finance tables). At 390px these are the smallest elements on screen and are the first to become unreadable. Recorded as `UI-002`, not a WCAG failure (no absolute minimum in AA) but a readability concern under the audit's Rule 5.

## Not tested

- Landscape phone (844×390) — not measured.
- iOS Safari / Android Chrome specifically — only Chromium was available. WebKit/Firefox behaviour is **unverified** and is declared as such rather than assumed.
