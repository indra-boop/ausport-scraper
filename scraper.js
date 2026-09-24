'use strict';
const fs = require('fs');
const path = require('path');
const assembled = path.join(__dirname, '.scraper.assembled.js');
if (!fs.existsSync(assembled) || process.env.AUSPORT_REBUILD === '1') {
  const parts = [];
  for (let i = 0; i < 8; i++) {
    parts.push(require('./scraper-chunks/part' + i + '.js'));
  }
  fs.writeFileSync(assembled, parts.join(''));
}
module.exports = require(assembled);
