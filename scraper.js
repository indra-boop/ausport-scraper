const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

const WEBAPP_URL = process.env.WEBAPP_URL; // dari GitHub Secrets

async function scrapeDay(pathSuffix) {
  const url = `https://ausportguide.com/live-sports-tv-guide/${pathSuffix}`;
  const res = await axios.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });

  const $ = cheerio.load(res.data);
  const rows = [];

  $('.list-group-item').each((_, el) => {
    const row = $(el);

    const dateText = row.find('.listData h2.dayInfo').text().trim();
    const timeText = row.find('.eventTime').text().trim();

    const sport =
      row.closest('.sport-block').find('.sportTitle').first().text().trim() || '';

    const eventTitle = row.find('.eventTitle').text().trim();

    const channel = row
      .find('[title^="Live on"]')
      .map((i, c) => $(c).attr('title').replace('Live on ', '').trim())
      .get()
      .join(' / ');

    if (!eventTitle) return;

    rows.push([
      dateText,
      timeText,
      sport,
      eventTitle,
      channel,
    ]);
  });

  return rows;
}

async function main() {
  const rows = await scrapeDay('fri'); // sementara hanya Friday

  console.log('Total rows:', rows.length);

  if (!rows || rows.length === 0) {
    console.log('No rows scraped. Exiting gracefully.');
    return;
  }

  const header = ['Date', 'Time AEDT', 'Sport', 'Event', 'Channel'];
  const csvLines = [
    header.join(','),
    ...rows.map(r =>
      r
        .map(v => `"${String(v || '').replace(/"/g, '""')}"`)
        .join(',')
    ),
  ];

  fs.writeFileSync('live_sports.csv', csvLines.join('\n'), 'utf8');
  console.log('CSV written, rows:', rows.length);

  if (!WEBAPP_URL) {
    console.log('WEBAPP_URL not set, skip update Google Sheet');
    return;
  }

  const payload = { rows };
  await axios.post(WEBAPP_URL, payload, {
    headers: { 'Content-Type': 'application/json' },
  });

  console.log('Data sent to Google Sheet');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
