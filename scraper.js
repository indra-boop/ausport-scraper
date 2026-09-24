'use strict';
const fs = require('fs');
const path = require('path');
const assembled = path.join(__dirname, '.scraper.assembled.js');
if (!fs.existsSync(assembled) || process.env.AUSPORT_REBUILD === '1') {
  const parts = [
    require('./scraper-chunks/part0.js'),
    require('./scraper-chunks/part1.js'),
    require('./scraper-chunks/part2.js'),
    require('./scraper-chunks/part3.js'),
    require('./scraper-chunks/part4.js'),
    require('./scraper-chunks/part5.js'),
    require('./scraper-chunks/part6.js')
  ];
  fs.writeFileSync(assembled, parts.join(''));
}
module.exports = require(assembled);
