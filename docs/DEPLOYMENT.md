# Ausport Scraper — deployment and operations

## Authoritative execution path

The executable source is `.github/workflows/scrape.yml`: `Production Schedule Sync`.
Its scheduled/manual production job installs locked dependencies, runs parser/guard/
freshness tests, scrapes and validates data, ingests only after its safety checks, then
commits verified CSV/baseline changes. PR validation is a separate read-only job.
See the workflow and `package.json` at the exact revision under review.

## Preconditions

- Store `DASHBOARD_INGEST_TOKEN` only in GitHub Secrets; never paste values into logs.
- Confirm target environment and source cadence from the current workflow.
- Run `npm ci` and `npm test` in development. `npm start` runs the scraper and may
  write to the configured live ingest endpoint; it is not a health-only command.
- Preserve the last good CSV and baseline. Respect the absolute row floor and
  baseline-ratio guard. Source HTTP failures are not a reason to weaken those guards.

## Failure triage

Read the failed step, source HTTP result, per-day failures, row guard and baseline age.
If the source returns no events, fail closed and retain existing production data.
Compare the independent VPS collector and aggregator source freshness before declaring
an outage. A healthy collector does not make a failed GitHub sync successful.
The inspected failure had zero rows and was correctly blocked by the absolute floor.

## Recovery and rollback

Fix parser/source handling in a reviewed branch and pass tests before restoring
scheduled execution. A source-code revert does not undo previously ingested records.
Data correction requires an approved, environment-specific replay/reconciliation plan;
do not run an ingest or override guard merely to make CI green. Preserve failure logs.

## Other deployment methods

Docker, systemd, Lambda and Kubernetes are not established by this guide. Existing
architecture prose mentioning a private gateway is historical and must be compared
to the current workflow target before use. No alternative daemon is inferred.

**FIELD VERIFICATION:** confirm current source reachability and target freshness.
**RISK:** source transport failures can leave data stale even when code tests pass.
**NEXT ACTION:** the assigned operator correlates collector, workflow and freshness
evidence. Operational owner: **BELUM DITENTUKAN**.
