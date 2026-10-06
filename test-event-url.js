'use strict';

// Day-page cards expose the event link as data-link on the .openUrl div.
// Regression: parseDayHtml returned event_url '' for every non-hot row.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseDayHtml } = require('./scraper');

const html = fs.readFileSync(path.join(__dirname, 'test-fixtures', 'day-card-data-link.html'), 'utf8');
const rows = parseDayHtml(html, 'wed');

assert.equal(rows.length, 1);
const [row] = rows;
assert.equal(row.home, 'Croatia');
assert.equal(row.away, 'Spain');
assert.equal(
  row.event_url,
  'https://ausportguide.com/event/live-football-uefa-nations-league-b-croatia-spain/1615273'
);
// Channel and end time from the same card must keep working.
assert.equal(row.channels, 'beIN Sports Connect | beIN SPORTS 2');
assert.equal(row.time_aedt, '5:45AM');
assert.ok(row.end_time_wita, 'end_time_wita terisi dari kalender');

// A card without data-link keeps an empty URL instead of a bare base URL.
const noLink = parseDayHtml(html.replace(/data-link="[^"]*"/, ''), 'wed');
assert.equal(noLink[0].event_url, '');

console.log('test-event-url: OK');
