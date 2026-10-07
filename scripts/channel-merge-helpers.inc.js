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
  if (/exclusive coverage/i.test(s)) return true;
  if (/battle it out/i.test(s)) return true;
  if (/up and coming talent/i.test(s)) return true;
  if (/watch every game/i.test(s)) return true;
  if (/beIN SPORTS/i.test(s) && /ATP Tour/i.test(s)) return true;
  // Long prose / promo copy (Nations League blurbs, NFL previews, etc.)
  if (s.length >= 120 && /\b(edition|season|features|coverage|contest|determination|inspire[ds]?)\b/i.test(s)) {
    return true;
  }
  if (s.length >= 140 && /\.\s+[A-Z]/.test(s)) return true;
  return false;
}

/** Split "short | promo…" — keep competition-like short suffixes (e.g. "| Bundesliga"). */
function splitAusportTitlePipe(title) {
  const s = String(title || '').trim();
  const idx = s.indexOf(' | ');
  if (idx < 0) return { title: s, description: '' };
  const head = s.slice(0, idx).trim();
  const tail = s.slice(idx + 3).trim();
  const stripPromo =
    Boolean(head) &&
    (tail.length >= 60 ||
      isMarketingBlurb(tail) ||
      isMarketingBlurb(s) ||
      /\b(edition|season|features|watch every|battle it out|coverage|determination|inspire[ds]?)\b/i.test(tail));
  if (stripPromo) return { title: head, description: tail };
  return { title: s, description: '' };
}

function titleFallback(home, away, competition) {
  if (home && away) return `${home} vs ${away}`;
  if (home) return home;
  if (competition) return competition;
  return '';
}

function sanitizeAusportTitle(title, home, away, competition) {
  const split = splitAusportTitlePipe(title);
  let t = collapseRepeatedText(split.title);
  // Prefer short head after pipe-promo strip; only fall back when still marketing.
  if (t && !isMarketingBlurb(t)) return t;
  return titleFallback(home, away, competition) || t || '';
}

function isEmptyGrandPrixSundayPreview(row) {
  const label = `${row.home || ''} ${row.title || ''}`;
  if (!/grand\s*prix\s*sunday/i.test(label)) return false;
  return !String(row.channels || '').trim();
}
