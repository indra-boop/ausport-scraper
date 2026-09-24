'use strict';
const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

const assembled = path.join(__dirname, '.scraper.assembled.js');
if (!fs.existsSync(assembled) || process.env.AUSPORT_REBUILD === '1') {
  execSync('node scripts/build-scraper.js', { cwd: __dirname, stdio: 'inherit' });
}

if (require.main === module) {
  // Assembled script only runs main() when it IS the entrypoint.
  // Re-exec so production `node scraper.js` actually scrapes + ingests.
  const r = spawnSync(process.execPath, [assembled, ...process.argv.slice(2)], {
    cwd: __dirname,
    stdio: 'inherit',
    env: process.env,
  });
  process.exit(r.status == null ? 1 : r.status);
}

module.exports = require(assembled);
