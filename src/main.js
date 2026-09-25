const path = require('path');
const fs = require('fs');
const { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, nativeImage, dialog, clipboard, session, net } = require('electron');
const { Store } = require('./store');
const { transcribeWithFallback } = require('./providers');
const { pasteText, diagnoseInjection } = require('./injector');

app.commandLine.appendSwitch('enable-features', 'GlobalShortcutsPortal,GlobalShortcutsPortalPreferredTrigger');
app.setName('Alex Dictate');
app.setDesktopName?.('com.zoroboak.AlexDictate.desktop');

let store, settingsWin, overlayWin, tray;
let activeRecordingId = null;
let recordingStartedAt = 0;
let busy = false;
let liveSocket = null;
let liveText = '';
let liveAuthEnabled = false;

function sendStateChanged() { settingsWin?.webContents.send('state:changed'); }


function installLiveAuthHook() {
  if (liveAuthEnabled) return;
  liveAuthEnabled = true;
  session.defaultSession.webRequest.onBeforeSendHeaders({ urls: ['wss://api.mistral.ai/*'] }, (details, callback) => {
    const key = store?.getSecret('mistral');
    const headers = { ...details.requestHeaders };
    if (key) headers.Authorization = `Bearer ${key}`;
    callback({ requestHeaders: headers });
  });
}

function startLivePreview() {
  stopLivePreview(false);
  if (!store.state.settings.livePreview || store.state.settings.liveProvider !== 'mistral') return;
  if (!store.getSecret('mistral')) {
    overlayWin.webContents.send('overlay:live-text', { text: '', warning: 'Añade una API key de Mistral para la vista en tiempo real.' });
    return;
  }
  installLiveAuthHook();
  liveText = '';
  const model = 'voxtral-mini-transcribe-realtime-2602';
  const ws = new net.WebSocket(`wss://api.mistral.ai/v1/audio/transcriptions/realtime?model=${model}`);
  liveSocket = ws;
  ws.onopen = () => {
    ws.send(JSON.stringify({
      type: 'session.update',
      session: {
        audio_format: { encoding: 'pcm_s16le', sample_rate: 16000 },
        target_streaming_delay_ms: Number(store.state.settings.liveTargetDelayMs || 650)
      }
    }));
  };
  ws.onmessage = event => {
    try {
      const msg = JSON.parse(String(event.data));
      if (msg.type === 'transcription.text.delta' && msg.text) {
        liveText += msg.text;
        overlayWin.webContents.send('overlay:live-text', { text: liveText });
      } else if (msg.type === 'error' || msg.type === 'transcription.error') {
        overlayWin.webContents.send('overlay:live-text', { text: liveText, warning: msg.error?.message || msg.message || 'Error realtime' });
      }
    } catch (_) {}
  };
  ws.onerror = () => overlayWin.webContents.send('overlay:live-text', { text: liveText, warning: 'Vista realtime desconectada; la grabación final sigue segura.' });
}

function pushLivePcm(chunk) {
  const ws = liveSocket;
  if (!ws || ws.readyState !== 1) return;
  try {
    const b = Buffer.from(chunk);
    ws.send(JSON.stringify({ type: 'input_audio.append', audio: b.toString('base64') }));
  } catch (_) {}
}

function stopLivePreview(flush = true) {
  const ws = liveSocket;
  liveSocket = null;
  if (!ws) return;
  try {
    if (flush && ws.readyState === 1) {
      ws.send(JSON.stringify({ type: 'input_audio.flush' }));
      ws.send(JSON.stringify({ type: 'input_audio.end' }));
      setTimeout(() => { try { ws.close(); } catch (_) {} }, 1200);
    } else { try { ws.close(); } catch (_) {} }
  } catch (_) {}
}

function createSettingsWindow() {
  if (settingsWin && !settingsWin.isDestroyed()) { settingsWin.show(); settingsWin.focus(); return; }
  settingsWin = new BrowserWindow({
    width: 1080, height: 720, minWidth: 900, minHeight: 620,
    title: 'Alex Dictate', backgroundColor: '#0b0d10',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  settingsWin.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  settingsWin.on('close', e => { if (!app.isQuitting) { e.preventDefault(); settingsWin.hide(); } });
}

function createOverlay() {
  overlayWin = new BrowserWindow({
    width: 620, height: 150, frame: false, transparent: true, resizable: false,
    show: false, alwaysOnTop: true, skipTaskbar: true, focusable: false,
    hasShadow: false, backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false }
  });
  overlayWin.setAlwaysOnTop(true, 'floating');
  overlayWin.setIgnoreMouseEvents(false);
  overlayWin.loadFile(path.join(__dirname, '..', 'renderer', 'overlay.html'));
}

function positionOverlay() {
  const { screen } = require('electron');
  const point = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(point);
  const b = display.workArea;
  overlayWin.setPosition(Math.round(b.x + (b.width - 620) / 2), Math.round(b.y + b.height - 190), false);
}

function registerHotkey(accelerator) {
  globalShortcut.unregisterAll();
  const ok = globalShortcut.register(accelerator, () => toggleRecording());
  if (!ok) throw new Error(`No se pudo registrar ${accelerator}. En Wayland puede aparecer un diálogo del portal para autorizarlo.`);
  return true;
}

function createTray() {
  const iconPath = path.join(__dirname, '..', 'assets', 'icon.png');
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 20, height: 20 });
  tray = new Tray(icon);
  tray.setToolTip('Alex Dictate');
  const update = () => tray.setContextMenu(Menu.buildFromTemplate([
    { label: busy ? 'Procesando…' : (activeRecordingId ? 'Detener dictado' : 'Iniciar dictado'), click: () => toggleRecording() },
    { label: 'Abrir Alex Dictate', click: () => createSettingsWindow() },
    { type: 'separator' },
    { label: 'Salir', click: () => { app.isQuitting = true; app.quit(); } }
  ]));
  tray.on('click', () => toggleRecording());
  update();
  return update;
}
let updateTray = () => {};

async function toggleRecording() {
  if (busy) return;
  if (!activeRecordingId) {
    positionOverlay();
    overlayWin.showInactive();
    overlayWin.webContents.send('overlay:command', { type: 'start' });
  } else {
    overlayWin.webContents.send('overlay:command', { type: 'stop' });
  }
}

async function processHistory(id) {
  busy = true; updateTray();
  overlayWin.webContents.send('overlay:status', { status: 'processing', text: 'Transcribiendo…' });
  try {
    const item = store.state.history.find(x => x.id === id);
    const result = await transcribeWithFallback(store, id);
    const duration = item?.durationMs || 0;
    store.markSuccess(id, result.text, result.provider, duration);
    let injection = { method: 'clipboard' };
    if (store.state.settings.autoPaste) injection = await pasteText(result.text);
    else clipboard.writeText(result.text);
    overlayWin.webContents.send('overlay:status', { status: 'done', text: result.text, warning: injection.warning || null });
    setTimeout(() => overlayWin?.hide(), injection.warning ? 4000 : 1000);
  } catch (e) {
    store.markFailure(id, e.message || e);
    overlayWin.webContents.send('overlay:status', { status: 'failed', text: String(e.message || e) });
  } finally {
    busy = false; activeRecordingId = null; updateTray(); sendStateChanged();
  }
}

app.whenReady().then(async () => {
  store = new Store();
  store.recoverInterrupted();
  store.cleanupCompletedAudio();
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(permission === 'media'));
  createOverlay();
  updateTray = createTray();
  try { registerHotkey(store.state.settings.hotkey); } catch (e) { setTimeout(() => createSettingsWindow(), 500); }
  if (process.argv.includes('--dev') || store.state.history.length === 0) createSettingsWindow();
});

app.on('window-all-closed', e => e.preventDefault());
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('activate', () => createSettingsWindow());

ipcMain.handle('state:get', () => store.publicState());
ipcMain.handle('settings:set', (_e, patch) => { store.setSettings(patch); sendStateChanged(); return store.publicState(); });
ipcMain.handle('providers:set', (_e, items) => { store.setProviders(items); sendStateChanged(); return store.publicState(); });
ipcMain.handle('dictionary:set', (_e, items) => { store.setDictionary(items); sendStateChanged(); return store.publicState(); });
ipcMain.handle('snippets:set', (_e, items) => { store.setSnippets(items); sendStateChanged(); return store.publicState(); });
ipcMain.handle('secret:set', (_e, name, value) => { store.setSecret(name, value); sendStateChanged(); return true; });
ipcMain.handle('hotkey:set', (_e, accelerator) => { registerHotkey(accelerator); store.setSettings({ hotkey: accelerator }); return true; });
ipcMain.handle('diagnose', async () => ({ ...(await diagnoseInjection()), hotkey: store.state.settings.hotkey, userData: app.getPath('userData'), version: app.getVersion() }));
ipcMain.on('window:settings', () => createSettingsWindow());
ipcMain.on('recording:toggle', () => toggleRecording());

ipcMain.handle('recording:started', (_e, meta) => {
  if (activeRecordingId) return activeRecordingId;
  const item = store.createPending(meta);
  activeRecordingId = item.id;
  const ext = (meta?.mime || '').includes('ogg') ? 'ogg' : (meta?.mime || '').includes('wav') ? 'wav' : 'webm';
  store.beginAudioStream(item.id, ext);
  startLivePreview();
  recordingStartedAt = Date.now();
  updateTray(); sendStateChanged();
  return item.id;
});

ipcMain.handle('recording:finished', async (_e, payload) => {
  const id = payload.id || activeRecordingId;
  if (!id) throw new Error('No hay una grabación activa.');
  stopLivePreview(true);
  let audioPath = null;
  try { audioPath = store.finalizeAudioStream(id); } catch (_) {}
  if (!audioPath || !fs.existsSync(audioPath) || fs.statSync(audioPath).size === 0) {
    const buffer = Buffer.from(payload.bytes || []);
    const ext = (payload.mime || '').includes('ogg') ? 'ogg' : (payload.mime || '').includes('wav') ? 'wav' : 'webm';
    if (!buffer.length) throw new Error('No se pudo persistir el audio de la grabación.');
    store.saveAudio(id, buffer, ext);
  }
  store.updateHistory(id, { durationMs: payload.durationMs || (Date.now() - recordingStartedAt), mime: payload.mime || 'audio/webm' });
  activeRecordingId = null;
  updateTray(); sendStateChanged();
  processHistory(id);
  return true;
});

ipcMain.on('recording:pcm', (_e, chunk) => pushLivePcm(chunk));
ipcMain.on('recording:encoded-chunk', (_e, payload) => {
  if (!payload?.id || !payload?.chunk) return;
  try { store.appendAudioChunk(payload.id, Buffer.from(payload.chunk)); } catch (_) {}
});

ipcMain.handle('recording:cancelled', (_e, id) => {
  stopLivePreview(false);
  const rid = id || activeRecordingId;
  if (rid) {
    const item = store.state.history.find(x => x.id === rid);
    if (item?.audioPath) { try { if (fs.existsSync(item.audioPath)) fs.unlinkSync(item.audioPath); } catch (_) {} }
    store.updateHistory(rid, { status: 'cancelled', error: null, audioPath: null, bytes: 0 });
  }
  activeRecordingId = null; busy = false; overlayWin.hide(); updateTray(); sendStateChanged(); return true;
});

ipcMain.handle('history:retry', async (_e, id) => { processHistory(id); return true; });
ipcMain.handle('history:copy', (_e, id) => { const h = store.state.history.find(x => x.id === id); if (h?.text) clipboard.writeText(h.text); return true; });
ipcMain.handle('history:save-audio', async (_e, id) => {
  const h = store.state.history.find(x => x.id === id);
  if (!h?.audioPath || !fs.existsSync(h.audioPath)) throw new Error('No hay audio guardado.');
  const ext = path.extname(h.audioPath);
  const result = await dialog.showSaveDialog({ defaultPath: `alex-dictate-${id}${ext}` });
  if (!result.canceled && result.filePath) fs.copyFileSync(h.audioPath, result.filePath);
  return !result.canceled;
});
ipcMain.handle('history:delete', (_e, id) => {
  const h = store.state.history.find(x => x.id === id);
  if (h?.audioPath) { try { fs.unlinkSync(h.audioPath); } catch (_) {} }
  store.state.history = store.state.history.filter(x => x.id !== id); store.save(); sendStateChanged(); return true;
});
