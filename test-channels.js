'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  parseDayHtml,
  extractDescriptionChannels,
  uniqueChannels,
} = require('./scraper');

const fixture = (name) =>
  fs.readFileSync(path.join(__dirname, 'test-fixtures', name), 'utf8');

const blob = (r) => `${r.home || ''} ${r.away || ''} ${r.title || ''}`;

{
  const raw =
    'Fremantle Dockers - Brisbane Lions AFL <br>Channel 7 Sydney, Channel 7 Sydney, Channel 7 Melbourne, 7plus Sport';
  assert.deepEqual(extractDescriptionChannels(`description: "${raw}"`), [
    'Channel 7 Sydney',
    'Channel 7 Melbourne',
    '7plus Sport',
  ]);
}

{
  const raw =
    'Dolphins - Sydney Roosters National Rugby League <br>Channel 9 Sydney, Channel 9 Melbourne, Fox League';
  assert.deepEqual(extractDescriptionChannels(`description: "${raw}"`), [
    'Channel 9 Sydney',
    'Channel 9 Melbourne',
    'Fox League',
  ]);
}

{
  const rows = parseDayHtml(fixture('afl-gf-channels.html'), 'sat');
  const row = rows.find((r) => /Fremantle/i.test(blob(r)) && /Brisbane/i.test(blob(r)));
  assert.ok(row, 'Fremantle vs Brisbane');
  assert.match(row.channels, /Channel 7/i);
  assert.match(row.channels, /7plus Sport/i);
}

{
  const rows = parseDayHtml(fixture('f1-azerbaijan-race.html'), 'sat');
  const row = rows.find((r) => /Azerbaijan/i.test(blob(r)) && /Race/i.test(blob(r)));
  assert.ok(row, 'F1 Azerbaijan Race');
  assert.match(row.channels, /Fox Sports 506/i);
  assert.match(row.channels, /Kayo Sports/i);
  assert.equal(row.time_wita, '6:55PM');
}

{
  const rows = parseDayHtml(fixture('nrl-dolphins-roosters.html'), 'fri');
  const row = rows.find((r) => /Dolphins/i.test(blob(r)) && /Roosters/i.test(blob(r)));
  assert.ok(row, 'Dolphins vs Roosters');
  assert.match(row.channels, /Channel 9/i);
  assert.match(row.channels, /Fox League/i);
}

{
  const rows = parseDayHtml(fixture('nrl-panthers-knights.html'), 'sun');
  const row = rows.find((r) => /Panthers/i.test(blob(r)) && /Knights/i.test(blob(r)));
  assert.ok(row, 'Panthers vs Knights');
  assert.match(row.channels, /Channel 9/i);
  assert.match(row.channels, /Fox League/i);
}

{
  const rows = parseDayHtml(fixture('grand-prix-sunday-empty.html'), 'sat');
  assert.equal(rows.length, 0, 'empty Grand Prix Sunday preview must be dropped');
}

assert.deepEqual(uniqueChannels(['Fox League', 'fox league', 'Channel 9 Sydney']), [
  'Fox League',
  'Channel 9 Sydney',
]);

console.log('test-channels.js: all assertions passed');
