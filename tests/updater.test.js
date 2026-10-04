const test = require('node:test'), assert = require('node:assert/strict'), vm = require('node:vm'), fs = require('node:fs');
const { EventEmitter } = require('node:events');
function fixture(platform = 'win32') {
  const autoUpdater = new EventEmitter(); let checks = 0, installs = 0, downloads = 0, external = 0, busy = false;
  autoUpdater.checkForUpdates = async () => { checks++; await new Promise(r => setTimeout(r, 10)); autoUpdater.emit('update-available', { version: '1.3.0', releaseNotes: 'Test release' }); };
  autoUpdater.downloadUpdate = async () => { downloads++; autoUpdater.emit('update-downloaded', { version: '1.3.0' }); };
  autoUpdater.quitAndInstall = () => { installs++; };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(require.resolve('../src/updater'), 'utf8'), {
    module, process: { platform, resourcesPath: '/not-a-real-path', env: {} }, setImmediate,
    require: name => name === 'electron' ? { app: { isPackaged: true, getVersion: () => '1.2.0', getPath: () => '/app' }, shell: { openExternal: async () => { external++; } } } : name === 'electron-updater' ? { autoUpdater } : name === 'child_process' ? { spawnSync: () => ({ status: 0, stderr: 'Signature=adhoc' }) } : name === './update-policy' ? require('../src/update-policy') : require(name)
  });
  module.exports.configureUpdater(() => {}, { isBusy: () => busy });
  return { updater: module.exports, autoUpdater, counters: () => ({ checks, installs, downloads, external }), setBusy: v => { busy = v; } };
}
test('checking updates is deduplicated and never downloads automatically', async () => {
  const f = fixture(); await Promise.all([f.updater.checkForUpdates(), f.updater.checkForUpdates()]);
  assert.equal(f.counters().checks, 1); assert.equal(f.counters().downloads, 0); assert.equal(f.autoUpdater.autoInstallOnAppQuit, false);
});
test('one-click updater saves download but cannot interrupt dictation', async () => {
  const f = fixture(); await f.updater.checkForUpdates(); f.setBusy(true);
  await assert.rejects(f.updater.applyUpdate(), /Termina el dictado/); assert.equal(f.counters().installs, 0);
  assert.equal(f.updater.getUpdateState().status, 'downloaded'); f.setBusy(false); await f.updater.installUpdate();
  await new Promise(r => setImmediate(r)); assert.equal(f.counters().installs, 1);
  await f.updater.installUpdate(); assert.equal(f.counters().installs, 1);
});
test('unsigned macOS never promises or runs an in-place update', async () => {
  const f = fixture('darwin'); await f.updater.checkForUpdates(); await f.updater.applyUpdate();
  assert.equal(f.counters().external, 1); assert.equal(f.counters().downloads, 0); assert.equal(f.counters().installs, 0);
});
