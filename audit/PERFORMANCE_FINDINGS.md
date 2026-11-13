# Performance Findings

**Production-build measurement.** Earlier drafts of this file reported `next dev`
timings and explicitly declined to make claims from them. That gap is now closed:
the figures below come from Lighthouse against the **standalone production
server** (`NEXT_OUTPUT_STANDALONE=1` build, `node .next/standalone/server.js`),
with `.next/static` and `public/` staged as the Dockerfile does.

Raw report: `evidence/reports/lighthouse-home.json`.

## Lighthouse — `/` at 1440×900 (mobile-throttled default preset)

| Category | Score |
| --- | --- |
| Accessibility | **100** |
| Best Practices | **100** |
| SEO | **100** |
| Performance | **97** |

| Metric | Value | Threshold |
| --- | --- | --- |
| First Contentful Paint | 0.9 s | good < 1.8 s |
| Largest Contentful Paint | 0.9 s | good < 2.5 s |
| Total Blocking Time | 210 ms | good < 200 ms — marginal |
| Cumulative Layout Shift | 0.012 | good < 0.1 |
| Server response time | 10 ms | good < 600 ms |

**Assessment:** fast and stable. TBT sits just over the "good" boundary on
Lighthouse's CPU-throttled mobile profile; LCP and CLS are comfortably good, so
there is no real-world problem to solve here. No optimisation is recommended on
this evidence — the earlier `PERF-001` note about the palette's request-per-
keystroke remains a latent concern at scale, not a measured defect.

---

## PERF-001 — The palette issues one request per keystroke (debounced 150 ms)

**Severity: P3** · Component: command palette · **Status: OPEN (latent)**

Every non-empty query triggers `/api/search`. The 150 ms debounce is short enough
that ordinary typing produces a request per character on slower keyboards, and
superseded requests are discarded by a flag rather than aborted.

Not a measured problem at this data volume — the endpoint answered in <100 ms
locally and Lighthouse found no blocking work attributable to it. Recorded
because it will degrade as records grow, and the fix is trivial: raise the
debounce to ~250 ms and cancel with `AbortController`.

---

## PERF-002 — Route-level code splitting is healthy

**Informational — no action.** Chunk counts per route are sane; no route pulled
the entire finance surface into the productivity workspace. Carried for
completeness, not as work.

---

## Fixed as a result of this measurement

Running Lighthouse against the production build surfaced two accessibility
defects that axe-core's WCAG tag set does not check:

| Audit | Defect | Fix |
| --- | --- | --- |
| `button-name` | The Productivity workspace toggle hides its only text below `sm` (`hidden sm:inline`), leaving **no accessible name at mobile width** | `aria-label="Productivity"`, which also satisfies WCAG 2.5.3 because it contains the visible text |
| `heading-order` | The dashboard's "one big thing" card used `h3` directly under the page `h1` | Promoted to `h2`; the page now reads `H1 → H2 → H2…` |

Both verified at 412px: zero unnamed buttons, valid heading sequence, and the
Lighthouse accessibility score moved 93 → **100**.

## Not measured

- Other routes: only `/` was profiled. The 26 partially-audited routes have no
  Lighthouse data.
- Desktop preset, long-session memory growth, bundle-size attribution.
