'use strict';

const assert = require('node:assert/strict');
const {
  applyCurrentWeekFreshness,
  classifyHttpError,
  describeHttpError,
  convertSourceTimeToWita,
  extractTimeFromHotText,
  fmtTanggal,
  getWitaDateFromBase,
  parseAmPm,
  targetWeekBounds
} = require('./scraper');

const today = new Date(Date.UTC(2026, 7, 12));

// Mito–Tokyo Verdy (Ausport 1646050) appeared twice on 25 Nov 2026:
// both "9:00PM" and "21:00" mean 18:00 WITA. Check standard time and
// midnight too, so a fixed three-hour subtraction cannot pass.
const summer = new Date(Date.UTC(2026, 10, 25));
for (const [date, source, expected] of [
  [summer, '21:00', '6:00PM'], [summer, '9:00PM', '6:00PM'],
  [summer, '07:00', '4:00AM'], [summer, '00:30', '9:30PM'],
  [today, '21:00', '7:00PM'], [today, '01:00', '11:00PM']
]) assert.equal(convertSourceTimeToWita(source, date), expected);
assert.deepEqual(getWitaDateFromBase(summer, '00:30'), { hariWita: 'Selasa', tanggalWita: '24/11/26' });
assert.equal(extractTimeFromHotText('Today from 21:00 | Mito - Tokyo Verdy'), '21:00');
assert.equal(extractTimeFromHotText('Today from 9:00 PM | Mito - Tokyo Verdy'), '9:00PM');
for (const invalid of ['24:15', '15:60', '13:00PM', 'TBD']) assert.equal(parseAmPm(invalid), null);

const oldMito = { tanggal: '25/11/26', time_aedt: '21:00', tanggal_wita: '25/11/26', time_wita: '21:00',
  home: 'Mito', away: 'Tokyo Verdy', end_time_wita: '8:00PM', end_tanggal_wita: '25/11/26' };
const newMito = { ...oldMito, time_aedt: '9:00PM', time_wita: '6:00PM' };
const midnight = { ...oldMito, time_aedt: '00:30', time_wita: '00:30', home: 'Night match' };
const valid = { ...oldMito, time_wita: '18:00', home: 'Already converted' };
const repaired = applyCurrentWeekFreshness([newMito], [oldMito, midnight, valid], summer).rows;
assert.equal(repaired.length, 3);
assert.equal(repaired.find((r) => r.home === 'Mito').end_time_wita, '8:00PM');
assert.equal(repaired.find((r) => r.home === 'Night match').tanggal_wita, '24/11/26');
assert.equal(repaired.find((r) => r.home === 'Already converted').time_wita, '18:00');
assert.deepEqual(applyCurrentWeekFreshness([newMito], repaired, summer).rows, repaired);
const mondayRollover = { ...midnight, tanggal: '23/11/26', tanggal_wita: '23/11/26' };
assert.equal(applyCurrentWeekFreshness([newMito], [mondayRollover], summer).rows.length, 1);
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
