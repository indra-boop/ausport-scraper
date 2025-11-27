#!/usr/bin/env node

const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

const SPORTS = [ /* ... existing sports list ... */ ];

// Format date to dd-mm-yy
function formatDateDDMMYY(d) {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}-${mm}-${yy}`; // dd-mm-yy
}

function getDateForWeekdayAbbrev(abbrev) {
  const map = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
  const target = map[abbrev.toLowerCase()];
  if (target === undefined) return "";
  const today = new Date();
  const todayDay = today.getDay(); // 0..6
  const diff = (target - todayDay + 7) % 7;
  const d = new Date(today);
  d.setDate(today.getDate() + diff);
  return formatDateDDMMYY(d);
}

// Try to parse a date string into a Date object (or null if cannot)
function parseDateStringToDate(str) {
  if (!str || typeof str !== 'string') return null;
  str = str.trim();

  // Numeric formats: dd/mm/yyyy or dd-mm-yyyy or d/m/yy etc
  const numericDMY = str.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/);
  if (numericDMY) {
    let day = parseInt(numericDMY[1], 10);
    let month = parseInt(numericDMY[2], 10) - 1;
    let year = parseInt(numericDMY[3], 10);
    if (year < 100) year += 2000;
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) return d;
  }

  // ISO yyyy-mm-dd or datetime
  const iso = str.match(/\b(\d{4}-\d{2}-\d{2})(?:[T\s]\S*)?\b/);
  if (iso) {
    const d = new Date(iso[1] + 'T00:00:00Z');
    if (!isNaN(d.getTime())) return d;
  }

  // Try Date.parse for human-readable formats (e.g., "Friday 24 November 2025", "24 Nov 2025")
  const parsed = Date.parse(str);
  if (!isNaN(parsed)) {
    return new Date(parsed);
  }

  return null;
}

// Search nearby lines (backwards and forwards) for a date-like string and parse it
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

// Try to extract page-level date from DOM in several common places:
// - <time datetime="...">, <time>text</time>
// - meta[property="article:published_time"] or meta[name*="date"]
// - headings (h1/h2/h3) or elements with class/id containing 'date' or 'day'
function extractDateFromDOM($) {
  // 1) <time datetime=...>
  const timeEl = $('time[datetime]').first();
  if (timeEl && timeEl.attr('datetime')) {
    const dt = parseDateStringToDate(timeEl.attr('datetime'));
    if (dt) return dt;
  }

  // 2) <time>text</time>
  const timeText = $('time').first().text();
  if (timeText) {
    const dt = parseDateStringToDate(timeText);
    if (dt) return dt;
  }

  // 3) meta tags
  const metaProps = [
    'meta[property="article:published_time"]',
    'meta[property="article:published_time"]',
    'meta[name="date"]',
    'meta[name="publication_date"]',
    'meta[name="pubdate"]',
    'meta[itemprop="datePublished"]',
    'meta[property="og:updated_time"]'
  ];
  for (const sel of metaProps) {
    const el = $(sel).first();
    if (el && el.attr('content')) {
      const dt = parseDateStringToDate(el.attr('content'));
      if (dt) return dt;
    }
  }

  // 4) headings h1/h2/h3 (common for pages that show "Friday 24 November 2025")
  const headingSel = $('h1, h2, h3');
  for (let i = 0; i < headingSel.length; i++) {
    const txt = $(headingSel[i]).text();
    const dt = parseDateStringToDate(txt);
    if (dt) return dt;
  }

  // 5) elements with class or id containing 'date', 'day', 'published'
  const candidates = $('[class*="date"], [class*="Date"], [id*="date"], [class*="day"], [id*="day"], [class*="published"], [id*="published"]');
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

  const res = await axios.get(url, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      "Accept-Language": "en-US,en;q=0.9"
    }
  });

  const $ = cheerio.load(res.data);

  // Try page-level date first (applies to all events on page)
  const pageDateObj = extractDateFromDOM($); // may be null

  // Fallback to plain-text line scanning (existing approach) for per-event surrounding date detection
  const article = $("article").first();
  const lines = (article.length ? article.text() : $("body").text())
    .split("\n")
    .map(t => t.trim())
    .filter(Boolean);

  const rows = [];
  let currentSport = "";
  let currentCompetition = "";

  const timeRegex = /^\d{1,2}:\d{2}(AM|PM)$/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect sport section
    if (SPORTS.includes(line)) {
      currentSport = line;
      continue;
    }

    // Detect competition (before time)
    if (!timeRegex.test(line) && timeRegex.test(lines[i + 1] || "")) {
      currentCompetition = line;
      continue;
    }

    // Detect event start (time)
    if (timeRegex.test(line)) {
      const time = line;
      const home = lines[i + 1] || "";
      const away = lines[i + 2] || "";
      const title = lines[i + 3] || "";

      // collect channels
      let channels = [];
      let j = i + 4;
      while (j < lines.length && /Live on/i.test(lines[j])) {
        channels.push(lines[j]);
        j++;
      }

      // 1) Try per-event nearby date in page text
      let dateObj = parseDateFromSurrounding(lines, i);

      // 2) If not found, try page-level DOM date
      if (!dateObj && pageDateObj) dateObj = pageDateObj;

      // 3) Fallback to weekday-based date
      let dateStr = "";
      if (dateObj) {
        dateStr = formatDateDDMMYY(dateObj);
      } else {
        dateStr = getDateForWeekdayAbbrev(pathSuffix) || "";
      }

      rows.push({
        day: pathSuffix,
        date: dateStr, // dd-mm-yy
        sport: currentSport,
        competition: currentCompetition,
        time,
        home,
        away,
        title,
        channels: channels.join(" | "),
        sourceUrl: url,
      });

      i = j - 1; // skip
    }
  }

  console.log(`Rows for ${pathSuffix}:`, rows.length);
  return rows;
}


// MAIN EXECUTION
(async () => {
  const days = ['mon','tue','wed','thu','fri','sat','sun'];
  let allRows = [];

  for (const d of days) {
    const rows = await scrapeDay(d);
    allRows = allRows.concat(rows);
  }

  console.log("TOTAL rows:", allRows.length);

  // Write CSV: day,date,sport,...
  let csv = "day,date,sport,competition,time,home,away,title,channels,sourceUrl\n";
  for (const r of allRows) {
    csv += `"${r.day}","${r.date}","${r.sport}","${r.competition}","${r.time}","${r.home}","${r.away}","${r.title.replace(/"/g,'""')}","${r.channels.replace(/"/g,'""')}","${r.sourceUrl}"\n`;
  }

  const path = `${process.cwd()}/results.csv`;
  fs.writeFileSync(path, csv);
  console.log("CSV written:", path);

  // Send to Google Sheets (optional)
  if (!process.env.WEBAPP_URL) {
    console.log("WEBAPP_URL not set, skip sending to Google Sheets");
    return;
  }

  try {
    await axios.post(process.env.WEBAPP_URL, { data: allRows });
    console.log("Sent to Google Sheets ✓");
  } catch (e) {
    console.error("Failed sending to Google Sheets:", e.message);
  }
})();
