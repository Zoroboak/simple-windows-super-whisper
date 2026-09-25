const path = require('path');
const fs = require('fs');
const { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, nativeImage, dialog, clipboard, session, net, screen } = require('electron');
const { Store } = require('./store');
const { transcribeWithFallback } = require('./providers');
const { fetchOpenRouterCatalog, routeById } = require('./catalog');
const { pasteText, diagnoseInjection } = require('./injector');

app.commandLine.appendSwitch('enable-features', 'GlobalShortcutsPortal,GlobalShortcutsPortalPreferredTrigger');
app.setName('Alex Dictate');
app.setDesktopName?.('com.zoroboak.AlexDictate.desktop');

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

let store, settingsWin, overlayWin, tray;
let activeRecordingId = null;
let recordingStartedAt = 0;
let busy = false;
let currentHotkey = null;
let cancelShortcutRegistered = false;
let liveSocket = null;
let liveText = '';
let liveInsertBuffer = '';
let liveInsertTimer = null;
let liveInsertChain = Promise.resolve();

function sendStateChanged() { if (settingsWin && !settingsWin.isDestroyed()) settingsWin.webContents.send('state:changed'); }
function overlaySend(channel, payload) { if (overlayWin && !overlayWin.isDestroyed()) overlayWin.webContents.send(channel, payload); }

function isToggleArg(arg) { return arg === '--toggle' || /^alex-dictate:\/\/(toggle|dictate)/i.test(arg || ''); }
function handleExternalArgs(argv = []) {
  if (argv.some(isToggleArg)) setTimeout(() => toggleRecording(), 150);
}

app.on('second-instance', (_event, argv) => handleExternalArgs(argv));
app.on('open-url', (event, url) => { event.preventDefault(); handleExternalArgs([url]); });

function queueLiveInsertion(delta) {
  if (store.state.settings.insertionMode !== 'live-experimental' || !store.state.settings.autoPaste || !delta) return;
  liveInsertBuffer += delta;
  if (liveInsertTimer) return;
  liveInsertTimer = setTimeout(() => {
    const part = liveInsertBuffer;
    liveInsertBuffer = '';
    liveInsertTimer = null;
    if (!part) return;
    liveInsertChain = liveInsertChain.then(() => pasteText(part)).catch(() => {});
  }, 180);
}

function startLivePreview() {
  stopLivePreview(false);
  if (!store.state.settings.livePreview || store.state.settings.liveProvider !== 'mistral') return;
  if (!store.getSecret('mistral')) {
    overlaySend('overlay:live-text', { text: '', warning: 'Realtime desactivado: falta API key de Mistral.' });
    return;
  }
  liveText = '';
  liveInsertBuffer = '';
  const model = 'voxtral-mini-transcribe-realtime-2602';
  const key = store.getSecret('mistral');
  const ws = new net.WebSocket(
    `wss://api.mistral.ai/v1/audio/transcriptions/realtime?model=${model}`,
    { headers: { Authorization: `Bearer ${key}` } }
  );
  liveSocket = ws;
  ws.onopen = () => {
    ws.send(JSON.stringify({ type: 'session.update', session: {
      audio_format: { encoding: 'pcm_s16le', sample_rate: 16000 },
      target_streaming_delay_ms: Number(store.state.settings.liveTargetDelayMs || 650)
    } }));
  };
  ws.onmessage = event => {
    try {
      const msg = JSON.parse(String(event.data));
      if (msg.type === 'transcription.text.delta' && msg.text) {
        liveText += msg.text;
        overlaySend('overlay:live-text', { text: liveText });
        queueLiveInsertion(msg.text);
      } else if (msg.type === 'error' || msg.type === 'transcription.error') {
        overlaySend('overlay:live-text', { text: liveText, warning: msg.error?.message || msg.message || 'Error realtime' });
      }
    } catch (_) {}
  };
  ws.onerror = () => overlaySend('overlay:live-text', { text: liveText, warning: 'Realtime desconectado; el WAV local sigue seguro.' });
}

function pushLivePcm(chunk) {
  const ws = liveSocket;
  if (!ws || ws.readyState !== 1) return;
  try { ws.send(JSON.stringify({ type: 'input_audio.append', audio: Buffer.from(chunk).toString('base64') })); } catch (_) {}
}

function stopLivePreview(flush = true) {
  if (liveInsertTimer) { clearTimeout(liveInsertTimer); liveInsertTimer = null; }
  if (liveInsertBuffer) {
    const part = liveInsertBuffer; liveInsertBuffer = '';
    if (store?.state.settings.insertionMode === 'live-experimental') liveInsertChain = liveInsertChain.then(() => pasteText(part)).catch(() => {});
  }
  const ws = liveSocket; liveSocket = null;
  if (!ws) return;
  try {
    if (flush && ws.readyState === 1) {
      ws.send(JSON.stringify({ type: 'input_audio.flush' }));
      ws.send(JSON.stringify({ type: 'input_audio.end' }));
      setTimeout(() => { try { ws.close(); } catch (_) {} }, 900);
    } else ws.close();
  } catch (_) {}
}

function createSettingsWindow() {
  if (settingsWin && !settingsWin.isDestroyed()) { settingsWin.show(); settingsWin.focus(); return; }
  settingsWin = new BrowserWindow({
    width: 1180, height: 800, minWidth: 920, minHeight: 650,
    title: 'Alex Dictate', backgroundColor: '#0b0d10',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  settingsWin.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  settingsWin.on('close', e => { if (!app.isQuitting) { e.preventDefault(); settingsWin.hide(); } });
}

function createOverlay() {
  overlayWin = new BrowserWindow({
    width: 660, height: 168, frame: false, transparent: true, resizable: false,
    show: false, alwaysOnTop: true, skipTaskbar: true, focusable: false,
    hasShadow: false, backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false }
  });
  overlayWin.setAlwaysOnTop(true, 'floating');
  overlayWin.setIgnoreMouseEvents(false);
  overlayWin.loadFile(path.join(__dirname, '..', 'renderer', 'overlay.html'));
}

function positionOverlay() {
  const point = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(point);
  const b = display.workArea;
  overlayWin.setPosition(Math.round(b.x + (b.width - 660) / 2), Math.round(b.y + b.height - 208), false);
}

function registerMainHotkey(accelerator) {
  const next = String(accelerator || '').trim();
  if (!next) throw new Error('Atajo vacío.');
  if (currentHotkey === next && globalShortcut.isRegistered(next)) return true;
  const ok = globalShortcut.register(next, () => toggleRecording());
  if (!ok) throw new Error(`No se pudo registrar ${next}. Puede estar ocupado o pendiente de autorización del portal Wayland.`);
  if (currentHotkey && currentHotkey !== next) globalShortcut.unregister(currentHotkey);
  currentHotkey = next;
  return true;
}

function registerTemporaryCancel() {
  // Registering a second global shortcut under Wayland can trigger another
  // portal authorization flow. Keep KDE/Wayland friction-free and expose
  // cancellation through the tray while the main dictation shortcut toggles stop.
  if (process.env.WAYLAND_DISPLAY) {
    overlaySend('overlay:hint', { text: 'Pulsa el atajo de nuevo para terminar · cancelar desde la bandeja' });
    return;
  }
  if (cancelShortcutRegistered || globalShortcut.isRegistered('Escape')) return;
  try {
    cancelShortcutRegistered = globalShortcut.register('Escape', () => cancelActiveRecording());
    if (!cancelShortcutRegistered) overlaySend('overlay:hint', { text: 'Pulsa el atajo de nuevo para terminar · cancelar desde la bandeja' });
  } catch (_) {
    cancelShortcutRegistered = false;
    overlaySend('overlay:hint', { text: 'Pulsa el atajo de nuevo para terminar · cancelar desde la bandeja' });
  }
}
function unregisterTemporaryCancel() {
  if (cancelShortcutRegistered) { try { globalShortcut.unregister('Escape'); } catch (_) {} }
  cancelShortcutRegistered = false;
}

function createTray() {
  const iconPath = path.join(__dirname, '..', 'assets', 'icon.png');
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 20, height: 20 });
  tray = new Tray(icon);
  tray.setToolTip('Alex Dictate');
  const update = () => tray.setContextMenu(Menu.buildFromTemplate([
    { label: busy ? 'Procesando…' : (activeRecordingId ? 'Detener dictado' : 'Iniciar dictado'), enabled: !busy, click: () => toggleRecording() },
    { label: 'Cancelar grabación', visible: Boolean(activeRecordingId), click: () => cancelActiveRecording() },
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
  if (busy || !overlayWin) return;
  if (!activeRecordingId) {
    positionOverlay(); overlayWin.showInactive();
    overlaySend('overlay:command', { type: 'start' });
  } else overlaySend('overlay:command', { type: 'stop' });
}

async function cancelActiveRecording() {
  if (!activeRecordingId) return;
  overlaySend('overlay:command', { type: 'cancel' });
}

async function processHistory(id) {
  busy = true; updateTray();
  overlaySend('overlay:status', { status: 'processing', text: 'Transcribiendo con tu cadena de prioridad…' });
  try {
    const result = await transcribeWithFallback(store, id);
    store.markSuccess(id, result.text, result.route);
    let injection = { method: 'clipboard' };
    if (store.state.settings.insertionMode === 'live-experimental') {
      await liveInsertChain.catch(() => {});
      clipboard.writeText(result.text);
      injection = { method: 'live-experimental', warning: 'Texto final revisado copiado al portapapeles.' };
    } else if (store.state.settings.autoPaste) injection = await pasteText(result.text);
    else clipboard.writeText(result.text);
    overlaySend('overlay:status', { status: 'done', text: result.text, warning: injection.warning || null });
    setTimeout(() => overlayWin?.hide(), injection.warning ? 3300 : 1000);
  } catch (e) {
    store.markFailure(id, e.message || e);
    overlaySend('overlay:status', { status: 'failed', text: String(e.message || e) });
  } finally {
    busy = false; activeRecordingId = null; unregisterTemporaryCancel(); updateTray(); sendStateChanged();
  }
}

app.whenReady().then(async () => {
  store = new Store();
  store.recoverInterrupted();
  store.cleanupCompletedAudio();
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb, details = {}) => {
    if (permission !== 'media') return cb(false);
    const types = details.mediaTypes || [];
    cb(!types.includes('video') && (types.length === 0 || types.includes('audio')));
  });
  try { app.setAsDefaultProtocolClient('alex-dictate'); } catch (_) {}
  createOverlay(); updateTray = createTray();
  try { registerMainHotkey(store.state.settings.hotkey); } catch (_) { setTimeout(() => createSettingsWindow(), 350); }
  if (process.argv.includes('--dev') || store.state.history.length === 0) createSettingsWindow();
  handleExternalArgs(process.argv);
});

app.on('window-all-closed', () => {});
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('activate', () => createSettingsWindow());

ipcMain.handle('state:get', () => store.publicState());
ipcMain.handle('settings:set', (_e, patch) => { store.setSettings(patch); sendStateChanged(); return store.publicState(); });
ipcMain.handle('routing:set', (_e, patch) => { store.setRouting(patch); sendStateChanged(); return store.publicState(); });
ipcMain.handle('dictionary:set', (_e, items) => { store.setDictionary(items); sendStateChanged(); return store.publicState(); });
ipcMain.handle('snippets:set', (_e, items) => { store.setSnippets(items); sendStateChanged(); return store.publicState(); });
ipcMain.handle('secret:set', (_e, name, value) => { store.setSecret(name, value); sendStateChanged(); return true; });
ipcMain.handle('hotkey:set', (_e, accelerator) => {
  const old = currentHotkey || store.state.settings.hotkey;
  try { registerMainHotkey(accelerator); store.setSettings({ hotkey: accelerator }); sendStateChanged(); return { ok: true, hotkey: accelerator }; }
  catch (e) { if (old && !globalShortcut.isRegistered(old)) try { registerMainHotkey(old); } catch (_) {} throw e; }
});
ipcMain.handle('catalog:refresh', async () => {
  const catalog = await fetchOpenRouterCatalog(store.getSecret('openrouter'), undefined, store.state.settings.openRouterRegion || 'global');
  store.setCatalog(catalog); sendStateChanged(); return store.publicState().routing;
});
ipcMain.handle('diagnose', async () => ({
  ...(await diagnoseInjection()), hotkey: store.state.settings.hotkey, hotkeyRegistered: Boolean(currentHotkey && globalShortcut.isRegistered(currentHotkey)),
  userData: app.getPath('userData'), version: app.getVersion(), routingChain: store.state.routing.chain,
  routeReadiness: store.state.routing.chain.map(id => { const r = routeById(id); return { id, ready: Boolean(r && store.getSecret(r.keyRef)), keyRef: r?.keyRef || null }; })
}));
ipcMain.on('window:settings', () => createSettingsWindow());
ipcMain.on('recording:toggle', () => toggleRecording());

ipcMain.handle('recording:started', (_e, meta) => {
  if (activeRecordingId) return activeRecordingId;
  const item = store.createPending(meta);
  activeRecordingId = item.id;
  store.beginPcmStream(item.id);
  startLivePreview(); registerTemporaryCancel();
  recordingStartedAt = Date.now(); updateTray(); sendStateChanged();
  return item.id;
});

ipcMain.on('recording:pcm', (_e, payload) => {
  if (!payload?.id || !payload?.chunk || payload.id !== activeRecordingId) return;
  try {
    const chunk = Buffer.from(payload.chunk);
    store.appendPcmChunk(payload.id, chunk);
    pushLivePcm(chunk);
  } catch (_) {}
});

ipcMain.handle('recording:finished', async (_e, payload) => {
  const id = payload.id || activeRecordingId;
  if (!id) throw new Error('No hay una grabación activa.');
  stopLivePreview(true); unregisterTemporaryCancel();
  try {
    const audioPath = store.finalizePcmStream(id);
    if (!audioPath || !fs.existsSync(audioPath) || fs.statSync(audioPath).size <= 44) throw new Error('No se pudo persistir el WAV local.');
    store.updateHistory(id, { durationMs: payload.durationMs || (Date.now() - recordingStartedAt), microphoneLabel: payload.microphoneLabel || null });
    activeRecordingId = null; updateTray(); sendStateChanged();
    processHistory(id); return true;
  } catch (e) {
    store.markFailure(id, `No se pudo cerrar el audio local: ${e.message || e}`);
    activeRecordingId = null; busy = false; updateTray(); sendStateChanged();
    overlaySend('overlay:status', { status: 'failed', text: String(e.message || e) });
    throw e;
  }
});

ipcMain.handle('recording:cancelled', (_e, id) => {
  stopLivePreview(false); unregisterTemporaryCancel();
  const rid = id || activeRecordingId;
  if (rid) store.cancelRecording(rid);
  activeRecordingId = null; busy = false; overlayWin.hide(); updateTray(); sendStateChanged(); return true;
});

ipcMain.handle('history:retry', async (_e, id) => { if (busy || activeRecordingId) return false; const h = store.state.history.find(x => x.id === id); if (!h?.audioPath || !fs.existsSync(h.audioPath)) throw new Error('No hay audio local para reintentar.'); store.updateHistory(id, { status: 'queued', error: null }); processHistory(id); return true; });
ipcMain.handle('history:copy', (_e, id) => { const h = store.state.history.find(x => x.id === id); if (h?.text) clipboard.writeText(h.text); return true; });
ipcMain.handle('history:save-audio', async (_e, id) => {
  const h = store.state.history.find(x => x.id === id);
  if (!h?.audioPath || !fs.existsSync(h.audioPath)) throw new Error('No hay audio guardado.');
  const ext = path.extname(h.audioPath) || '.wav';
  const result = await dialog.showSaveDialog({ defaultPath: `alex-dictate-${id}${ext}` });
  if (!result.canceled && result.filePath) fs.copyFileSync(h.audioPath, result.filePath);
  return !result.canceled;
});
ipcMain.handle('history:delete', (_e, id) => { store.deleteHistory(id); sendStateChanged(); return true; });
