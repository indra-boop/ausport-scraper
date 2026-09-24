'use strict';
const fs = require('fs');
const path = require('path');
const assembled = path.join(__dirname, '.scraper.assembled.js');
if (!fs.existsSync(assembled) || process.env.AUSPORT_REBUILD === '1') {
  let body = '';
  for (let i = 0; i < 16; i++) {
    const b64 = fs.readFileSync(path.join(__dirname, 'scraper-chunks/p' + i + '.b64'), 'utf8').trim();
    body += Buffer.from(b64, 'base64').toString('utf8');
  }
  fs.writeFileSync(assembled, body);
}
module.exports = require(assembled);
