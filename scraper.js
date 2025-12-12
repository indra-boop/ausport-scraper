const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

const WEBAPP_URL = process.env.WEBAPP_URL;

const DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

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

// fallback kalau header tanggal gagal
function fallbackDateForDay(pathSuffix) {
  const DAY_MAP = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
  const now = new Date();
  const currentDay = now.getDay();
  const targetDay = DAY_MAP[pathSuffix];

  const diff = targetDay - currentDay;
  const baseDate = new Date(now);
  baseDate.setDate(now.getDate() + diff);

  const hariIndo = baseDate.toLocaleDateString('id-ID', { weekday: 'long' });
  const tanggalFormatted = baseDate.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit'
  });

  return { baseDate, hariIndo, tanggalFormatted };
}

// Ambil tanggal dari <h2 class="dayInfo">Friday, 12. Dec | ...</h2>
function resolveDateForPage($, pathSuffix) {
  const headerText = $('h2.dayInfo').first().text().trim();
  console.log('DAY HEADER:', headerText || '(empty)');

  if (headerText) {
    const m = headerText.match(
      /(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+(\d{1,2})\.\s+([A-Za-z]+)/i
    );
    if (m) {
      const [, , dayStr, monthRaw] = m;
      const dayNum = parseInt(dayStr, 10);
      const monthName =
        monthRaw.charAt(0).toUpperCase() + monthRaw.slice(1).toLowerCase();
      const monthIdx = MONTH_MAP[monthName];

      if (!Number.isNaN(dayNum) && monthIdx != null) {
        const now = new Date();
        const year = now.getFullYear();
        const baseDate = new Date(year, monthIdx, dayNum);

        const hariIndo = baseDate.toLocaleDateString('id-ID', {
          weekday: 'long'
        });
        const tanggalFormatted = baseDate.toLocaleDateString('id-ID', {
          day: '2-digit',
          month: '2-digit',
          year: '2-digit'
        });

        return { baseDate, hariIndo, tanggalFormatted };
      }
    }
  }

  console.warn('Header date not parsed, using fallback for', pathSuffix);
  return fallbackDateForDay(pathSuffix);
}

// Convert AEDT → WITA (−3 jam)
function convertAedtToWita(timeStr) {
  const m = timeStr.match(/^(\d{1,2}):(\d{2})(AM|PM)$/i);
  if (!m) return timeStr;

  let [, hStr, minStr, ampm] = m;
  let h = parseInt(hStr, 10);
  const minutes = parseInt(minStr, 10);

  if (/PM/i.test(ampm) && h !== 12) h += 12;
  if (/AM/i.test(ampm) && h === 12) h = 0;

  h -= 3;
  if (h < 0) h += 24;

  const outAmpm = h >= 12 ? 'PM' : 'AM';
  let displayH = h % 12;
  if (displayH === 0) displayH = 12;

  const hh = displayH.toString();
  const mm = minutes.toString().padStart(2, '0');

  return `${hh}:${mm}${outAmpm}`;
}

// Hitung hari/tanggal WITA dari baseDate Australia + time AEDT
function getWitaDateFromBase(baseDate, timeStr) {
  const d = new Date(baseDate);

  const match = timeStr.match(/^(\d{1,2}):(\d{2})(AM|PM)$/i);
  if (!match) {
    const hariWita = d.toLocaleDateString('id-ID', { weekday: 'long' });
    const tanggalWita = d.toLocaleDateString('id-ID', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit'
    });
    return { hariWita, tanggalWita };
  }

  let [, hStr, minStr, ampm] = match;
  let hour = parseInt(hStr, 10);
  const minutes = parseInt(minStr, 10);

  if (/PM/i.test(ampm) && hour !== 12) hour += 12;
  if (/AM/i.test(ampm) && hour === 12) hour = 0;

  d.setHours(hour);
  d.setMinutes(minutes);
  d.setSeconds(0);
  d.setMilliseconds(0);

  d.setHours(d.getHours() - 3); // AEDT → WITA

  const hariWita = d.toLocaleDateString('id-ID', { weekday: 'long' });
  const tanggalWita = d.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit'
  });

  return { hariWita, tanggalWita };
}

// Hitung hari/tanggal WITA dari baseDate Australia + time AEDT
function getWitaDateFromBase(baseDate, timeStr) {
  const d = new Date(baseDate);

  const match = timeStr.match(/^(\d{1,2}):(\d{2})(AM|PM)$/i);
  if (!match) {
    const hariWita = d.toLocaleDateString('id-ID', { weekday: 'long' });
    const tanggalWita = d.toLocaleDateString('id-ID', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit'
    });
    return { hariWita, tanggalWita };
  }

  let [, hStr, minStr, ampm] = match;
  let hour = parseInt(hStr, 10);
  const minutes = parseInt(minStr, 10);

  if (/PM/i.test(ampm) && hour !== 12) hour += 12;
  if (/AM/i.test(ampm) && hour === 12) hour = 0;

  d.setHours(hour);
  d.setMinutes(minutes);
  d.setSeconds(0);
  d.setMilliseconds(0);

  d.setHours(d.getHours() - 3); // AEDT → WITA

  const hariWita = d.toLocaleDateString('id-ID', { weekday: 'long' });
  const tanggalWita = d.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit'
  });

  return { hariWita, tanggalWita };
}

// Cari SPORT untuk 1 event
function findSportForEvent($, eventDiv) {
  const $event = $(eventDiv);

  // 1) Pola utama: event ada di dalam .panelLeague
  const panelLeague = $event.closest('.panelLeague');
  if (panelLeague.length) {
    // .panelType (yang punya <h3>) ada tepat sebelum .panelLeague
    const panelType = panelLeague.prevAll('.panelType').first();
    if (panelType.length) {
      const h3 = panelType.find('h3').first();
      if (h3.length) {
        const img = h3.find('img').first();
        const span = h3.find('span.align-middle').first();

        const sport =
          (img.attr('title') || img.attr('alt') || '').trim() ||
          span.text().trim() ||
          h3.text().trim();

        if (sport) return sport;
      }
    }
  }

  // 2) Fallback: naik parent, cari h3 di sibling sebelumnya (lebih longgar)
  let cur = $event.parent();
  for (let i = 0; i < 10 && cur.length; i++) {
    const h3 = cur.prevAll().find('h3').first();
    if (h3.length) {
      const img = h3.find('img').first();
      const span = h3.find('span.align-middle').first();

      const sport =
        (img.attr('title') || img.attr('alt') || '').trim() ||
        span.text().trim() ||
        h3.text().trim();

      if (sport) return sport;
    }
    cur = cur.parent();
  }

  return '';
}


// ----------------------
// Scraper per hari
// ----------------------
async function scrapeDay(pathSuffix) {
  const url = `https://ausportguide.com/live-sports-tv-guide/${pathSuffix}`;
  console.log('Scraping:', url);

  let res;
  try {
    res = await axios.get(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      timeout: 30000,
      maxRedirects: 5,
      validateStatus: status => status >= 200 && status < 400
    });
  } catch (err) {
    console.error(`HTTP request failed for ${url}:`, err.message);
    throw err;
  }

  const $ = cheerio.load(res.data);
  const dateInfo = resolveDateForPage($, pathSuffix);

  const rows = [];
  let currentCompetition = '';

  // Jalan urut: h3 / leagueTitle / list-group-item
  $('h3, .leagueTitle, div.list-group-item.d-flex.gap-3.shadow-sm').each(
    (idx, el) => {
      const $el = $(el);

      // 1) Update competition dari .leagueTitle
      if ($el.hasClass('leagueTitle')) {
        currentCompetition = $el
          .find('span.align-middle')
          .first()
          .text()
          .trim();
        return;
      }

      // 2) Event
      if ($el.hasClass('list-group-item')) {
        const eventDiv = $el;

        // time AEDT
        const timeAedt = eventDiv.find('.eventTime').first().text().trim();
        if (!timeAedt) return;

        // text utama (home, away, title)
        const eventText = eventDiv.find('.eventText').first();

        // ambil dua div tim (skip spacer & fs-10)
        const teamDivs = eventText
          .children('div')
          .filter((i, e) => {
            const cls = $(e).attr('class') || '';
            return !cls.includes('gameSpacer') && !cls.includes('fs-10');
          });

        const home = (teamDivs.eq(0).text() || '')
          .replace(/\s+/g, ' ')
          .trim();
        const away = (teamDivs.eq(1).text() || '')
          .replace(/\s+/g, ' ')
          .trim();

        // title = baris kecil miring di bawah tim
        const title = eventText
          .find('div.fs-10 i')
          .first()
          .text()
          .replace(/\s+/g, ' ')
          .trim();

        // channels: semua img.stationImg di text-end
        const channels = [];
        eventDiv.find('div.text-end img.stationImg').each((i, img) => {
          let t = $(img).attr('title') || $(img).attr('alt') || '';
          t = t.replace(/Live on\s*/i, '').trim();
          if (t) channels.push(t);
        });

        // SPORT dari <h3> terdekat
        const sport = findSportForEvent($, eventDiv);

        const timeWita = convertAedtToWita(timeAedt);
        const witaDate = getWitaDateFromBase(dateInfo.baseDate, timeAedt);

        rows.push({
          day: pathSuffix,
          hari: dateInfo.hariIndo,
          tanggal: dateInfo.tanggalFormatted,
          time_aedt: timeAedt,
          time_wita: timeWita,
          hari_wita: witaDate.hariWita,
          tanggal_wita: witaDate.tanggalWita,
          sport,
          competition: currentCompetition,
          home,
          away,
          title,
          channels: channels.join(' | '),
          sourceUrl: url
        });
      }
    }
  );

  console.log(`Rows for ${pathSuffix}:`, rows.length);
  return rows;
}

// ----------------------
// MAIN
// ----------------------
(async () => {
  const days = DAY_ORDER;
  let allRows = [];

  for (const d of days) {
    try {
      const rows = await scrapeDay(d);
      allRows = allRows.concat(rows);
    } catch (e) {
      console.error(`Skipping day ${d} due to error:`, e.message);
    }
  }

  console.log('TOTAL rows:', allRows.length);
  if (allRows.length === 0) {
    console.warn('Warning: no rows scraped. Check source site layout / blocking.');
  }

  let csv =
    'day,hari,tanggal,time_aedt,time_wita,hari_wita,tanggal_wita,sport,competition,home,away,title,channels,sourceUrl\n';

  for (const r of allRows) {
    csv += `"${r.day}","${r.hari}","${r.tanggal}","${r.time_aedt}","${r.time_wita}","${r.hari_wita}","${r.tanggal_wita}","${r.sport}","${r.competition}","${r.home}","${r.away}","${r.title.replace(
      /"/g,
      '""'
    )}","${r.channels.replace(/"/g, '""')}","${r.sourceUrl}"\n`;
  }

  const path = `${process.cwd()}/results.csv`;
  fs.writeFileSync(path, csv);
  console.log('CSV written:', path);

  if (!WEBAPP_URL) {
    console.log('WEBAPP_URL not set, skip sending to Google Sheets');
    return;
  }

  try {
    await axios.post(WEBAPP_URL, { data: allRows });
    console.log('Sent to Google Sheets ✓');
  } catch (e) {
    console.error('Failed sending to Google Sheets:', e.message);
  }
})();
