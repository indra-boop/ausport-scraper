'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const assembled = path.join(__dirname, '.scraper.assembled.js');
if (!fs.existsSync(assembled) || process.env.AUSPORT_REBUILD === '1') {
  const b64 = fs.readFileSync(path.join(__dirname, 'scraper.js.gz.b64'), 'utf8');
  fs.writeFileSync(assembled, zlib.gunzipSync(Buffer.from(b64, 'base64')));
}
module.exports = require(assembled);
