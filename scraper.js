'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const assembled = path.join(__dirname, '.scraper.assembled.js');
if (!fs.existsSync(assembled) || process.env.AUSPORT_REBUILD === '1') {
  let b64 = '';
  for (let i = 0; ; i++) {
    const name = 'g' + String(i).padStart(2, '0') + '.b64';
    const fp = path.join(__dirname, 'scraper-chunks', name);
    if (!fs.existsSync(fp)) break;
    b64 += fs.readFileSync(fp, 'utf8').trim();
  }
  const buf = zlib.gunzipSync(Buffer.from(b64, 'base64'));
  fs.writeFileSync(assembled, buf);
}
module.exports = require(assembled);
