const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

const WEBAPP_URL = process.env.WEBAPP_URL || '';

// 7 hari: senin–minggu
const DAY_SUFFIXES = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

async function scrapeDay(pathSuffix) {
  const url = `https://ausportguide.com/live-sports-tv-guide/${pathSuffix}`;
  console.log(`Scraping: ${url}`);

  const res = await axios.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      'Accept-Language': 'en-US,en;q=0.9'
    }
  });

  const $ = cheerio.load(res.data);
  const dayRows = [];

  $('.list-group-item').each((_, el) => {
    const row = $(el);

    const dateText = row.find('.listData h2.dayInfo').text().trim();
    const timeText = row.find('.eventTime').text().trim();
    const sport = row.closest('.sport-block').find('.sportTitle').first().text().trim() || '';
    const eventTitle = row.find('.eventTitle').text().trim();
    const channel = row
      .find('[title^="Live on"]')
      .map((i, c) => $(c).attr('title').replace('Live on ', '').trim())
      .get()
      .join(' / ');

    // kalau ga ada judul event, skip
    if (!eventTitle) return;

    dayRows.push([
      dateText,   // A: Date
      timeText,   // B: Time AEDT
      sport,      // C: Sport Category
      eventTitle, // D: Live Event
      channel     // E: Channel
    ]);
  });

  console.log(`  Rows for ${pathSuffix}: ${dayRows.length}`);
  return dayRows;
}

async function main() {
  let allRows = [];

  // loop 7 hari
  for (const suffix of DAY_SUFFIXES) {
    try {
      const rows = await scrapeDay(suffix);
      allRows = allRows.concat(rows);
    } catch (err) {
      console.error(`Error scraping ${suffix}:`, err.message || err);
    }
  }

  console.log('Total rows (7 days):', allRows.length);

  if (!allRows.length) {
    console.log('No rows scraped. Exiting gracefully.');
    return;
  }

  // ====== KIRIM KE GOOGLE SHEET (kalau WEBAPP_URL di-set) ======
  if (WEBAPP_URL) {
    try {
      await axios.post(WEBAPP_URL, { rows: allRows }, {
        headers: { 'Content-Type': 'application/json' }
      });
      console.log('Data sent to Google Sheet');
    } catch (err) {
      console.error('Failed to POST to WEBAPP_URL:', err.message || err);
    }
  } else {
    console.log('WEBAPP_URL not set, skip update Google Sheet');
  }

  // ====== TULIS CSV ======
  const header = ['Date', 'Time AEDT', 'Sport', 'Event', 'Channel'];

  const csvLines = [
    header.join(','),
    ...allRows.map(row =>
      row
        .map(val => {
          const s = (val ?? '').toString().replace(/"/g, '""');
          return /[",\n]/.test(s) ? `"${s}"` : s;
        })
        .join(',')
    )
  ];

  fs.writeFileSync('live_sports.csv', csvLines.join('\n'), 'utf8');
  console.log('CSV written, rows:', allRows.length);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
