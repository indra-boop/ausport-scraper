#!/usr/bin/env node

const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const https = require('https');

const SPORTS = [ /* ... existing sports list ... */ ];

// Create an https agent that forces IPv4 (family: 4) to avoid IPv6 ENETUNREACH on some runners
const httpsAgent = new https.Agent({ keepAlive: true, family: 4 });

// Default axios config for GET requests
const AXIOS_DEFAULT = {
  httpsAgent,
  timeout: 15000, // 15s timeout
  headers: {
    'User-Agent': 'Mozilla/5.0 (compatible; ausport-scraper/1.0; +https://github.com/indra-boop/ausport-scraper)',
    'Accept-Language': 'en-US,en;q=0.9'
  }
};

// Simple exponential-backoff retry for axios.get
async function axiosGetWithRetry(url, config = {}, retries = 3, backoffMs = 1000) {
  let attempt = 0;
  while (attempt <= retries) {
    try {
      return await axios.get(url, { ...AXIOS_DEFAULT, ...config });
    } catch (err) {
      attempt++;
      const isLast = attempt > retries;
      const code = err.code || '';
      // Retry on common transient errors
      const transient = ['ETIMEDOUT', 'ECONNRESET', 'EAI_AGAIN', 'ENOTFOUND', 'EPIPE', 'ECONNREFUSED'].includes(code) || err.response?.status >= 500;
      console.warn(`Request attempt ${attempt} for ${url} failed: ${code || err.message}`);
      if (isLast || !transient) {
        throw err;
      }
      const wait = backoffMs * Math.pow(2, attempt - 1);
      console.log(`Waiting ${wait}ms before retrying...`);
      await new Promise(r => setTimeout(r, wait));
    }
  }
}

// Date helpers (same as before)
function formatDateDDMMYY(d) {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}-${mm}-${yy}`;
}

function getDateForWeekdayAbbrev(abbrev) {
  const map = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
  const target = map[abbrev.toLowerCase()];
  if (target === undefined) return "";
  const today = new Date();
  const todayDay = today.getDay();
  const diff = (target - todayDay + 7) % 7;
  const d = new Date(today);
  d.setDate(today.getDate() + diff);
  return formatDateDDMMYY(d);
}

function parseDateStringToDate(str) {
  if (!str || typeof str !== 'string') return null;
  str = str.trim();
  const numericDMY = str.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/);
  if (numericDMY) {
    let day = parseInt(numericDMY[1], 10);
    let month = parseInt(numericDMY[2], 10) - 1;
    let year = parseInt(numericDMY[3], 10);
    if (year < 100) year += 2000;
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) return d;
  }
  const iso = str.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (iso) {
    const d = new Date(iso[1] + 'T00:00:00Z');
    if (!isNaN(d.getTime())) return d;
  }
  const parsed = Date.parse(str);
  if (!isNaN(parsed)) return new Date(parsed);
  return null;
}

function parseDateFromSurrounding(lines, index, windowSize = 6) {
  const offsets = [0];
  for (let k = 1; k <= windowSize; k++) {
    offsets.push(k);
    offsets.push(-k);
  }
  for (const off of offsets) {
    const idx = index + off;
    if (idx < 0 || idx >= lines.length) continue;
    const line = lines[idx];
    if (/[\/\-]\d{1,2}[\/\-]\d{2,4}/.test(line) ||
        /\b\d{4}-\d{2}-\d{2}\b/.test(line) ||
        /\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\b/i.test(line) ||
        /\b\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec|January|February|March|April|May|June|July|August|September|October|November|December)\b/i
    ) {
      const numericMatch = line.match(/\b(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})\b/);
      if (numericMatch) {
        const d = parseDateStringToDate(numericMatch[1]);
        if (d) return d;
      }
      const isoMatch = line.match(/\b(\d{4}-\d{2}-\d{2})\b/);
      if (isoMatch) {
        const d = parseDateStringToDate(isoMatch[1]);
        if (d) return d;
      }
      const monthMatch = line.match(/\b(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec|January|February|March|April|May|June|July|August|September|October|November|December)(?:,?\s*\d{4})?)\b/i);
      if (monthMatch) {
        const d = parseDateStringToDate(monthMatch[1]);
        if (d) return d;
      }
      const dayMonthMatch = line.match(/\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)[,]?\s+(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec|January|February|March|April|May|June|July|August|September|October|November|December)(?:,?\s*\d{4})?)/i);
      if (dayMonthMatch) {
        const d = parseDateStringToDate(dayMonthMatch[1]);
        if (d) return d;
      }
      const dWhole = parseDateStringToDate(line);
      if (dWhole) return dWhole;
    }
  }
  return null;
}

function extractDateFromDOM($) {
  const timeEl = $('time[datetime]').first();
  if (timeEl && timeEl.attr('datetime')) {
    const dt = parseDateStringToDate(timeEl.attr('datetime'));
    if (dt) return dt;
  }
  const timeText = $('time').first().text();
  if (timeText) {
    const dt = parseDateStringToDate(timeText);
    if (dt) return dt;
  }
  const metaProps = [
    'meta[property=\"article:published_time\"]',
    'meta[name=\"date\"]',
    'meta[name=\"publication_date\"]',
    'meta[name=\"pubdate\"]',
    'meta[itemprop=\"datePublished\"]',
    'meta[property=\"og:updated_time\"]'
  ];
  for (const sel of metaProps) {
    const el = $(sel).first();
    if (el && el.attr('content')) {
      const dt = parseDateStringToDate(el.attr('content'));
      if (dt) return dt;
    }
  }
  const headingSel = $('h1, h2, h3');
  for (let i = 0; i < headingSel.length; i++) {
    const txt = $(headingSel[i]).text();
    const dt = parseDateStringToDate(txt);
    if (dt) return dt;
  }
  const candidates = $('[class*=\"date\"], [id*=\"date\"], [class*=\"day\"], [id*=\"day\"], [class*=\"published\"], [id*=\"published\"]');
  for (let i = 0; i < candidates.length; i++) {
    const txt = $(candidates[i]).text();
    const dt = parseDateStringToDate(txt);
    if (dt) return dt;
  }
  return null;
}

async function scrapeDay(pathSuffix) {
  const url = `https://ausportguide.com/live-sports-tv-guide/${pathSuffix}`;
  console.log("Scraping:", url);

  // Use axiosGetWithRetry to fetch page (retries + IPv4 agent)
  const res = await axiosGetWithRetry(url, {}, 3, 1000);
  const $ = cheerio.load(res.data);

  const pageDateObj = extractDateFromDOM($);

  const article = $(\"article\").first();
  const lines = (article.length ? article.text() : $(\"body\").text())
    .split(\"\\n\")
    .map(t => t.trim())
    .filter(Boolean);

  const rows = [];
  let currentSport = \"\";
  let currentCompetition = \"\";

  const timeRegex = /^\\d{1,2}:\\d{2}(AM|PM)$/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (SPORTS.includes(line)) {
      currentSport = line;
      continue;
    }
    if (!timeRegex.test(line) && timeRegex.test(lines[i + 1] || \"\")) {
      currentCompetition = line;
      continue;
    }
    if (timeRegex.test(line)) {
      const time = line;
      const home = lines[i + 1] || \"\";
      const away = lines[i + 2] || \"\";
      const title = lines[i + 3] || \"\";
      let channels = [];
      let j = i + 4;
      while (j < lines.length && /Live on/i.test(lines[j])) {
        channels.push(lines[j]);
        j++;
      }
      let dateObj = parseDateFromSurrounding(lines, i);
      if (!dateObj && pageDateObj) dateObj = pageDateObj;
      const dateStr = dateObj ? formatDateDDMMYY(dateObj) : getDateForWeekdayAbbrev(pathSuffix);
      rows.push({
        day: pathSuffix,
        date: dateStr || \"\",
        sport: currentSport,
        competition: currentCompetition,
        time,
        home,
        away,
        title,
        channels: channels.join(\" | \"),
        sourceUrl: url,
      });
      i = j - 1;
    }
  }
  console.log(`Rows for ${pathSuffix}:`, rows.length);
  return rows;
}

(async () => {
  // Catch unhandled rejections to avoid runner failing due to one-off promise rejection
  process.on('unhandledRejection', (err) => {
    console.error('Unhandled rejection:', err && err.stack ? err.stack : err);
  });

  const days = ['mon','tue','wed','thu','fri','sat','sun'];
  let allRows = [];

  for (const d of days) {
    try {
      const rows = await scrapeDay(d);
      allRows = allRows.concat(rows);
    } catch (err) {
      console.error(`Failed to scrape ${d}:`, err && err.message ? err.message : err);
      // continue to next day instead of failing entire process
    }
  }

  console.log(\"TOTAL rows:\", allRows.length);

  let csv = \"day,date,sport,competition,time,home,away,title,channels,sourceUrl\\n\";
  for (const r of allRows) {
    csv += `\"${r.day}\",\"${r.date}\",\"${r.sport}\",\"${r.competition}\",\"${r.time}\",\"${r.home}\",\"${r.away}\",\"${r.title.replace(/\"/g,'\"\"')}\",\"${r.channels.replace(/\"/g,'\"\"')}\",\"${r.sourceUrl}\"\\n`;
  }

  const path = `${process.cwd()}/results.csv`;
  fs.writeFileSync(path, csv);
  console.log(\"CSV written:\", path);

  if (!process.env.WEBAPP_URL) {
    console.log(\"WEBAPP_URL not set, skip sending to Google Sheets\");
    return;
  }
  try {
    await axios.post(process.env.WEBAPP_URL, { data: allRows }, { httpsAgent });
    console.log(\"Sent to Google Sheets ✓\");
  } catch (e) {
    console.error(\"Failed sending to Google Sheets:\", e.message);
  }
})();
