'use strict';
const fs = require('fs');
const path = require('path');
const assembled = path.join(__dirname, '.scraper.assembled.js');
if (!fs.existsSync(assembled) || process.env.AUSPORT_REBUILD === '1') {
  const n = 6;
  let body = '';
  for (let i = 0; i < n; i++) {
    body += fs.readFileSync(path.join(__dirname, 'scraper.part' + i + '.js.txt'), 'utf8');
  }
  fs.writeFileSync(assembled, body);
}
module.exports = require(assembled);
