'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  median,
  readBaseline,
  baselineCounts,
  evaluateRowGuard,
  appendBaselineRun,
  DEFAULT_MINIMUM_ROWS,
  DEFAULT_BASELINE_MIN_RATIO
} = require('./scraper');

/* ---------- median ---------- */
assert.equal(median([]), null);
assert.equal(median([5]), 5);
assert.equal(median([3, 1, 2]), 2);
assert.equal(median([4, 1, 3, 2]), 2.5);
// Median tahan terhadap satu run rusak; mean tidak.
assert.equal(median([200, 210, 6, 205, 198]), 200);

/* ---------- evaluateRowGuard ---------- */
const guard = (scrapedRows, counts, opts = {}) =>
  evaluateRowGuard({
    scrapedRows,
    counts,
    minimumRows: opts.minimumRows ?? DEFAULT_MINIMUM_ROWS,
    baselineMinRatio: opts.baselineMinRatio ?? DEFAULT_BASELINE_MIN_RATIO
  });

// Regresi utama: threshold lama "1" meloloskan selector rusak.
{
  const v = guard(1, []);
  assert.equal(v.ok, false);
  assert.match(v.reason, /absolute floor/);
}

// Tanpa baseline, hanya floor yang berlaku.
{
  const v = guard(60, []);
  assert.equal(v.ok, true);
  assert.equal(v.baselineMedian, null);
  assert.equal(v.ratioThreshold, null);
  assert.equal(v.threshold, DEFAULT_MINIMUM_ROWS);
}

// Baseline sehat: turun wajar tetap lolos.
{
  const v = guard(150, [200, 210, 190, 205]);
  assert.equal(v.ok, true);
  assert.equal(v.baselineMedian, 202.5);
  assert.equal(v.ratioThreshold, 81); // ceil(202.5 * 0.4)
}

// Baseline sehat: anjlok 75% ditolak meski di atas floor absolut.
{
  const v = guard(70, [200, 210, 190, 205]);
  assert.equal(v.ok, false);
  assert.match(v.reason, /baseline drop/);
  assert.equal(v.threshold, 81);
}

// Tepat di threshold rasio = lolos (batas inklusif).
{
  const v = guard(81, [200, 210, 190, 205]);
  assert.equal(v.ok, true);
}

// Floor menang saat baseline masih kecil.
{
  const v = guard(40, [60, 62, 58]);
  assert.equal(v.ok, false);
  assert.match(v.reason, /absolute floor/);
  assert.equal(v.threshold, DEFAULT_MINIMUM_ROWS);
}

// Ratio threshold tidak pernah menurunkan floor.
{
  const v = guard(55, [60, 62, 58]);
  assert.equal(v.ok, true);
  assert.equal(v.threshold, DEFAULT_MINIMUM_ROWS);
}

/* ---------- baseline persistence ---------- */
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'baseline-'));
  const file = path.join(dir, 'baseline.json');

  // File belum ada -> baseline kosong, bukan crash.
  assert.deepEqual(readBaseline(file), { runs: [] });

  // File korup -> baseline kosong, bukan crash.
  fs.writeFileSync(file, '{not json');
  assert.deepEqual(readBaseline(file), { runs: [] });

  // Entry tanpa scrapedRows integer dibuang.
  fs.writeFileSync(
    file,
    JSON.stringify({ runs: [{ at: '2026-08-16T00:00:00Z' }, { scrapedRows: 5 }] })
  );
  assert.deepEqual(readBaseline(file).runs, []);

  fs.writeFileSync(file, JSON.stringify({ runs: [] }));
  let baseline = readBaseline(file);
  for (const rows of [200, 210, 190]) {
    baseline = appendBaselineRun(
      file,
      baseline,
      { at: '2026-08-17T00:00:00Z', scrapedRows: rows, publishedRows: rows, failedDays: 0 },
      7
    );
  }
  assert.deepEqual(baselineCounts(readBaseline(file), 7), [200, 210, 190]);
  assert.deepEqual(baselineCounts(readBaseline(file), 2), [210, 190]);

  // Retensi terbatas: tidak tumbuh tanpa batas.
  for (let i = 0; i < 100; i++) {
    baseline = appendBaselineRun(
      file,
      baseline,
      { at: '2026-08-18T00:00:00Z', scrapedRows: 200, publishedRows: 200, failedDays: 0 },
      7
    );
  }
  assert.equal(readBaseline(file).runs.length, 30);

  fs.rmSync(dir, { recursive: true, force: true });
}

console.log('test-guard.js: all assertions passed');
