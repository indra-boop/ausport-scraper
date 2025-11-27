const axios = require('axios');
const cheerio = require('cheerio');

const WEBAPP_URL = process.env.WEBAPP_URL; // dari GitHub Secrets

async function scrapeDay(pathSuffix) {
  const url = `https://ausportguide.com/live-sports-tv-guide/${pathSuffix}`;
  const res = await axios.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      'Accept-Language': 'en-US,en;q=0.9'
    }
  });

  const $ = cheerio.load(res.data);
  const rows = [];

  $('.list-group-item').each((_, el) => {
    const row = $(el);
    const dateText = row.find('.listData h2.dayInfo').text().trim(); // atau selector yg kemarin udah kamu pakai
    const timeText = row.find('.eventTime').text().trim();
    const sport = row.closest('.sport-block').find('.sportTitle').first().text().trim() || '';
    const eventTitle = row.find('.eventTitle').text().trim();
    const channel = row.find('[title^="Live on"]').map((i, c) => $(c).attr('title').replace('Live on ', '').trim()).get().join(' / ');

    if (!eventTitle) return;

    rows.push([
      dateText,     // A: Date
      timeText,     // B: Time AEDT
      sport,        // C: Sport Category
      eventTitle,   // D: Live Event
      channel       // E: Channel
    ]);
  });

  return rows;
}

async function main() {
  // contoh: hari tertentu, misal /fri, /sat; atau "" untuk default hari ini
  const rows = await scrapeDay('fri'); // nanti bisa kamu bikin loop semua hari kalau mau

  console.log('Total rows:', rows.length);

  if (!process.env.WEBAPP_URL) {
  console.log('WEBAPP_URL not set, skip update Google Sheet');
  process.exit(0); // jangan dianggap error
}

  // kirim ke Google Apps Script
  const payload = { rows };
  await axios.post(WEBAPP_URL, payload, {
    headers: { 'Content-Type': 'application/json' }
  });

  console.log('Data sent to Google Sheet');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
