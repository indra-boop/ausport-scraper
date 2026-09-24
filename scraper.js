'use strict';
const fs = require('fs');
const path = require('path');
const assembled = path.join(__dirname, '.scraper.assembled.js');
if (!fs.existsSync(assembled) || process.env.AUSPORT_REBUILD === '1') {
  for (let i = 0; i < 4; i++) {
    let chunk = '';
    for (let j = 0; j < 4; j++) {
      chunk += fs.readFileSync(path.join(__dirname, 'scraper-chunks/t' + i + '_' + j + '.txt'), 'utf8');
    }
    fs.writeFileSync(path.join(__dirname, 'scraper-chunks/t' + i + '.js'), chunk);
  }
  let body = '';
  for (let i = 0; i < 4; i++) {
    body += require('./scraper-chunks/t' + i + '.js');
  }
  fs.writeFileSync(assembled, body);
}
module.exports = require(assembled);
