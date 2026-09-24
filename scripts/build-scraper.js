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
  if (src.includes('function mergeEventChannels') && src.includes('const channels = mergeEventChannels')) {
    console.log('channel-merge helpers already wired');
    return ensureExports(src);
  }
  const helpers = fs.readFileSync(
    path.join(__dirname, 'channel-merge-helpers.inc.js'),
    'utf8'
  );

  let out = src;
  if (!out.includes('function mergeEventChannels')) {
    let anchor = out.indexOf('function parseHotEvents');
    if (anchor < 0) anchor = out.indexOf('function parseHot');
    if (anchor < 0) anchor = out.indexOf('\nasync function main');
    if (anchor < 0) throw new Error('No insert anchor for channel helpers');
    out = out.slice(0, anchor) + helpers + '\n' + out.slice(anchor);
  }

  // Replace stationImg-only channel collection (multi-line) with mergeEventChannels
  const blockRe =
    /const\s+channels\s*=\s*\[\s*\];\s*\n\s*\$el\.find\(\s*['"]div\.text-end img\.stationImg['"]\s*\)\.each\(\([\s\S]*?\}\);/m;
  if (blockRe.test(out)) {
    out = out.replace(blockRe, 'const channels = mergeEventChannels($, $el);');
    console.log('Replaced div.text-end stationImg channel block');
  } else {
    console.warn('WARN: stationImg channel block not found');
  }

  // Drop empty Grand Prix Sunday preview rows
  if (out.includes('isEmptyGrandPrixSundayPreview') && !out.includes('!isEmptyGrandPrixSundayPreview(row)')) {
    out = out.replace(
      /(console\.log\(`  Rows for \$\{pathSuffix\}: \$\{rows\.length\}`\);\s*\n\s*)return rows;/,
      'const filtered = rows.filter((row) => !isEmptyGrandPrixSundayPreview(row));\n' +
        '  if (filtered.length !== rows.length) {\n' +
        "    console.log('  Dropped ' + (rows.length - filtered.length) + ' empty Grand Prix Sunday preview row(s)');\n" +
        '  }\n' +
        '  console.log(`  Rows for ${pathSuffix}: ${filtered.length}`);\n' +
        '  return filtered;'
    );
  }

  // Sanitize marketing titles when pushing row title
  if (out.includes('sanitizeAusportTitle') && !out.includes('sanitizeAusportTitle(')) {
    out = out.replace(
      /title:\s*title\s*,/g,
      'title: sanitizeAusportTitle(title, home, away, currentCompetition),'
    );
  }

  if (!out.includes('mergeEventChannels($, $el)')) {
    throw new Error('mergeEventChannels call not present after patch');
  }
  return ensureExports(out);
}

function ensureExports(src) {
  const needed = [
    'collapseRepeatedText',
    'isMarketingBlurb',
    'sanitizeAusportTitle',
    'extractDescriptionChannels',
    'mergeEventChannels',
    'uniqueChannels',
    'isEmptyGrandPrixSundayPreview',
  ];
  let out = src;
  const exportAnchor = out.lastIndexOf('module.exports = {');
  if (exportAnchor < 0) throw new Error('module.exports not found');
  const insertAt = exportAnchor + 'module.exports = {'.length;
  const missing = needed.filter((n) => {
    const after = out.slice(insertAt, insertAt + 1200);
    return !new RegExp('\\b' + n + '\\b').test(after);
  });
  if (missing.length) {
    out =
      out.slice(0, insertAt) +
      '\n    ' +
      missing.join(',\n    ') +
      ',' +
      out.slice(insertAt);
    console.log('Added exports:', missing.join(', '));
  }
  return out;
}

const fixed = applyChannelMerge(loadBase());
fs.writeFileSync(OUT, fixed);
console.log(`Wrote ${OUT} (${fixed.length} bytes)`);
