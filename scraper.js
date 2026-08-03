/**
 * ausport-scraper — ausportguide.com -> results.csv + Google Sheets + dashboard
 *
 * Rev 2.0 | 03 Aug 2026
 *
 * PERUBAHAN UTAMA DARI REV SEBELUMNYA
 *   [FIX-1] Konversi waktu Australia -> WITA sekarang DST-aware.
 *           Sebelumnya offset di-hardcode -3 jam (asumsi AEDT/UTC+11
 *           sepanjang tahun). April-Oktober Australia memakai AEST/UTC+10
 *           sehingga offset yang benar -2 jam. Akibatnya seluruh data
 *           April-Oktober meleset 1 jam lebih awal.
 *   [FIX-2] Tanggal tidak lagi bergantung timezone runner. Semua operasi
 *           tanggal memakai komponen UTC eksplisit, bukan toLocaleDateString.
 *   [FIX-3] Rollover tahun. Scrape "1 Jan" di akhir Desember sebelumnya
 *           menghasilkan tahun berjalan, bukan tahun depan.
 *   [FIX-4] "Hari ini" dihitung di zona Sydney, bukan zona runner (UTC).
 *   [FIX-5] Validasi environment dilakukan di awal (fail fast), bukan
 *           setelah CSV ditulis dan data terlanjur dikirim ke Sheets.
 *   [FIX-6] Retry pada HTTP request. Sebelumnya satu kegagalan transient
 *           membuang seluruh data satu hari tanpa menggagalkan job.
 *   [FIX-7] Dedupe tidak lagi memakai kolom channel sebagai kunci.
 *           Event yang sama dari Hot Events dan listing reguler punya
 *           format channel berbeda sehingga tidak pernah terdeteksi
 *           duplikat. Channel sekarang digabung.
 *   [FIX-8] Unhandled promise rejection ditangani eksplisit.
 *
 * SKEMA OUTPUT TIDAK BERUBAH. Nama kolom CSV dan field JSON identik dengan
 * versi lama supaya doPost() dan dashboard tidak perlu ikut diubah.
 * Kolom `time_aedt` tetap bernama demikian meski isinya waktu sumber apa
 * adanya (bisa AEST maupun AEDT) — mengganti namanya akan memutus
 * downstream yang tidak terlihat dari repo ini.
 */

'use strict';

const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

/* ============================================================
   KONFIGURASI
   ============================================================ */

const BASE_URL = 'https://ausportguide.com';
const GUIDE_PATH = '/live-sports-tv-guide';

/** Zona waktu situs sumber. Ubah kalau situs ternyata memakai zona lain
 *  (mis. Australia/Brisbane atau Australia/Perth yang tidak memakai DST). */
const SOURCE_TZ = 'Australia/Sydney';

/** Zona waktu tujuan. WITA = UTC+8, tidak memakai DST. */
const TARGET_TZ = 'Asia/Makassar';

const DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const HARI_ID = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

const MONTH_MAP = {
  January: 0, Jan: 0,
  February: 1, Feb: 1,
  March: 2, Mar: 2,
  April: 3, Apr: 3,
  May: 4,
  June: 5, Jun: 5,
  July: 6, Jul: 6,
  August: 7, Aug: 7,
  September: 8, Sep: 8, Sept: 8,
  October: 9, Oct: 9,
  November: 10, Nov: 10,
  December: 11, Dec: 11
};

const HTTP_TIMEOUT_MS = 30000;
const HTTP_RETRIES = 3;
const HTTP_RETRY_BASE_MS = 2000;

const CSV_COLUMNS = [
  'day', 'hari', 'tanggal', 'time_aedt', 'time_wita', 'hari_wita',
  'tanggal_wita', 'sport', 'competition', 'home', 'away', 'title',
  'channels', 'event_url'
];

/* ============================================================
   ENVIRONMENT — validasi di awal (FIX-5)
   ============================================================ */

function readConfig() {
  const errors = [];

  const rawMin = process.env.MINIMUM_EVENT_ROWS ?? '1';
  const minimumRows = Number.parseInt(rawMin, 10);
  if (!Number.isInteger(minimumRows) || minimumRows < 1) {
    errors.push(`MINIMUM_EVENT_ROWS must be a positive integer, got "${rawMin}"`);
  }

  const dashboardUrl = process.env.DASHBOARD_INGEST_URL;
  const dashboardToken = process.env.DASHBOARD_INGEST_TOKEN;
  if (!dashboardUrl) errors.push('DASHBOARD_INGEST_URL is not set');
  if (!dashboardToken) errors.push('DASHBOARD_INGEST_TOKEN is not set');

  if (errors.length) {
    throw new Error('Invalid configuration:\n  - ' + errors.join('\n  - '));
  }

  return {
    minimumRows,
    dashboardUrl,
    dashboardToken,
    // WEBAPP_URL opsional: kalau kosong, langkah Sheets dilewati.
    webappUrl: process.env.WEBAPP_URL || null
  };
}

/* ============================================================
   TIMEZONE — inti perbaikan (FIX-1, FIX-2)
   ============================================================ */

const pad2 = (n) => String(n).padStart(2, '0');

/** Offset zona (menit) pada satu instant UTC tertentu. */
function tzOffsetMinutes(utcMs, timeZone) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
  const p = {};
  for (const { type, value } of dtf.formatToParts(new Date(utcMs))) p[type] = value;
  const asUtc = Date.UTC(
    Number(p.year), Number(p.month) - 1, Number(p.day),
    Number(p.hour) % 24, Number(p.minute), Number(p.second)
  );
  return (asUtc - utcMs) / 60000;
}

/** Pecah instant UTC menjadi komponen tanggal/jam di zona tertentu. */
function partsInTz(utcMs, timeZone) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  });
  const p = {};
  for (const { type, value } of dtf.formatToParts(new Date(utcMs))) p[type] = value;
  return {
    year: Number(p.year),
    monthIdx: Number(p.month) - 1,
    day: Number(p.day),
    hour: Number(p.hour) % 24,
    minute: Number(p.minute)
  };
}

/**
 * Waktu dinding di SOURCE_TZ -> instant UTC (ms).
 * Offset AEST/AEDT ditentukan otomatis dari tanggalnya.
 */
function sourceLocalToUtc(year, monthIdx, day, hour, minute) {
  const naive = Date.UTC(year, monthIdx, day, hour, minute);
  let utc = naive - tzOffsetMinutes(naive, SOURCE_TZ) * 60000;
  // Iterasi kedua menstabilkan hasil di tanggal pergantian DST.
  utc = naive - tzOffsetMinutes(utc, SOURCE_TZ) * 60000;
  return utc;
}

/** Tanggal "hari ini" di zona sumber, sebagai Date berbasis UTC midnight. */
function todayInSourceTz() {
  const p = partsInTz(Date.now(), SOURCE_TZ);
  return new Date(Date.UTC(p.year, p.monthIdx, p.day));
}

/** Parse "7:30PM" -> { hour, minute } dalam 24 jam. Null kalau tidak valid. */
function parseAmPm(timeStr) {
  const m = String(timeStr ?? '').trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;
  let hour = parseInt(m[1], 10);
  const minute = parseInt(m[2], 10);
  if (hour < 1 || hour > 12 || minute > 59) return null;
  if (/PM/i.test(m[3]) && hour !== 12) hour += 12;
  if (/AM/i.test(m[3]) && hour === 12) hour = 0;
  return { hour, minute };
}

/**
 * Konversi jam sumber -> jam WITA.
 * baseDate WAJIB: offset DST hanya bisa ditentukan kalau tanggalnya diketahui.
 * Format output dipertahankan seperti versi lama, mis. "5:30PM".
 * Input yang tidak bisa diparse dikembalikan apa adanya.
 */
function convertSourceTimeToWita(timeStr, baseDate) {
  const t = parseAmPm(timeStr);
  if (!t) return timeStr;

  const utc = sourceLocalToUtc(
    baseDate.getUTCFullYear(), baseDate.getUTCMonth(), baseDate.getUTCDate(),
    t.hour, t.minute
  );
  const w = partsInTz(utc, TARGET_TZ);

  const ampm = w.hour >= 12 ? 'PM' : 'AM';
  const disp = w.hour % 12 === 0 ? 12 : w.hour % 12;
  return `${disp}:${pad2(w.minute)}${ampm}`;
}

/** Hari + tanggal WITA, termasuk rollover kalau melewati tengah malam. */
function getWitaDateFromBase(baseDate, timeStr) {
  const t = parseAmPm(timeStr);

  if (!t) {
    return { hariWita: fmtHari(baseDate), tanggalWita: fmtTanggal(baseDate) };
  }

  const utc = sourceLocalToUtc(
    baseDate.getUTCFullYear(), baseDate.getUTCMonth(), baseDate.getUTCDate(),
    t.hour, t.minute
  );
  const w = partsInTz(utc, TARGET_TZ);
  const witaDate = new Date(Date.UTC(w.year, w.monthIdx, w.day));

  return { hariWita: fmtHari(witaDate), tanggalWita: fmtTanggal(witaDate) };
}

/* ============================================================
   FORMAT TANGGAL — deterministik, tidak bergantung locale runner (FIX-2)
   ============================================================ */

function fmtHari(dateUtc) {
  return HARI_ID[dateUtc.getUTCDay()];
}

function fmtTanggal(dateUtc) {
  return `${pad2(dateUtc.getUTCDate())}/${pad2(dateUtc.getUTCMonth() + 1)}/` +
         String(dateUtc.getUTCFullYear()).slice(-2);
}

/**
 * Tentukan tahun untuk tanggal yang hanya menyebut hari dan bulan (FIX-3).
 * Situs hanya menampilkan "12. Dec" tanpa tahun. Kalau di-scrape akhir
 * Desember, "3 Jan" adalah tahun depan, bukan tahun berjalan.
 */
function resolveYear(monthIdx, day, reference) {
  const DAY_MS = 86400000;
  const refMs = Date.UTC(
    reference.getUTCFullYear(), reference.getUTCMonth(), reference.getUTCDate()
  );
  const y = reference.getUTCFullYear();
  const deltaDays = (Date.UTC(y, monthIdx, day) - refMs) / DAY_MS;

  if (deltaDays < -180) return y + 1;   // sudah jauh lewat -> tahun depan
  if (deltaDays > 180) return y - 1;    // masih jauh di depan -> tahun lalu
  return y;
}

/* ============================================================
   HTTP — dengan retry (FIX-6)
   ============================================================ */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchHtml(url) {
  let lastErr;

  for (let attempt = 1; attempt <= HTTP_RETRIES; attempt++) {
    try {
      const res = await axios.get(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
            '(KHTML, like Gecko) Chrome/122.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9'
        },
        timeout: HTTP_TIMEOUT_MS,
        maxRedirects: 5,
        // Hanya 2xx yang dianggap sukses. Redirect sudah ditangani axios;
        // 3xx yang tersisa berarti redirect loop atau limit terlampaui.
        validateStatus: (s) => s >= 200 && s < 300
      });
      return res.data;
    } catch (e) {
      lastErr = e;
      const status = e.response?.status;
      // 4xx (selain 429) tidak akan membaik dengan retry.
      if (status && status >= 400 && status < 500 && status !== 429) break;
      if (attempt < HTTP_RETRIES) {
        const wait = HTTP_RETRY_BASE_MS * attempt;
        console.warn(`  attempt ${attempt}/${HTTP_RETRIES} failed (${e.message}), retry in ${wait}ms`);
        await sleep(wait);
      }
    }
  }

  throw lastErr;
}

/* ============================================================
   PARSING TANGGAL HALAMAN
   ============================================================ */

/** Fallback: hitung tanggal dari nama hari, relatif hari ini di Sydney (FIX-4). */
function fallbackDateForDay(pathSuffix) {
  const DAY_MAP = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
  const today = todayInSourceTz();
  const target = DAY_MAP[pathSuffix];

  if (target == null) return today;

  const baseDate = new Date(today);
  baseDate.setUTCDate(today.getUTCDate() + (target - today.getUTCDay()));
  return baseDate;
}

/** Ambil tanggal dari <h2 class="dayInfo">Friday, 12. Dec | ...</h2> */
function resolveDateForPage($, pathSuffix) {
  const headerText = $('h2.dayInfo').first().text().trim();
  console.log('  DAY HEADER:', headerText || '(empty)');

  const m = headerText.match(
    /(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+(\d{1,2})\.\s+([A-Za-z]+)/i
  );

  let baseDate;
  if (m) {
    const dayNum = parseInt(m[2], 10);
    const monthName = m[3].charAt(0).toUpperCase() + m[3].slice(1).toLowerCase();
    const monthIdx = MONTH_MAP[monthName];

    if (monthIdx != null && dayNum >= 1 && dayNum <= 31) {
      const year = resolveYear(monthIdx, dayNum, todayInSourceTz());
      baseDate = new Date(Date.UTC(year, monthIdx, dayNum));
    }
  }

  if (!baseDate) {
    console.warn('  Header date not parsed, using fallback for', pathSuffix);
    baseDate = fallbackDateForDay(pathSuffix);
  }

  return {
    baseDate,
    hariIndo: fmtHari(baseDate),
    tanggalFormatted: fmtTanggal(baseDate)
  };
}

/* ============================================================
   SPORT LOOKUP
   ============================================================ */

function readSportFromHeading($, h3) {
  if (!h3 || !h3.length) return '';
  const img = h3.find('img').first();
  const span = h3.find('span.align-middle').first();
  return (img.attr('title') || img.attr('alt') || '').trim() ||
         span.text().trim() ||
         h3.text().trim();
}

function findSportForEvent($, eventDiv) {
  const $event = $(eventDiv);

  const panelLeague = $event.closest('.panelLeague');
  if (panelLeague.length) {
    const panelType = panelLeague.prevAll('.panelType').first();
    const sport = readSportFromHeading($, panelType.find('h3').first());
    if (sport) return sport;
  }

  let cur = $event.parent();
  for (let i = 0; i < 10 && cur.length; i++) {
    const sport = readSportFromHeading($, cur.prevAll().find('h3').first());
    if (sport) return sport;
    cur = cur.parent();
  }

  return '';
}

/* ============================================================
   HOT EVENTS PARSER
   ============================================================ */

function extractTimeFromHotText(text) {
  const m = String(text).match(/\bfrom\s+(\d{1,2}:\d{2}\s*(?:AM|PM))\b/i);
  return m ? m[1].toUpperCase().replace(/\s+/g, '') : '';
}

/** Tanggal dari teks Hot Events, relatif hari ini di Sydney (FIX-3, FIX-4). */
function resolveBaseDateFromHotText(text) {
  const today = todayInSourceTz();

  if (/^Today\b/i.test(text)) return today;

  if (/^Tomorrow\b/i.test(text)) {
    const d = new Date(today);
    d.setUTCDate(today.getUTCDate() + 1);
    return d;
  }

  const m = String(text).match(
    /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\.?\s+(\d{1,2})\s+([A-Za-z]+)\b/i
  );
  if (m) {
    const dayNum = parseInt(m[2], 10);
    const monthName = m[3].charAt(0).toUpperCase() + m[3].slice(1).toLowerCase();
    const monthIdx = MONTH_MAP[monthName];
    if (monthIdx != null && dayNum >= 1 && dayNum <= 31) {
      return new Date(Date.UTC(resolveYear(monthIdx, dayNum, today), monthIdx, dayNum));
    }
  }

  return today;
}

function buildEventUrl(eventPath) {
  if (!eventPath) return '';
  return `${BASE_URL}/${String(eventPath).replace(/^\/+/, '')}`;
}

function parseHotEvents($) {
  const rows = [];

  // Desktop saja, supaya tidak dobel dengan versi mobile.
  $('.panel-body-desktop .hotEvents .list-group-item').each((idx, el) => {
    const item = $(el);
    const open = item.find('.openUrl').first();
    if (!open.length) return;

    const eventPath = (open.attr('data-link') || '').trim();
    const textDivs = open.find('.eventText > div');
    const line1 = textDivs.first().text().replace(/\s+/g, ' ').trim();
    const line2 = textDivs.eq(1).text().replace(/\s+/g, ' ').trim();

    // line1: "Tomorrow from 2:10AM | Barcelona - Levante"
    const [left, matchRaw] = line1.split('|').map((v) => (v || '').trim());
    const datetimeText = left || '';
    const match = matchRaw || '';

    // line2: "Soccer | La Liga"
    const sport = (line2.split('|')[0] || '').trim();
    const league = (line2.split('|')[1] || '').replace(/\s+/g, ' ').trim();

    const chImg = item.find('.ml-10 img').first();
    const channel = (chImg.attr('title') || chImg.attr('alt') || '')
      .replace(/Live on\s*/i, '').trim();

    const timeSource = extractTimeFromHotText(datetimeText);
    const baseDate = resolveBaseDateFromHotText(datetimeText);

    const timeWita = timeSource ? convertSourceTimeToWita(timeSource, baseDate) : '';
    const witaDate = timeSource
      ? getWitaDateFromBase(baseDate, timeSource)
      : { hariWita: fmtHari(baseDate), tanggalWita: fmtTanggal(baseDate) };

    const sepIdx = match.indexOf(' - ');
    const home = sepIdx >= 0 ? match.slice(0, sepIdx).trim() : match.trim();
    const away = sepIdx >= 0 ? match.slice(sepIdx + 3).trim() : '';

    rows.push({
      day: 'hot',
      hari: fmtHari(baseDate),
      tanggal: fmtTanggal(baseDate),
      time_aedt: timeSource,
      time_wita: timeWita,
      hari_wita: witaDate.hariWita,
      tanggal_wita: witaDate.tanggalWita,
      sport,
      competition: league || 'Hot Events',
      home,
      away,
      title: league ? `${sport} | ${league}` : sport,
      channels: channel,
      event_url: buildEventUrl(eventPath)
    });
  });

  return rows;
}

/* ============================================================
   DEDUPE (FIX-7)
   ============================================================ */

/**
 * Kunci dedupe TIDAK memakai channel. Event yang sama muncul di Hot Events
 * dan di listing reguler dengan format channel berbeda ("Fox Sports 501"
 * vs "Fox Sports 501 | Kayo"), sehingga versi lama tidak pernah
 * mendeteksinya sebagai duplikat. Channel digabung, bukan dipakai memisah.
 */
function dedupeRows(rows) {
  const byKey = new Map();

  for (const r of rows) {
    const key = [r.tanggal_wita, r.time_wita, r.sport, r.competition, r.home, r.away]
      .join('|')
      .toLowerCase();

    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...r });
      continue;
    }

    // Gabungkan channel dari kedua sumber, buang duplikat.
    const merged = new Set(
      [...splitChannels(existing.channels), ...splitChannels(r.channels)]
    );
    existing.channels = [...merged].join(' | ');

    // Isi field yang kosong dari duplikatnya.
    for (const k of ['title', 'event_url', 'sport', 'competition']) {
      if (!existing[k] && r[k]) existing[k] = r[k];
    }
  }

  return [...byKey.values()];
}

function splitChannels(s) {
  return String(s || '')
    .split('|')
    .map((v) => v.trim())
    .filter(Boolean);
}

/* ============================================================
   SCRAPER PER HARI
   ============================================================ */

async function scrapeDay(pathSuffix) {
  const url = `${BASE_URL}${GUIDE_PATH}/${pathSuffix}`;
  console.log('Scraping:', url);

  const html = await fetchHtml(url);
  const $ = cheerio.load(html);
  const dateInfo = resolveDateForPage($, pathSuffix);

  const rows = [];
  let currentCompetition = '';

  $('h3, .leagueTitle, div.list-group-item.d-flex.gap-3.shadow-sm').each((idx, el) => {
    const $el = $(el);

    if ($el.hasClass('leagueTitle')) {
      currentCompetition = $el.find('span.align-middle').first().text().trim();
      return;
    }

    if (!$el.hasClass('list-group-item')) return;

    const timeSource = $el.find('.eventTime').first().text().trim();
    if (!timeSource) return;

    const eventText = $el.find('.eventText').first();

    const teamDivs = eventText.children('div').filter((i, e) => {
      const cls = $(e).attr('class') || '';
      return !cls.includes('gameSpacer') && !cls.includes('fs-10');
    });

    const home = (teamDivs.eq(0).text() || '').replace(/\s+/g, ' ').trim();
    const away = (teamDivs.eq(1).text() || '').replace(/\s+/g, ' ').trim();

    const title = eventText.find('div.fs-10 i').first()
      .text().replace(/\s+/g, ' ').trim();

    const channels = [];
    $el.find('div.text-end img.stationImg').each((i, img) => {
      const t = ($(img).attr('title') || $(img).attr('alt') || '')
        .replace(/Live on\s*/i, '').trim();
      if (t) channels.push(t);
    });

    const witaDate = getWitaDateFromBase(dateInfo.baseDate, timeSource);

    rows.push({
      day: pathSuffix,
      hari: dateInfo.hariIndo,
      tanggal: dateInfo.tanggalFormatted,
      time_aedt: timeSource,
      time_wita: convertSourceTimeToWita(timeSource, dateInfo.baseDate),
      hari_wita: witaDate.hariWita,
      tanggal_wita: witaDate.tanggalWita,
      sport: findSportForEvent($, $el),
      competition: currentCompetition,
      home,
      away,
      title,
      channels: channels.join(' | '),
      event_url: ''
    });
  });

  const hotRows = parseHotEvents($);
  if (hotRows.length) {
    console.log(`  HotEvents: ${hotRows.length}`);
    rows.push(...hotRows);
  }

  console.log(`  Rows for ${pathSuffix}: ${rows.length}`);
  return rows;
}

/* ============================================================
   OUTPUT
   ============================================================ */

function toCsv(rows) {
  const esc = (v) => `"${(v ?? '').toString().replace(/"/g, '""')}"`;
  const lines = [CSV_COLUMNS.join(',')];
  for (const r of rows) {
    lines.push(CSV_COLUMNS.map((c) => esc(r[c])).join(','));
  }
  return lines.join('\n') + '\n';
}

async function sendToSheets(webappUrl, rows) {
  if (!webappUrl) {
    console.log('WEBAPP_URL not set — skipping Google Sheets sync');
    return;
  }
  try {
    const res = await axios.post(webappUrl, rows, {
      headers: { 'Content-Type': 'application/json' },
      timeout: HTTP_TIMEOUT_MS
    });
    console.log('Sheets status:', res.status);
    console.log('Sheets response:', res.data);
  } catch (e) {
    // Tidak menggagalkan job: CSV sudah tertulis dan dashboard masih perlu diisi.
    console.error('Failed sending to Google Sheets:', e.response?.data || e.message);
  }
}

async function sendToDashboard(url, token, rows) {
  const res = await axios.post(url, { events: rows }, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    timeout: HTTP_TIMEOUT_MS
  });
  console.log('Dashboard ingest status:', res.status);
  console.log('Dashboard ingest response:', res.data);
}

/* ============================================================
   MAIN
   ============================================================ */

async function main() {
  const cfg = readConfig();

  console.log(`Source TZ: ${SOURCE_TZ}  ->  Target TZ: ${TARGET_TZ}`);
  console.log(`Today in ${SOURCE_TZ}: ${fmtTanggal(todayInSourceTz())}`);
  console.log(`Current source offset: UTC${
    tzOffsetMinutes(Date.now(), SOURCE_TZ) >= 0 ? '+' : ''
  }${tzOffsetMinutes(Date.now(), SOURCE_TZ) / 60}`);
  console.log('');

  let allRows = [];
  const failedDays = [];

  for (const day of DAY_ORDER) {
    try {
      allRows = allRows.concat(await scrapeDay(day));
    } catch (e) {
      console.error(`Skipping day ${day}:`, e.message);
      failedDays.push(day);
    }
  }

  const before = allRows.length;
  allRows = dedupeRows(allRows);
  console.log(`\nTOTAL rows: ${before} scraped -> ${allRows.length} after dedupe`);

  if (failedDays.length) {
    console.warn(`Days that failed: ${failedDays.join(', ')}`);
  }

  // Guard: jangan tulis CSV atau kirim data kalau hasilnya mencurigakan sedikit.
  if (allRows.length < cfg.minimumRows) {
    throw new Error(
      `Safety guard blocked production sync: received ${allRows.length} row(s), ` +
      `minimum is ${cfg.minimumRows}.`
    );
  }

  // Guard: lebih dari separuh hari gagal berarti situs atau selector berubah.
  if (failedDays.length > DAY_ORDER.length / 2) {
    throw new Error(
      `Safety guard blocked production sync: ${failedDays.length}/${DAY_ORDER.length} ` +
      `days failed to scrape.`
    );
  }

  const csvPath = `${process.cwd()}/results.csv`;
  fs.writeFileSync(csvPath, toCsv(allRows));
  console.log('CSV written:', csvPath);

  await sendToSheets(cfg.webappUrl, allRows);
  await sendToDashboard(cfg.dashboardUrl, cfg.dashboardToken, allRows);

  console.log('\nDone.');
}

/* ============================================================
   EXPORTS untuk pengujian
   ============================================================ */

if (require.main === module) {
  main().catch((e) => {                                    // FIX-8
    console.error('\nFATAL:', e.message);
    if (e.stack) console.error(e.stack);
    process.exit(1);
  });
} else {
  module.exports = {
    tzOffsetMinutes,
    partsInTz,
    sourceLocalToUtc,
    todayInSourceTz,
    parseAmPm,
    convertSourceTimeToWita,
    getWitaDateFromBase,
    resolveYear,
    fmtHari,
    fmtTanggal,
    dedupeRows,
    splitChannels,
    extractTimeFromHotText,
    resolveBaseDateFromHotText,
    buildEventUrl,
    toCsv,
    CSV_COLUMNS,
    SOURCE_TZ,
    TARGET_TZ
  };
}
