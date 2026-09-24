'use strict';
const fs = require('fs');
const path = require('path');
const assembled = path.join(__dirname, '.scraper.assembled.js');
if (!fs.existsSync(assembled) || process.env.AUSPORT_REBUILD === '1') {
  let body = '';
  for (let i = 0; i < 4; i++) {
    body += require('./scraper-chunks/t' + i + '.js');
  }
  fs.writeFileSync(assembled, body);
}
module.exports = require(assembled);
