const puppeteer = require("puppeteer");
const cheerio = require("cheerio");
const fs = require("fs");

const WEBAPP_URL = process.env.WEBAPP_URL;

async function scrapeDay(day) {
  const url = `https://ausportguide.com/live-sports-tv-guide/${day}`;
  console.log("Scraping:", url);

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/118.0 Safari/537.36"
  );

  // load page
  await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });

  // ambil HTML lengkap
  const html = await page.content();
  await browser.close();

  const $ = cheerio.load(html);
  const rows = [];

  $(".list-group-item").each((_, el) => {
    const row = $(el);

    const dateText = row.find(".dayInfo").text().trim();
    const timeText = row.find(".eventTime").text().trim();
    const sport = row.closest(".sport-block").find(".sportTitle").first().text().trim();
    const eventTitle = row.find(".eventTitle").text().trim();
    const channel = row
      .find('[title^="Live on"]')
      .map((i, c) => $(c).attr("title").replace("Live on ", "").trim())
      .get()
      .join(" / ");

    if (!eventTitle) return;

    rows.push([dateText, timeText, sport, eventTitle, channel]);
  });

  console.log(`Rows for ${day}:`, rows.length);
  return rows;
}

async function main() {
  const days = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  let all = [];

  for (let d of days) {
    try {
      const r = await scrapeDay(d);
      all.push(...r);
    } catch (err) {
      console.log("Error scraping", d, err.message);
    }
  }

  console.log("TOTAL rows:", all.length);

  const header = ["Date", "Time AEDT", "Sport", "Event", "Channel"];
  const csvLines = [header.join(","), ...all.map(r => r.join(","))];

  fs.writeFileSync("live_sports.csv", csvLines.join("\n"));
  console.log("CSV written ✔️");

  if (!WEBAPP_URL) {
    console.log("WEBAPP_URL not set, skip sending to Google Sheets");
    return;
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
