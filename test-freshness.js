'use strict';

const assert = require('node:assert/strict');
const {
  applyCurrentWeekFreshness,
  classifyHttpError,
  describeHttpError,
  fmtTanggal,
  targetWeekBounds
} = require('./scraper');

const today = new Date(Date.UTC(2026, 7, 12));
const event = (date, home) => ({
  tanggal_wita: date,
  time_wita: '5:30PM',
  sport: 'Soccer',
  competition: 'Test',
  home,
  away: 'Away',
  channels: 'Channel'
});

const result = applyCurrentWeekFreshness(
  [event('12/08/26', 'Wed'), event('16/08/26', 'Sun'), event('17/08/26', 'Next Mon')],
  [event('10/08/26', 'Mon'), event('11/08/26', 'Tue'), event('17/08/26', 'Old Next Mon')],
  today
);

assert.deepEqual(result.rows.map((row) => row.tanggal_wita).sort(), [
  '10/08/26', '11/08/26', '12/08/26', '16/08/26'
]);
assert.equal(result.dropped, 1);
assert.equal(result.archived, 2);
const bounds = targetWeekBounds(today);
assert.equal(fmtTanggal(bounds.start), '10/08/26');
assert.equal(fmtTanggal(bounds.end), '16/08/26');
assert.equal(classifyHttpError({ response: { status: 403 } }), 'upstream-forbidden-or-waf');
assert.equal(classifyHttpError({ response: { status: 429 } }), 'upstream-rate-limit');
assert.equal(classifyHttpError({ code: 'ETIMEDOUT' }), 'network-timeout');
assert.equal(classifyHttpError({ code: 'ENOTFOUND' }), 'dns-failure');
assert.deepEqual(
  describeHttpError(
    {
      message: 'Request failed',
      code: 'ERR_BAD_RESPONSE',
      response: {
        status: 503,
        statusText: 'Service Unavailable',
        headers: { server: 'cloudflare', 'retry-after': '30', 'cf-ray': 'abc' }
      }
    },
    'https://example.test',
    2,
    125
  ),
  {
    url: 'https://example.test',
    attempt: 2,
    durationMs: 125,
    cause: 'upstream-server-error',
    message: 'Request failed',
    code: 'ERR_BAD_RESPONSE',
    status: 503,
    statusText: 'Service Unavailable',
    server: 'cloudflare',
    retryAfter: '30',
    cfRay: 'abc'
  }
);
console.log('freshness tests passed');
