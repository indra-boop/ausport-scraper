'use strict';

const assert = require('node:assert/strict');
const {
  COMMIT_FRESH_MAX_MS,
  isCommitFresh,
  commitAgeHours,
  isMondayWeekReset,
  evaluateDropRisk,
} = require('./qc-rules');

const HOUR = 60 * 60 * 1000;
const now = new Date('2026-10-05T05:30:00.000Z');

assert.equal(COMMIT_FRESH_MAX_MS, 26 * HOUR);

// B) 26h freshness — not calendar "today"
assert.equal(isCommitFresh(new Date(now.getTime() - 25 * HOUR), now), true);
assert.equal(isCommitFresh(new Date(now.getTime() - 26 * HOUR), now), false);
assert.equal(isCommitFresh(new Date(now.getTime() - 26 * HOUR + 1000), now), true);
// Yesterday calendar but still <26h
assert.equal(
  isCommitFresh(new Date('2026-10-04T10:00:00.000Z'), new Date('2026-10-05T05:00:00.000Z')),
  true
);
assert.ok(commitAgeHours(new Date(now.getTime() - 13 * HOUR), now) > 12.9);

// C) Monday week-reset exclusion for >60% drop
const monday = new Date(Date.UTC(2026, 9, 5)); // 2026-10-05 is Monday
const tuesday = new Date(Date.UTC(2026, 9, 6));
assert.equal(isMondayWeekReset(monday), true);
assert.equal(isMondayWeekReset(tuesday), false);

const monDrop = evaluateDropRisk(300, 80, monday); // ~73% drop
assert.equal(monDrop.trip, false);
assert.equal(monDrop.reason, 'monday-week-window-reset-excluded');
assert.ok(monDrop.dropRatio > 0.6);

const tueDrop = evaluateDropRisk(300, 80, tuesday);
assert.equal(tueDrop.trip, true);
assert.equal(tueDrop.reason, 'drop-exceeds-threshold');

const small = evaluateDropRisk(300, 200, tuesday); // ~33%
assert.equal(small.trip, false);
assert.equal(small.reason, 'within-threshold');

// D) Empty-channels gate (>10% → trip, non-blocking)
const { evaluateEmptyChannels, EMPTY_CHANNELS_RATIO } = require('./qc-rules');
assert.equal(EMPTY_CHANNELS_RATIO, 0.1);
const mk = (date, ch) => ({ tanggal_wita: date, channels: ch });
const okRows = [
  ...Array.from({ length: 19 }, () => mk('10/10/26', '[AU] Kayo Sports')),
  mk('11/10/26', ''),
]; // 1/20 = 5%
const ok = evaluateEmptyChannels(okRows);
assert.equal(ok.trip, false);
assert.equal(ok.empty, 1);
assert.equal(ok.total, 20);

const atLimit = evaluateEmptyChannels([
  ...Array.from({ length: 9 }, () => mk('10/10/26', '[AU] Fox Footy')),
  mk('10/10/26', ''),
]); // exactly 10% → not > 10%
assert.equal(atLimit.trip, false);

const bad = evaluateEmptyChannels([
  mk('09/10/26', '[AU] 7mate'),
  mk('11/10/26', ''),
  mk('11/10/26', '[AU]'), // prefix only counts as empty
  mk('10/10/26', '[AU] ESPN'),
]);
assert.equal(bad.trip, true);
assert.equal(bad.empty, 2);
assert.deepEqual(bad.byDate.map((d) => d.date), ['09/10/26', '10/10/26', '11/10/26']);
assert.deepEqual(bad.byDate[2], { date: '11/10/26', empty: 2, total: 2 });

assert.equal(evaluateEmptyChannels([]).trip, false);
assert.equal(evaluateEmptyChannels([]).ratio, null);

console.log('qc-rules tests passed');
