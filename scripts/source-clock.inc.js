// Inserted into the scraper alongside its Sydney-to-WITA conversion helpers.
function parse24HourClock(value) {
  const match = /^(\d{1,2}):([0-5]\d)$/.exec(String(value ?? '').trim());
  if (!match || Number(match[1]) > 23) return null;
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

function restoreArchivedClock(row) {
  // Earlier versions copied an unrecognised 24-hour clock and its Sydney date
  // verbatim into both WITA fields. Only repair that exact signature.
  if (row.time_wita !== row.time_aedt || row.tanggal_wita !== row.tanggal || !parse24HourClock(row.time_aedt)) return row;
  const sourceDate = parseWitaDate(row.tanggal);
  if (!sourceDate || fmtTanggal(sourceDate) !== row.tanggal) return row;
  const { tanggalWita, hariWita } = getWitaDateFromBase(sourceDate, row.time_aedt);
  return { ...row, time_wita: convertSourceTimeToWita(row.time_aedt, sourceDate), tanggal_wita: tanggalWita, hari_wita: hariWita };
}
