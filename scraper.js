const axios = require('axios');
const cheerio = require('cheerio');

const SPORTS = [
  'Soccer', 'Cricket', 'Basketball', 'AFL', 'Rugby League', 'Rugby Union',
  'Motorsport', 'Tennis', 'Golf', 'Box and MMA', 'Snooker',
  'Cycling', 'American Football', 'Netball', 'Baseball'
];

async function scrapeDay(pathSuffix) {
  const url = `https://ausportguide.com/live-sports-tv-guide/${pathSuffix}`;
  console.log('Scraping:', url);

  const res = await axios.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });

  const $ = cheerio.load(res.data);

  // ambil text utama; kalau ga ada <article>, fallback ke <body>
  const article = $('article').first();
  const text = (article.length ? article.text() : $('body').text())
    .split('\n')
    .map((t) => t.trim())
    .filter(Boolean);

  const rows = [];
  let currentSport = null;
  let currentCompetition = null;

  const timeRegex = /^\d{1,2}:\d{2}(AM|PM)$/i;

  for (let i = 0; i < text.length; i++) {
    const line = text[i];

    // detect heading sport
    if (SPORTS.includes(line)) {
      currentSport = line;
      continue;
    }

    // competition biasanya diikuti langsung oleh jam
    if (!timeRegex.test(line) && timeRegex.test(text[i + 1] || '')) {
      currentCompetition = line;
      continue;
    }

    // baris waktu = mulai 1 event
    if (timeRegex.test(line)) {
      const time = line;
      const home = text[i + 1] || '';
      const away = text[i + 2] || '';
      const title = text[i + 3] || '';

      // kumpulin semua baris channel "Live on ..."
      let channels = [];
      let j = i + 4;
      while (j < text.length && /Live on/i.test(text[j])) {
        channels.push(text[j]);
        j++;
      }

      rows.push({
        day: pathSuffix,                // mon/tue/... (nanti bisa di-map ke tanggal)
        sport: currentSport || '',
        competition: currentCompetition || '',
        time,
        home,
        away,
        title,
        channels: channels.join(' | '),
        sourceUrl: url,
      });

      // lompat ke setelah baris channel
      i = j - 1;
    }
  }

  console.log(`Rows for ${pathSuffix}:`, rows.length);
  return rows;
}

module.exports = { scrapeDay };
