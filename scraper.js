'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const assembled = path.join(__dirname, '.scraper.assembled.js');
if (!fs.existsSync(assembled) || process.env.AUSPORT_REBUILD === '1') {
  execSync('node scripts/build-scraper.js', { cwd: __dirname, stdio: 'inherit' });
}
module.exports = require(assembled);
