// Preserve electron-updater's safe artifact URLs when publishing with gh CLI.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const yaml = createRequire(require.resolve('electron-updater/package.json'))('js-yaml');
async function digest(file) {
  const hash = crypto.createHash('sha512');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest('base64');
}
(async () => {
  const source = path.resolve('dist'), dest = path.resolve('release-files');
  fs.mkdirSync(dest, { recursive: true });
  const copied = new Set();
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    if (!entry.isFile() || !/(\.AppImage|\.deb|\.exe|\.dmg|\.zip|\.blockmap|^latest.*\.yml)$/.test(entry.name)) continue;
    const name = entry.name.replace(/ /g, '-');
    assert.match(name, /^[A-Za-z0-9_.-]+$/, 'Release asset name must be URL-safe');
    assert.ok(!copied.has(name), 'Colliding asset name: ' + name);
    fs.copyFileSync(path.join(source, entry.name), path.join(dest, name)); copied.add(name);
  }
  assert.ok(copied.size, 'No installer assets collected');
  let checked = 0;
  for (const name of copied) {
    if (!/^latest.*\.yml$/.test(name)) continue;
    const meta = yaml.load(fs.readFileSync(path.join(dest, name), 'utf8'));
    assert.equal(meta.version, require('../package.json').version);
    assert.ok(Array.isArray(meta.files) && meta.files.length > 0);
    for (const item of meta.files) {
      const filename = decodeURIComponent(item.url);
      assert.match(filename, /^[A-Za-z0-9_.-]+$/);
      assert.ok(copied.has(filename), `Updater references missing asset: ${filename}`);
      const file = path.join(dest, filename);
      assert.equal(fs.statSync(file).size, item.size, `Wrong size: ${filename}`);
      assert.equal(await digest(file), item.sha512, `Wrong hash: ${filename}`); checked++;
    }
    if (meta.path) assert.ok(copied.has(decodeURIComponent(meta.path)), 'Legacy update path is missing');
  }
  assert.ok(checked > 0, 'No update metadata was validated');
  console.log(`Collected ${copied.size} URL-safe assets; verified ${checked} updater URLs, sizes and SHA-512 hashes.`);
})().catch(error => { console.error(error); process.exit(1); });
