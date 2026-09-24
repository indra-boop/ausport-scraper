function cleanChannelName(name) {
  return String(name || '')
    .replace(/Live on\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function uniqueChannels(names) {
  const seen = new Set();
  const out = [];
  for (const raw of names) {
    const name = cleanChannelName(raw);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

function extractStationImgChannels($, $el) {
  const found = [];
  $el.find('img.stationImg').each((i, img) => {
    const t = cleanChannelName($(img).attr('title') || $(img).attr('alt') || '');
    if (t) found.push(t);
  });
  return found;
}

/**
 * Parse channel list dari description kalender:
 * "Teams League <br>Channel 9 Sydney, Channel 9 Melbourne, Fox League"
 */
function extractDescriptionChannels(scriptHtml) {
  if (!scriptHtml) return [];
  const m = String(scriptHtml).match(/description\s*:\s*["']([^"']*)["']/i);
  if (!m) return [];
  const desc = m[1].replace(/\\n/g, ' ').replace(/\s+/g, ' ');
  const parts = desc.split(/<br\s*\/?\s*>/i);
  if (parts.length < 2) return [];
  return uniqueChannels(
    parts[parts.length - 1]
      .split(',')
      .map((s) => cleanChannelName(s))
      .filter(Boolean)
  );
}

function mergeEventChannels($, $el, extraImgSelector) {
  const fromImgs = extractStationImgChannels($, $el);
  if (extraImgSelector) {
    $el.find(extraImgSelector).each((i, img) => {
      const t = cleanChannelName($(img).attr('title') || $(img).attr('alt') || '');
      if (t) fromImgs.push(t);
    });
  }
  const scriptHtml = $el.find('script').first().html() || '';
  const fromDesc = extractDescriptionChannels(scriptHtml);
  return uniqueChannels([...fromImgs, ...fromDesc]);
}

function collapseRepeatedText(text) {
  const s = String(text || '').trim();
  if (s.length < 40) return s;
  const half = Math.floor(s.length / 2);
  const a = s.slice(0, half).trim();
  const b = s.slice(half).trim();
  if (a && a === b) return a;
  const mid = Math.floor(s.length / 2);
  for (let len = mid; len >= 40; len--) {
    if (s.length < len * 2) continue;
    const left = s.slice(0, len).trim();
    const right = s.slice(len).trim();
    if (left && left === right) return left;
  }
  return s;
}

function isMarketingBlurb(text) {
  const s = String(text || '').trim();
  if (s.length < 80) return false;
  return (
    /exclusive coverage/i.test(s) ||
    /battle it out across the globe/i.test(s) ||
    (/beIN SPORTS/i.test(s) && /ATP Tour/i.test(s) && /#1/.test(s))
  );
}

function sanitizeAusportTitle(title, home, away, competition) {
  let t = collapseRepeatedText(title);
  if (isMarketingBlurb(t)) {
    if (home && away) return `${home} vs ${away}`;
    if (home) return home;
    if (competition) return competition;
    return '';
  }
  return t;
}

function isEmptyGrandPrixSundayPreview(row) {
  const label = `${row.home || ''} ${row.title || ''}`;
  if (!/grand\s*prix\s*sunday/i.test(label)) return false;
  return !String(row.channels || '').trim();
}
