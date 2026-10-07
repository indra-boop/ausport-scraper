'use strict';

const assert = require('node:assert/strict');
const {
  collapseRepeatedText,
  isMarketingBlurb,
  splitAusportTitlePipe,
  sanitizeAusportTitle,
} = require('./scraper');

const blurb = "Exclusive coverage of the 2025 ATP Tour on beIN SPORTS as the world's best male players battle it out across the globe to be #1.";
const doubled = blurb + blurb;
const nations =
  'France Vs Belgium | The Uefa Nations League 2026/27 Is The Fifth Edition Of The European International Football Competition. It Features 54 National Teams Divided Into Four Leagues. The League Phase Takes Place In The Fall Of 2026, With The Title Decided At The Nations League Finals In June 2027';
const moto =
  'The greatest up and coming talent in two wheel motorsport come from around the world to battle it out for glory and the potential to move up to the big stage.';

assert.equal(collapseRepeatedText(doubled), blurb);
assert.equal(isMarketingBlurb(blurb), true);
assert.equal(isMarketingBlurb('Chengdu Day 2'), false);
assert.equal(isMarketingBlurb(moto), true);

assert.equal(splitAusportTitlePipe(nations).title, 'France Vs Belgium');
assert.ok(splitAusportTitlePipe(nations).description.length > 60);
assert.equal(
  splitAusportTitlePipe('Cologne Vs Hoffenheim | Bundesliga').title,
  'Cologne Vs Hoffenheim | Bundesliga'
);

assert.equal(sanitizeAusportTitle(doubled, 'Chengdu Day 2', '', 'ATP Chengdu'), 'Chengdu Day 2');
assert.equal(sanitizeAusportTitle('ATP 250', 'Hangzhou Day 2', '', 'ATP Hangzhou'), 'ATP 250');
assert.equal(sanitizeAusportTitle(blurb, 'Player A', 'Player B', 'ATP'), 'Player A vs Player B');

// QA-1007-01: pipe promo → short title; short | competition kept; marketing→home
assert.equal(sanitizeAusportTitle(nations, 'France', 'Belgium', 'UEFA Nations League A'), 'France Vs Belgium');
assert.equal(
  sanitizeAusportTitle('Cologne Vs Hoffenheim | Bundesliga', 'FC Koln', 'Hoffenheim', 'Bundesliga'),
  'Cologne Vs Hoffenheim | Bundesliga'
);
assert.equal(
  sanitizeAusportTitle(moto, 'Moto3 Indonesia Practice 3', '', 'Moto 3'),
  'Moto3 Indonesia Practice 3'
);
assert.equal(
  sanitizeAusportTitle('Real Sociedad Vs Deportivo | Laliga', 'Real Sociedad', 'Deportivo La Coruna', 'La Liga'),
  'Real Sociedad Vs Deportivo | Laliga'
);
assert.equal(
  sanitizeAusportTitle('Brisbane Broncos vs New Zealand Warriors', 'Brisbane Broncos', 'New Zealand Warriors', 'NRL'),
  'Brisbane Broncos vs New Zealand Warriors'
);

console.log('test-sanitize-title.js: all assertions passed');
