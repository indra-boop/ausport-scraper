# QC freshness rules (ausport-scraper / sky-tvguide)

Source of truth for agent QC checks: `qc-rules.js` (+ `test-qc-rules.js`).

## B) Commit freshness

- **Fresh** if latest relevant schedule commit age **&lt; 26 hours**.
- Do **not** require calendar “today” (avoids false STALE when QC runs just after midnight UTC while the scrape commit is still &lt;26h old).

## C) Row-count drop &gt;60%

- `applyCurrentWeekFreshness` keeps a Mon–Sun WITA window; `results.csv` intentionally shrinks on **Monday** when the window resets.
- **Approach chosen:** exclude Monday from the &gt;60% RISIKO trip when the drop is that weekly window reset (`evaluateDropRisk` → `monday-week-window-reset-excluded`).
- Do **not** change the Mon–Sun freshness window itself for this fix.
- Keep existing absolute row / prefix guards.

## D) Cron

- Production scrapes: GitHub Actions `0 0 * * *` (00:00 UTC).
- Historical QC agent routine: **02:30 UTC** (referenced by `jerco-sports-schedule` prune timer comments; **not** an in-repo workflow here).
- Target QC time: **05:30 UTC** — update the external Claude/Grok routine; do not invent a workflow in these scraper repos solely for QC reporting.
