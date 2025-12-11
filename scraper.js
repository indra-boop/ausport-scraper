const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

const WEBAPP_URL = process.env.WEBAPP_URL;

const SPORTS = [
  'Soccer', 'Cricket', 'Basketball', 'AFL',
  'Rugby League', 'Rugby Union', 'Motorsport',
  'Tennis', 'Golf', 'Box and MMA', 'Snooker',
  'Cycling', 'American Football', 'Netball', 'Baseball'
];

// Map hari untuk pathSuffix → index JS getDay()
const DAY_MAP = {
  sun: 0, // Minggu
  mon: 1, // Senin
  tue: 2, // Selasa
  wed: 3, // Rabu
  thu: 4, // Kamis
  fri: 5, // Jumat
  sat: 6  // Sabtu
};

// Format hari & tanggal untuk masing-masing pathSuffix (mon, tue, dst)
// Ini dianggap sebagai "tanggal Australia" (sesuai minggu berjalan)
function formatDateForDay(pathSuffix) {
  const now = new Date();
  const currentDay = now.getDay(); // 0 = Minggu, 1 = Senin, dst.
  const targetDay = DAY_MAP[pathSuffix];

  const diff = targetDay - currentDay;
  const targetDate = new Date(now);
  targetDate.setDate(now.getDate() + diff);

  const hariIndo = targetDate.toLocaleDateString('id-ID', { weekday: 'long' });
  const tanggalFormatted = targetDate.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit'
  });

  return { hariIndo, tanggalFormatted, targetDate };
}

// Convert time dari AEDT (UTC+11) ke WITA (UTC+8) → minus 3 jam (hanya jam, tanpa sentuh tanggal)
function convertAedtToWita(timeStr) {
  const m = timeStr.match(/^(\d{1,2}):(\d{2})(AM|PM)$/i);
  if (!m) return timeStr; // kalau format tidak cocok, balikin apa adanya

  let [, hStr, minStr, ampm] = m;
  let h = parseInt(hStr, 10);
  const minutes = parseInt(minStr, 10);

  // Konversi ke 24 jam
  if (/PM/i.test(ampm) && h !== 12) h += 12;
  if (/AM/i.test(ampm) && h === 12) h = 0;

  // AEDT -> WITA (minus 3 jam)
  h -= 3;
  if (h < 0) h += 24;

  // Kembali ke 12 jam
  const outAmpm = h >= 12 ? 'PM' : 'AM';
  let displayH = h % 12;
  if (displayH === 0) displayH = 12;

  const hh = displayH.toString();
  const mm = minutes.toString().padStart(2, '0');

  return `${hh}:${mm}${outAmpm}`;
}

// Hitung tanggal & hari versi WITA, berdasarkan tanggal Australia + time AEDT
function getWitaDate(pathSuffix, timeStr) {
  const { targetDate } = formatDateForDay(pathSuffix); // tanggal Australia utk hari tsb
  const baseDate = new Date(targetDate); // clone

  const match = timeStr.match(/^(\d{1,2}):(\d{2})(AM|PM)$/i);
  if (!match) {
    // fallback: kalau format jam aneh, pakai saja tanggal Australia
    const hariWita = baseDate.toLocaleDateString('id-ID', { weekday: 'long' });
    const tanggalWita = baseDate.toLocaleDateString('id-ID', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit'
    });
    return { hariWita, tanggalWita };
  }

  let [, hStr, minStr, ampm] = match;
  let hour = parseInt(hStr, 10);
  const minutes = parseInt(minStr, 10);

  // 12h → 24h (AEDT)
  if (/PM/i.test(ampm) && hour !== 12) hour += 12;
  if (/AM/i.test(ampm) && hour === 12) hour = 0;

  // set jam AEDT di baseDate
  baseDate.setHours(hour);
  baseDate.setMinutes(minutes);
  baseDate.setSeconds(0);
  baseDate.setMilliseconds(0);

  // AEDT (UTC+11) → WITA (UTC+8): minus 3 jam
  baseDate.setHours(baseDate.getHours() - 3);

  const hariWita = baseDate.toLocaleDateString('id-ID', { weekday: 'long' });
  const tanggalWita = baseDate.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit'
  });

  return { hariWita, tanggalWita };
}

async function scrapeDay(pathSuffix) {
  const url = `https://ausportguide.com/live-sports-tv-guide/${pathSuffix}`;
  console.log('Scraping:', url);

  let res;
  try {
    res = await axios.get(url, {
      headers: {
        // spoof full browser UA biar ga gampang di-block CI
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
    // lempar lagi supaya caller bisa decide skip/stop
    throw err;
  }

  const $ = cheerio.load(res.data);

  const article = $('article').first();
  const lines = (article.length ? article.text() : $('body').text())
    .split('\n')
    .map(t => t.trim())
    .filter(Boolean);

  const rows = [];
  let currentSport = '';
  let currentCompetition = '';

  const timeRegex = /^\d{1,2}:\d{2}(AM|PM)$/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // detect sport section
    if (SPORTS.includes(line)) {
      currentSport = line;
      continue;
    }

    // detect competition (sebelum time)
    if (!timeRegex.test(line) && timeRegex.test(lines[i + 1] || '')) {
      currentCompetition = line;
      continue;
    }

    // detect event start (time)
    if (timeRegex.test(line)) {
      const time = line; // jam AEDT dari website
      const home = lines[i + 1] || '';
      const away = lines[i + 2] || '';
      const title = lines[i + 3] || '';

      // collect channels
      let channels = [];
      let j = i + 4;
      while (j < lines.length && /Live on/i.test(lines[j])) {
        channels.push(lines[j]);
        j++;
      }

      const dateInfo = formatDateForDay(pathSuffix); // hari/tanggal versi Australia
      const timeWita = convertAedtToWita(time);
      const witaDate = getWitaDate(pathSuffix, time); // hari/tanggal versi WITA

      rows.push({
        // info path
        day: pathSuffix,

        // tanggal Australia (sesuai path 'mon', dst)
        hari: dateInfo.hariIndo,
        tanggal: dateInfo.tanggalFormatted,

        // jam asli & jam WITA
        time_aedt: time,
        time_wita: timeWita,

        // tanggal & hari WITA setelah konversi time
        hari_wita: witaDate.hariWita,
        tanggal_wita: witaDate.tanggalWita,

        // konten sports
        sport: currentSport,
        competition: currentCompetition,
        home,
        away,
        title,
        channels: channels.join(' | '),
        sourceUrl: url
      });

      i = j - 1; // skip lines we already consumed
    }
  }

  console.log(`Rows for ${pathSuffix}:`, rows.length);
  return rows;
}

// MAIN EXECUTION
(async () => {
  const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
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

  // Write CSV
  let csv =
    'day,hari,tanggal,time_aedt,time_wita,hari_wita,tanggal_wita,sport,competition,home,away,title,channels,sourceUrl\n';

  for (const r of allRows) {
    csv += `"${r.day}","${r.hari}","${r.tanggal}","${r.time_aedt}","${r.time_wita}","${r.hari_wita}","${r.tanggal_wita}","${r.sport}","${r.competition}","${r.home}","${r.away}","${r.title.replace(/"/g, '""')}","${r.channels.replace(/"/g, '""')}","${r.sourceUrl}"\n`;
  }

  const path = `${process.cwd()}/results.csv`;
  fs.writeFileSync(path, csv);
  console.log('CSV written:', path);

  // Send to Google Sheets (optional)
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
