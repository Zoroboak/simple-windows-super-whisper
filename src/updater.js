const { app, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { autoUpdater } = require('electron-updater');
const { updatePolicy } = require('./update-policy');
const RELEASES_URL = 'https://github.com/Zoroboak/simple-windows-super-whisper/releases/latest';
let sender = () => {}, hooks = {}, configured = false, checkJob = null, downloadJob = null, installRequested = false;
let policy;
let state = { status: 'idle', currentVersion: app.getVersion(), availableVersion: null, percent: 0,
  error: null, releaseNotes: null, releaseUrl: RELEASES_URL, checkedAt: null, platform: process.platform };
function getPolicy() {
  if (policy) return policy;
  let signedMac = false, packageType = '';
  if (app.isPackaged && process.platform === 'darwin') {
    const p = spawnSync('/usr/bin/codesign', ['-dv', '--verbose=4', app.getPath('exe')], { encoding: 'utf8', timeout: 4000 });
    signedMac = p.status === 0 && /Authority=Developer ID Application/.test(`${p.stdout}\n${p.stderr}`);
  }
  try { packageType = fs.readFileSync(path.join(process.resourcesPath || '', 'package-type'), 'utf8').trim(); } catch (_) {}
  policy = updatePolicy({ packaged: app.isPackaged, platform: process.platform,
    portable: Boolean(process.env.PORTABLE_EXECUTABLE_FILE), appImage: Boolean(process.env.APPIMAGE), packageType, signedMac });
  return policy;
}
function getUpdateState() { return { ...state, ...getPolicy() }; }
function emit(patch = {}) { state = { ...state, ...patch }; sender(getUpdateState()); return getUpdateState(); }
function notes(info) { const n = info?.releaseNotes; return Array.isArray(n) ? n.map(x => x.note || '').join('\n') : typeof n === 'string' ? n : null; }
function configureUpdater(send, options = {}) {
  sender = send; hooks = options;
  if (configured) return;
  configured = true;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowPrerelease = false;
  autoUpdater.allowDowngrade = false;
  autoUpdater.on('checking-for-update', () => emit({ status: 'checking', error: null }));
  autoUpdater.on('update-available', info => emit({ status: 'available', availableVersion: info.version,
    releaseNotes: notes(info), checkedAt: new Date().toISOString(), error: null }));
  autoUpdater.on('update-not-available', () => emit({ status: 'current', availableVersion: null,
    checkedAt: new Date().toISOString(), error: null }));
  autoUpdater.on('download-progress', p => emit({ status: 'downloading', percent: Math.max(0, Math.min(100, Number(p.percent || 0))) }));
  autoUpdater.on('update-downloaded', info => emit({ status: 'downloaded', availableVersion: info.version,
    releaseNotes: notes(info) || state.releaseNotes, percent: 100, error: null }));
  autoUpdater.on('error', error => emit({ status: 'error', error: String(error.message || error).slice(0, 800) }));
  emit();
}
async function checkForUpdates() {
  if (!app.isPackaged) return emit({ status: 'development', checkedAt: new Date().toISOString() });
  if (downloadJob || ['downloading', 'downloaded'].includes(state.status)) return getUpdateState();
  if (checkJob) return checkJob;
  checkJob = (async () => {
    try { await autoUpdater.checkForUpdates(); return getUpdateState(); }
    catch (error) { return emit({ status: 'error', error: String(error.message || error).slice(0, 800) }); }
    finally { checkJob = null; }
  })();
  return checkJob;
}
async function downloadUpdate() {
  if (downloadJob) return downloadJob;
  if (!getPolicy().canAutoInstall) { await shell.openExternal(RELEASES_URL); return emit({ status: 'manual', error: null }); }
  if (!['available', 'error'].includes(state.status) || !state.availableVersion) return getUpdateState();
  downloadJob = (async () => {
    try { emit({ status: 'downloading', percent: 0, error: null }); await autoUpdater.downloadUpdate(); return getUpdateState(); }
    catch (error) { return emit({ status: 'error', error: String(error.message || error).slice(0, 800) }); }
    finally { downloadJob = null; }
  })();
  return downloadJob;
}
async function installUpdate() {
  if (!getPolicy().canAutoInstall || state.status !== 'downloaded' || installRequested) return false;
  if (hooks.isBusy?.()) throw new Error('Termina el dictado o procesamiento antes de actualizar. La descarga ya está guardada.');
  installRequested = true;
  hooks.beforeInstall?.();
  setImmediate(() => autoUpdater.quitAndInstall(false, true));
  return true;
}
async function applyUpdate() {
  await downloadUpdate();
  if (state.status === 'downloaded') await installUpdate();
  return getUpdateState();
}
module.exports = { configureUpdater, checkForUpdates, downloadUpdate, installUpdate, applyUpdate, getUpdateState, RELEASES_URL };
