# Ausport Scraper — architecture

The current executable contract lives in `.github/workflows/scrape.yml`, `scraper.js`
and `package.json` at a pinned source revision. The flow is source HTTP retrieval,
per-day parsing, schema/row/baseline guards, authenticated aggregator ingest, then
verified CSV/baseline persistence. Tests and guard validation precede live ingest.

The workflow has a PR-only validation job and a scheduled/manual production-sync job.
Its ingest token is injected from Secrets and must not appear in source or logs.
An independent VPS collector may supply the same source; reconcile its cadence with
the GitHub job to avoid duplicate scheduling. This file does not authorize cutover.

Historical descriptions of a private Sites gateway or multiple alternative runtimes
are superseded by the executable workflow target. Do not infer deployed infrastructure
from the old diagram. Source HTTP failure and guarded no-data failure are distinct
from unit-test failure. Existing production records are retained when ingestion is blocked.

Operations and recovery: [DEPLOYMENT.md](DEPLOYMENT.md).
**ASSUMPTION:** deployment applicability outside the documented workflow is unverified.
**NEXT ACTION:** validate the target, source freshness and secret presence before any
authorized sync. Source validation does not certify live broadcast accuracy.
