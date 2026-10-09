#!/usr/bin/env node
'use strict';
/**
 * QC gate: empty `channels` ratio in results.csv (non-blocking).
 *
 * Usage: node scripts/qc-channels.js [path/to/results.csv]
 * - Prints a per-date breakdown.
 * - When ratio > EMPTY_CHANNELS_RATIO (10%), emits a GitHub Actions
 *   `::warning::` annotation so the run is flagged (visible via the
 *   check-runs annotations API and the run summary).
 * - Appends a Markdown table to $GITHUB_STEP_SUMMARY when available.
 * - Always exits 0 unless the CSV cannot be read (exit 2).
 */
const fs = require('fs');
const path = require('path');
const { parseCsv } = require('../scraper');
const { evaluateEmptyChannels, EMPTY_CHANNELS_RATIO } = require('../qc-rules');

const csvPath = path.resolve(process.argv[2] || path.join(__dirname, '..', 'results.csv'));
let rows;
try {
  rows = parseCsv(fs.readFileSync(csvPath, 'utf8'));
} catch (e) {
  console.error(`qc-channels: cannot read ${csvPath}: ${e.message}`);
  process.exit(2);
}

const r = evaluateEmptyChannels(rows);
const pct = (x) => (x === null ? 'n/a' : `${(x * 100).toFixed(1)}%`);
const limit = pct(EMPTY_CHANNELS_RATIO);

console.log(`Empty channels: ${r.empty}/${r.total} (${pct(r.ratio)}), limit ${limit}.`);
for (const d of r.byDate) {
  console.log(`  ${d.date}: ${d.empty}/${d.total} empty`);
}

if (r.trip) {
  const worst = r.byDate
    .filter((d) => d.empty)
    .map((d) => `${d.date} ${d.empty}/${d.total}`)
    .join(', ');
  console.log(
    `::warning title=QC empty channels::${r.empty}/${r.total} rows ` +
      `(${pct(r.ratio)}) have empty channels (> ${limit}). Per date: ${worst}`
  );
}

if (process.env.GITHUB_STEP_SUMMARY) {
  const lines = [
    `### QC empty channels — ${r.trip ? 'WARN' : 'PASS'}`,
    '',
    `Total: **${r.empty}/${r.total} (${pct(r.ratio)})**, limit ${limit}.`,
    '',
    '| tanggal_wita | empty | total |',
    '|---|---:|---:|',
    ...r.byDate.map((d) => `| ${d.date} | ${d.empty} | ${d.total} |`),
    '',
  ];
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
}
