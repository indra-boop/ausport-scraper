'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseDayHtml } = require('./scraper');

const fixture = (name) => fs.readFileSync(
  path.join(__dirname, 'test-fixtures', name),
  'utf8'
);

{
  const rows = parseDayHtml(fixture('event-time-past.html'), 'tue');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].time_aedt, '3:30AM');
  assert.equal(rows[0].home, 'Osasuna');
  assert.equal(rows[0].away, 'Levante');
  assert.equal(rows[0].channels, 'beIN SPORTS 2');
}

{
  const rows = parseDayHtml(fixture('hot-events.html'), 'tue');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].day, 'hot');
  assert.equal(rows[0].sport, 'Tennis');
  assert.equal(rows[0].competition, 'ATP Winston-Salem');
  assert.equal(rows[0].home, 'Quinn Vandecasteele');
  assert.equal(rows[0].away, 'James Duckworth');
  assert.equal(rows[0].event_url, 'https://ausportguide.com/event/live-tennis/example/123');
}

{
  const rows = parseDayHtml(fixture('generic-h6-p.html'), 'tue');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].sport, 'Sailing / Boating');
  assert.equal(rows[0].competition, 'World Rowing Championships');
  assert.equal(rows[0].home, 'World Rowing Championships');
  assert.equal(rows[0].away, 'Day 2 Session 1');
  assert.equal(rows[0].title, 'Day 2 Session 1');
  assert.equal(rows[0].channels, 'Fox Sports 506 | Kayo Sports');
}

console.log('test-scraper-markup.js: all assertions passed');
