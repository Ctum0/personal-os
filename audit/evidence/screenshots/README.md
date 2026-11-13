# Screenshots

All captured in Chromium at the stated viewport against audit build `6dbb094`.

| File | Shows |
| --- | --- |
| `UI-000-home-1440.png` | Dashboard at 1440×900 — the baseline for layout judgement |
| `A11Y-008-command-palette-open.png` | The command palette in its open state, the surface `A11Y-008` was raised against |
| `RESP-004-transactions-390px.png` | Ledger table at 390px: 8 columns in a 356px scroller — scrollable, but with no affordance hinting that half the columns exist |
| `BUG-002-calendar-390px.png` | Calendar at 390px **before** the fix: the last weekday column extends past the viewport and no ancestor scrolls, so Sunday was unreachable. Historical — `BUG-002` is resolved |

Two files were captured before the responsive findings were reclassified. They are
named for their **current** register IDs: what was `RESP-001` is now `BUG-002` (the
calendar), and what was `RESP-002` became `RESP-004` (the ledger table). Neither
filename implies a defect still open.
