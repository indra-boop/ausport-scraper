'use strict';

const assert = require('node:assert/strict');
const {
  collapseRepeatedText,
  isMarketingBlurb,
  sanitizeAusportTitle,
} = require('./scraper');

const blurb = "Exclusive coverage of the 2025 ATP Tour on beIN SPORTS as the world's best male players battle it out across the globe to be #1.";
const doubled = blurb + blurb;

assert.equal(collapseRepeatedText(doubled), blurb);
assert.equal(isMarketingBlurb(blurb), true);
assert.equal(isMarketingBlurb('Chengdu Day 2'), false);
assert.equal(sanitizeAusportTitle(doubled, 'Chengdu Day 2', '', 'ATP Chengdu'), 'Chengdu Day 2');
assert.equal(sanitizeAusportTitle('ATP 250', 'Hangzhou Day 2', '', 'ATP Hangzhou'), 'ATP 250');
assert.equal(sanitizeAusportTitle(blurb, 'Player A', 'Player B', 'ATP'), 'Player A vs Player B');

console.log('test-sanitize-title.js: all assertions passed');
