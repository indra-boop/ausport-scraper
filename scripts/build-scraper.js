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

  // Sanitize marketing / pipe-promo titles on day-page rows.
  // Gate on the object-property call site, not the function signature
  // (signature also contains sanitizeAusportTitle(title, ...)).
  if (!out.includes('title: sanitizeAusportTitle(')) {
    out = out.replace(
      /title:\s*title\s*,/g,
      'title: sanitizeAusportTitle(title, home, away, currentCompetition),'
    );
    // ES6 object shorthand in rows.push({ home, away, title, ... })
    const shorthandRe =
      /(competition:\s*currentCompetition,\s*\n\s*home,\s*\n\s*away,\s*\n\s*)title,/;
    if (shorthandRe.test(out)) {
      out = out.replace(
        shorthandRe,
        '$1title: sanitizeAusportTitle(title, home, away, currentCompetition),'
      );
      console.log('Wired sanitizeAusportTitle into day-page title shorthand');
    }
  }
  if (!out.includes('title: sanitizeAusportTitle(')) {
    console.warn('WARN: sanitizeAusportTitle not wired into day-page title');
  }

  // Keep integrity guard on all parsed rows, then exclude clear non-live programmes
  // from CSV and ingest. Apply to archive too so old replay rows do not persist.
  const liveFilter = `\nfunction isEligibleLiveGuideRow(row) {\n  const text = [row.title, row.competition, row.home, row.away].join(' ');\n  return !/\\b(?:replay|re-?run|highlights?|mini match|best of|classic|magazine|documentary|preview|review|recap|tayang ulang|siaran ulang|laga tunda)\\b/i.test(text);\n}\n`;
  if (!out.includes('function isEligibleLiveGuideRow')) {
    const anchor = out.indexOf('function dedupeRows(');
    if (anchor < 0) throw new Error('No dedupeRows anchor for live filter');
    out = out.slice(0, anchor) + liveFilter + out.slice(anchor);
  }
  const dedupeAnchor = 'allRows = dedupeRows(allRows);';
  if (!out.includes('allRows = dedupeRows(allRows.filter(isEligibleLiveGuideRow));')) {
    if (!out.includes(dedupeAnchor)) throw new Error('No publish dedupe anchor');
    // Preserve scraped row count for the integrity guard; filter after it.
    const freshnessAnchor = 'const freshness = applyCurrentWeekFreshness(allRows, previousRows);';
    if (!out.includes(freshnessAnchor)) throw new Error('No freshness anchor');
    out = out.replace(freshnessAnchor,
      'const eligibleRows = allRows.filter(isEligibleLiveGuideRow);\n' +
      '  const eligiblePrevious = previousRows.filter(isEligibleLiveGuideRow);\n' +
      '  console.log(`Live guide filter: ${eligibleRows.length}/${allRows.length} rows eligible`);\n' +
      '  const freshness = applyCurrentWeekFreshness(eligibleRows, eligiblePrevious);');
  }

  if (!out.includes('mergeEventChannels($, $el)')) {
    throw new Error('mergeEventChannels call not present after patch');
  }

  // Day pages carry the event link on the card's .openUrl div (data-link), not
  // on an <a>. parseDayHtml used to hard-code event_url: '' so only hot-event
  // rows had a URL. Read it the same way parseHotEvents does.
  const dayEventUrl =
    "event_url: buildEventUrl(($el.find('.openUrl').first().attr('data-link') || '').trim())";
  if (!out.includes(dayEventUrl)) {
    const emptyUrlRe = /(channels:\s*channels\.join\(' \| '\),\s*\n\s*)event_url:\s*''/;
    if (!emptyUrlRe.test(out)) throw new Error('No day-page event_url anchor');
    out = out.replace(emptyUrlRe, `$1${dayEventUrl}`);
    console.log('Wired day-page event_url from data-link');
  }
  return ensureExports(out);
}

function ensureExports(src) {
  const needed = [
    'collapseRepeatedText',
    'isMarketingBlurb',
    'splitAusportTitlePipe',
    'sanitizeAusportTitle',
    'extractDescriptionChannels',
    'mergeEventChannels',
    'uniqueChannels',
    'isEmptyGrandPrixSundayPreview',
    'isEligibleLiveGuideRow',
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
