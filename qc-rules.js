'use strict';
/**
 * QC freshness rules for ausport-scraper (and shared by sky-tvguide QC).
 *
 * These encode the 2026-10-05 QC fixes that previously lived only in the
 * external Claude/Grok QC routine (historically ~02:30 UTC):
 *   B) Fresh if latest relevant commit age < 26 hours (not calendar "today")
 *   C) Do NOT trip >60% drop RISIKO on Monday when the drop is the Mon–Sun
 *      week-window reset from applyCurrentWeekFreshness
 *
 * Approach for (C): exclude Monday from the >60% RISIKO trip when the drop
 * coincides with the weekly window reset (preferred over changing the
 * Mon–Sun freshness window itself). Keep existing row/prefix checks elsewhere.
 *
 * External QC cron should move to 05:30 UTC (after 00:00 UTC scrapes settle);
 * that schedule is NOT in this repo's GitHub Actions.
 */

const COMMIT_FRESH_MAX_MS = 26 * 60 * 60 * 1000;
const DROP_RISK_RATIO = 0.6;

/** True when `commitTime` is younger than 26 hours relative to `now`. */
function isCommitFresh(commitTime, now = new Date()) {
  const t = commitTime instanceof Date ? commitTime.getTime() : Date.parse(commitTime);
  const n = now instanceof Date ? now.getTime() : Date.parse(now);
  if (!Number.isFinite(t) || !Number.isFinite(n)) return false;
  const age = n - t;
  if (age < 0) return true; // clock skew / future stamp → treat as fresh
  return age < COMMIT_FRESH_MAX_MS;
}

/** Age of commit in hours (null if unparsable). */
function commitAgeHours(commitTime, now = new Date()) {
  const t = commitTime instanceof Date ? commitTime.getTime() : Date.parse(commitTime);
  const n = now instanceof Date ? now.getTime() : Date.parse(now);
  if (!Number.isFinite(t) || !Number.isFinite(n)) return null;
  return (n - t) / (60 * 60 * 1000);
}

/**
 * UTC-Monday check for the freshness "today" date (Date at UTC midnight of
 * the WITA/target calendar day, same convention as targetWeekBounds).
 */
function isMondayWeekReset(today) {
  const d = today instanceof Date ? today : new Date(today);
  return d.getUTCDay() === 1;
}

/**
 * Should QC raise RISIKO for a row-count drop vs previous snapshot?
 *
 * @param {number} previousCount  prior results.csv (or comparable) row count
 * @param {number} currentCount   current row count after freshness gate
 * @param {Date}   today          target calendar day (UTC midnight)
 * @param {object} [opts]
 * @param {number} [opts.threshold=0.6]
 * @returns {{ trip: boolean, dropRatio: number|null, reason: string }}
 */
function evaluateDropRisk(previousCount, currentCount, today, opts = {}) {
  const threshold = opts.threshold ?? DROP_RISK_RATIO;
  if (!Number.isFinite(previousCount) || previousCount <= 0) {
    return { trip: false, dropRatio: null, reason: 'no-previous-baseline' };
  }
  if (!Number.isFinite(currentCount) || currentCount < 0) {
    return { trip: true, dropRatio: null, reason: 'invalid-current-count' };
  }
  const dropRatio = (previousCount - currentCount) / previousCount;
  if (dropRatio <= threshold) {
    return { trip: false, dropRatio, reason: 'within-threshold' };
  }
  // Monday Mon–Sun window reset: results.csv intentionally shrinks.
  if (isMondayWeekReset(today)) {
    return {
      trip: false,
      dropRatio,
      reason: 'monday-week-window-reset-excluded',
    };
  }
  return { trip: true, dropRatio, reason: 'drop-exceeds-threshold' };
}

module.exports = {
  COMMIT_FRESH_MAX_MS,
  DROP_RISK_RATIO,
  isCommitFresh,
  commitAgeHours,
  isMondayWeekReset,
  evaluateDropRisk,
};
