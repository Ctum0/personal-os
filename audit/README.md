# Personal OS — UI/UX and Functional Quality Audit

**Audit date:** 2026-11-13
**Audited build:** `6dbb094` (commit deployed to production at time of audit)
**Auditor stance:** adversarial. Findings are reported as observed, not as intended.
**Application:** local-first personal productivity + finance system
**Stack:** Next.js 16 (App Router, `cacheComponents`), React 19, better-sqlite3, Tailwind 4

## How to read this package

| File | Contents |
| --- | --- |
| [MASTER_PROGRESS.md](MASTER_PROGRESS.md) | Control document: counts, coverage, exact next task |
| [APPLICATION_INVENTORY.md](APPLICATION_INVENTORY.md) | Every route, purpose, primary controls |
| [ROUTE_COVERAGE.md](ROUTE_COVERAGE.md) | Per-route coverage status |
| [FEATURE_INVENTORY.md](FEATURE_INVENTORY.md) | Features and whether they were exercised |
| [INTERACTION_TESTS.md](INTERACTION_TESTS.md) | Every interaction test with expected vs actual |
| [UI_UX_FINDINGS.md](UI_UX_FINDINGS.md) | `UI-*` / `UX-*` findings |
| [FUNCTIONAL_BUGS.md](FUNCTIONAL_BUGS.md) | `BUG-*` findings |
| [ACCESSIBILITY_FINDINGS.md](ACCESSIBILITY_FINDINGS.md) | `A11Y-*` findings |
| [PERFORMANCE_FINDINGS.md](PERFORMANCE_FINDINGS.md) | `PERF-*` findings |
| [RESPONSIVE_TESTING.md](RESPONSIVE_TESTING.md) | `RESP-*` across 8 viewports |
| [WORKFLOW_TESTING.md](WORKFLOW_TESTING.md) | End-to-end journeys |
| [ROOT_CAUSE_ANALYSIS.md](ROOT_CAUSE_ANALYSIS.md) | Shared causes behind clusters of symptoms |
| [IMPROVEMENT_ROADMAP.md](IMPROVEMENT_ROADMAP.md) | Staged plan with acceptance criteria |
| [REGRESSION_TEST_PLAN.md](REGRESSION_TEST_PLAN.md) | Repeatable post-fix test plan |
| [DECISIONS_AND_ASSUMPTIONS.md](DECISIONS_AND_ASSUMPTIONS.md) | What I decided and why |
| [BLOCKERS.md](BLOCKERS.md) | What could not be tested, and why |
| `evidence/` | Screenshots and machine-readable reports |

## Session recovery

1. Read `MASTER_PROGRESS.md` — it states the exact next task.
2. Read the findings file for the area in progress.
3. Verify the app still runs: `PERSONAL_OS_DB_PATH=/tmp/audit-db/profile.db E2E_DIST_DIR=.next-audit npx next dev --port 3550`.
4. Continue from the recorded next task. Do not re-run completed scans.

## Method

- Every route was loaded in a real Chromium instance and inspected for `h1` structure, control counts, horizontal overflow, console errors and failed requests.
- Interaction tests drove real controls (typing, clicking, keyboard) — never asserted from source.
- Accessibility was measured with axe-core (`wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa`) injected into the live page, both for static pages **and** for open dialogs, which the existing project sweep does not cover.
- Responsive behaviour was measured as `scrollWidth > clientWidth` at eight widths, plus visual inspection.
- Source was read only to explain an observed symptom, never to substitute for observation.

## Honesty notes

- Anything not exercised is marked **Not tested** or **Blocked** — never "passed".
- Numbers in the executive summary are derived from the files in this directory.
- Where a probe of mine produced a false failure, the correction is recorded in `DECISIONS_AND_ASSUMPTIONS.md` rather than quietly dropped.
