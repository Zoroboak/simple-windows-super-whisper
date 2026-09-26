const { readdirSync, statSync } = require('node:fs');
const { join } = require('node:path');
const { spawnSync } = require('node:child_process');
let count = 0;
function check(dir) { for (const name of readdirSync(dir)) { const file = join(dir, name); if (statSync(file).isDirectory()) check(file); else if (/\.(c?js)$/.test(name)) { const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' }); if (result.status !== 0) process.exit(1); count++; } } }
['src', 'renderer', 'scripts', 'tests'].forEach(check);
console.log(`${count} JavaScript files checked.`);
