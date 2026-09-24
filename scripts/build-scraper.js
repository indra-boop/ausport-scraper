#!/usr/bin/env node
'use strict';
/**
 * Restore scraper.js from last good git revision (pre-PLACEHOLDER wipe),
 * then inject channel-merge helpers so calendar <br> channels (Fox League,
 * Kayo, Channel 7) are captured alongside stationImg.
 *
 * GOOD_SHA = f6cb99ab... (confirmed full scraper before PLACEHOLDER wipe).
 * CI must checkout with fetch-depth: 0.
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, '.scraper.assembled.js');
const GOOD_SHA = 'f6cb99ab36ea1c0181fca6b1550a10b9e7f1b595';

function loadBase() {
  try {
    const src = execSync(`git show ${GOOD_SHA}:scraper.js`, {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    });
    if (src.trim() === 'PLACEHOLDER' || src.length < 1000) {
      throw new Error('GOOD_SHA scraper is PLACEHOLDER');
    }
    console.log(`Restored scraper from ${GOOD_SHA} (${src.length} bytes)`);
    return src;
  } catch (e) {
    const backup = path.join(ROOT, 'scraper.full.backup.js');
    if (fs.existsSync(backup)) {
      console.warn(`git show failed (${e.message}); using scraper.full.backup.js`);
      return fs.readFileSync(backup, 'utf8');
    }
    throw e;
  }
}

function applyChannelMerge(src) {
  if (src.includes('function mergeEventChannels')) {
    console.log('channel-merge helpers already present');
    return src;
  }
  const helpers = fs.readFileSync(
    path.join(__dirname, 'channel-merge-helpers.inc.js'),
    'utf8'
  );

  let anchor = src.indexOf('function parseHotEvents');
  if (anchor < 0) anchor = src.indexOf('function parseHot');
  if (anchor < 0) anchor = src.indexOf('\nasync function main');
  if (anchor < 0) throw new Error('No insert anchor for channel helpers');
  let out = src.slice(0, anchor) + helpers + '\n' + src.slice(anchor);

  const patterns = [
    [/const\s+channels\s*=\s*\$el\.find\(\s*['"]img\.stationImg['"]\s*\)[\s\S]*?;/g,
     'const channels = mergeEventChannels($, $el);'],
    [/let\s+channels\s*=\s*\$el\.find\(\s*['"]img\.stationImg['"]\s*\)[\s\S]*?;/g,
     'let channels = mergeEventChannels($, $el);'],
    [/const\s+channels\s*=\s*\$\(el\)\.find\(\s*['"]img\.stationImg['"]\s*\)[\s\S]*?;/g,
     'const channels = mergeEventChannels($, $(el));'],
    [/const\s+channels\s*=\s*\$el\.find\(\s*['"]img\.stationImg['"]\s*\)[\s\S]*?;/g,
     'const channels = mergeEventChannels($, $el);'],
  ];
  let hits = 0;
  for (const [re, rep] of patterns) {
    const m = out.match(re);
    if (m) { hits += m.length; out = out.replace(re, rep); }
  }
  console.log(`Replaced ${hits} stationImg-only channel assignment(s)`);

  if (out.includes('isEmptyGrandPrixSundayPreview') && !out.includes('isEmptyGrandPrixSundayPreview(row)')) {
    out = out.replace(
      /(function parseDayHtml[\s\S]*?)(\n\s*return rows;)/,
      '$1\n  const filtered = rows.filter((row) => !isEmptyGrandPrixSundayPreview(row));\n' +
      '  if (filtered.length !== rows.length) {\n' +
      "    console.log('  Dropped ' + (rows.length - filtered.length) + ' empty Grand Prix Sunday preview row(s)');\n" +
      '  }\n  return filtered;'
    );
  }

  if (out.includes('sanitizeAusportTitle') && !out.includes('sanitizeAusportTitle(')) {
    out = out.replace(
      /title:\s*title\s*,/g,
      'title: sanitizeAusportTitle(title, home, away, currentCompetition),'
    );
  }

  if (!out.includes('mergeEventChannels')) {
    throw new Error('mergeEventChannels not present after patch');
  }
  return out;
}

const fixed = applyChannelMerge(loadBase());
fs.writeFileSync(OUT, fixed);
console.log(`Wrote ${OUT} (${fixed.length} bytes)`);
