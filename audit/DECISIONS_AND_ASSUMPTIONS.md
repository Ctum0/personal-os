# Decisions and Assumptions

## Probe errors I made and corrected

Recording these, because a report that silently drops a false failure is worth less than one that shows its workings.

| Probe claim | Reality | How I found out |
| --- | --- | --- |
| "Palette search yields 0 options and no selection" | My wait (700 ms) was shorter than the 150 ms debounce **plus** the fetch; the element I typed into was the page's priority `<select>`, not the palette input | Re-ran targeting `[role=dialog] input` with a 2.5 s wait: 1 result, correct |
| "Client navigation to Finance took 30 s" | I clicked a non-link and then waited on `networkidle` on a page that keeps a polling request open | Re-ran clicking the actual workspace button: ~1 s |
| "Archive does not remove the task" | `window.confirm` auto-dismisses in automation; the click was cancelled | Re-ran with a dialog handler accepting: `DELETE 200`, row removed, stays removed |
| "Back navigation lost the page" | I clicked the workspace switcher (pushes a new history entry) then compared the wrong URL | Re-ran with a sidebar link: Back behaves correctly, twice |
| "Calendar has document-level overflow" | My detector flagged descendants beyond `clientWidth`; the document itself has no scroll | Measured `scrollWidth` vs `clientWidth` directly — equal |

Each correction is reflected in the findings files; the false failures do not appear as defects.

## Fixes attempted during the audit

The brief authorises implementation in controlled stages after the audit. I applied exactly three, each a root-cause fix with a measured verification:

| Fix | Finding | Verification |
| --- | --- | --- |
| Palette renders one merged row list; commands filtered client-side with keywords | BUG-001, UX-002, A11Y-008 | Empty query 10 commands; six queries return the expected command; activation navigates; axe clean on the open palette |
| Week grid scrolls with a 96px column floor | BUG-002 | At 390px: scroller 356 / content 742, all columns 96px, Sunday reachable after scroll, no document overflow; 1440px unchanged |

I also **reverted** one change of my own: I briefly added four new palette commands
(backup, goals, calendar, habits). That is scope expansion rather than a defect
fix, so it was removed and recorded as UX-003 instead. Command count is back to
the original 10.

## Judgement calls

**`/productivity/insights` two-`h1` finding was dropped.** It is a redirect stub; the second heading belongs to the destination after `router.replace`. Reporting it would be a false positive.

**"Clipped table" at 390px was reclassified.** The tables are inside `overflow-x-auto`, so the content is reachable — that is not breakage. It was downgraded to a discoverability finding (RESP-004), while the calendar, which genuinely has no scroller, stayed a P1.

**Severity of A11Y-008 raised to P1.** Three AA violations in the component that is the primary keyboard path through the app, and they were invisible to the project's existing gate. Contrast and label-in-name are both "serious" in axe's own impact model.

**`window.confirm` for archive is not reported as a defect.** It works, it is keyboard-accessible, and it prevents accidental loss. Friendlier undo is a Stage B/C improvement, not a bug.

## Assumptions stated explicitly

- **Dev server timings are not Core Web Vitals.** Performance claims are limited to structure (request count, console errors) and labelled as such.
- **Chromium only.** WebKit and Firefox behaviour is **unverified**. No claim is made about Safari.
- **One data profile.** Tests ran against a freshly seeded database (a few tasks, sample accounts), so behaviour under large data volumes — table performance, palette result counts, calendar density — is **untested**.
- **Authentication was exercised separately.** The audit ran in open mode for speed; the auth contract has its own suite (23 regression cases above) and was verified live against production.
- **Sample of 8 routes for responsive testing.** Every route was loaded at 1440 (29/29); the 8-viewport matrix used the 8 routes most likely to break (tables, grids, dense forms). Routes not in that matrix are not claimed to be mobile-safe.

## What would change the conclusions

- A large dataset (thousands of rows) could invalidate the performance assessment and change palette/table recommendations.
- A non-Chromium engine could reveal rendering defects invisible here.
- A real operator's data shape (multiple spaces, custom accounts) could expose issues the seeded profile hides.
