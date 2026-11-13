# Performance Findings

Measurements taken in Chromium against a local `next dev` server. **Dev-server numbers are slower than production**; they are used for *relative* comparison and for detecting structural problems (console errors, request volume, layout thrash), not as Core Web Vitals.

## Measured

| Metric | Value | Verdict |
| --- | --- | --- |
| Navigation to `/productivity/tasks`, domContentLoaded | 121 ms | Fine for dev |
| Network idle (dev, cold route compile) | 1.2–3.0 s | Expected on first dev compile; not representative |
| Requests on first load of tasks | 28 | Reasonable |
| Transfer on first load | ~884 KB uncompressed (dev) | Fine; production serves compressed |
| Client navigation `/productivity/tasks` → `/finance` | ~1.0 s after the workspace switch | Acceptable |
| Console errors across 29 route loads | **0** | Good |
| Failed requests across 29 route loads | **0** | Good |
| Horizontal document overflow (layout induced) | 0/64 measurements | Good |

## PERF-001 — The command palette performs one request per keystroke (debounced 150 ms)

**Severity: P3** · Component: command palette

Every non-empty query triggers `/api/search`. The debounce is 150 ms, which is short enough that ordinary typing (≈120 ms/key) produces a request per character on slower keyboards, and there is no cancellation of the previous in-flight request beyond a `cancelled` flag (the request still completes and is discarded).

**Not a measured problem** at this data volume — the endpoint returned in <100 ms locally. Recorded because it will degrade once records grow, and because the fix is trivial: raise the debounce to ~250 ms and/or `AbortController`-cancel the previous request.

## PERF-002 — Route-level code splitting is healthy

Chunk counts per route are sane; no route pulled the entire finance surface into the productivity workspace. No action recommended.

## Not measured (declared, not assumed)

- **Production Lighthouse / Core Web Vitals** — the audit ran against `next dev`, where timings are not meaningful. A production-build measurement is listed as the next task in `MASTER_PROGRESS.md`.
- Memory growth under repeated navigation (no long-session profiling).
- Bundle size per chunk (did not analyse `.next/` output).

## Assessment

No evidence of a performance defect. The one structural risk (palette request-per-keystroke) is latent, not current. Performance is **not** the limiting factor for this application's quality; interaction correctness and mobile layout are.
