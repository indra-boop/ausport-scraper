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

      rows.push({
        day: pathSuffix,
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

  // Write CSV
  let csv = "day,sport,competition,time,home,away,title,channels,sourceUrl\n";
  for (const r of allRows) {
    csv += `"${r.day}","${r.sport}","${r.competition}","${r.time}","${r.home}","${r.away}","${r.title.replace(/"/g,'""')}","${r.channels.replace(/"/g,'""')}","${r.sourceUrl}"\n`;
  }

  fs.writeFileSync("results.csv", csv);
  console.log("CSV written ✓");

  // Send to Google Sheets (optional)
  if (!WEBAPP_URL) {
    console.log("WEBAPP_URL not set, skip sending to Google Sheets");
    return;
  }

  try {
    await axios.post(WEBAPP_URL, { data: allRows });
    console.log("Sent to Google Sheets ✓");
  } catch (e) {
    console.error("Failed sending to Google Sheets:", e.message);
  }
})();
