'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const assembled = path.join(__dirname, '.scraper.assembled.js');
if (!fs.existsSync(assembled) || process.env.AUSPORT_REBUILD === '1') {
  let b64 = '';
  for (let i = 0; i < 4; i++) {
    b64 += fs.readFileSync(path.join(__dirname, 'scraper-chunks/body.b64.' + i), 'utf8').trim();
  }
  fs.writeFileSync(assembled, zlib.inflateSync(Buffer.from(b64, 'base64')));
}
module.exports = require(assembled);
