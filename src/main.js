const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, nativeImage, dialog, clipboard, session, net, screen, shell, systemPreferences } = require('electron');
const { Store } = require('./store');
const { transcribeWithFallback } = require('./providers');
const { fetchOpenRouterCatalog, routeById } = require('./catalog');
const { pasteText, diagnoseInjection } = require('./injector');
const { changeHotkey } = require('./hotkey');
const { LivePreview } = require('./live');
const { testCredential } = require('./credentials');
const { launchWaylandSetup } = require('./linux_setup');
const updates = require('./updater');

app.commandLine.appendSwitch('enable-features', 'GlobalShortcutsPortal,GlobalShortcutsPortalPreferredTrigger');
app.setName('Alex Dictate');
app.setDesktopName?.('com.zoroboak.AlexDictate.desktop');
if (!app.requestSingleInstanceLock()) app.exit(0);
let store, settingsWin, overlayWin, overlayReady, tray, currentHotkey, live;
let activeId = null, processingId = null, phase = 'idle', hideTimer, updateTimer, quitAfterSave = false, captureFault = null;
let liveInsertion = Promise.resolve(), liveBuffer = '', liveTimer, liveAllowed = false, liveInserted = false;
const rendererFile = name => path.join(__dirname, '..', 'renderer', name);
const send = (win, channel, data) => { if (win && !win.isDestroyed()) win.webContents.send(channel, data); };
const notify = text => send(settingsWin, 'notice', { text });
const overlaySend = (channel, data) => send(overlayWin, channel, data);
const changed = () => { send(settingsWin, 'state:changed'); updateTray(); };
const isBusy = () => phase !== 'idle';
function reset() { phase = 'idle'; activeId = null; processingId = null; captureFault = null; changed(); }
function quietFailure(id, message) { try { if (id) store.markFailure(id, message); } catch (_) {} }
function hideLater(ms) { clearTimeout(hideTimer); hideTimer = setTimeout(() => { if (!isBusy()) overlayWin?.hide(); }, ms); }
function harden(win, name) {
  const expected = pathToFileURL(rendererFile(name)).href;
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e, url) => { if (url !== expected) e.preventDefault(); });
  win.webContents.on('will-attach-webview', e => e.preventDefault());
}
function settingsWindow() {
  if (settingsWin && !settingsWin.isDestroyed()) { settingsWin.show(); settingsWin.focus(); return; }
  settingsWin = new BrowserWindow({ width: 1180, height: 800, minWidth: 880, minHeight: 620,
    title: 'Alex Dictate', backgroundColor: '#0b0d10', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  harden(settingsWin, 'index.html'); settingsWin.loadFile(rendererFile('index.html'));
  settingsWin.on('close', event => { if (!app.isQuitting) { event.preventDefault(); settingsWin.hide(); } });
}
function makeOverlay() {
  overlayWin = new BrowserWindow({ width: 660, height: 190, frame: false, transparent: true, resizable: false,
    show: false, alwaysOnTop: true, skipTaskbar: true, focusable: false, hasShadow: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false } });
  harden(overlayWin, 'overlay.html'); overlayWin.setAlwaysOnTop(true, 'floating');
  overlayReady = overlayWin.loadFile(rendererFile('overlay.html'));
  overlayWin.webContents.on('render-process-gone', () => {
    live?.close(); liveAllowed = false; quietFailure(activeId, 'La ventana de captura se cerró. El audio parcial permanece en Historial.'); reset();
    if (!app.isQuitting) { overlayWin.destroy(); makeOverlay(); settingsWindow(); }
  });
}
function positionOverlay() {
  let display; try { display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()); } catch (_) { display = screen.getPrimaryDisplay(); }
  const b = display.workArea, width = Math.min(660, b.width - 24);
  overlayWin.setSize(width, 190); overlayWin.setPosition(Math.round(b.x + (b.width - width) / 2), Math.round(b.y + b.height - 215));
}
function registerHotkey(value) {
  currentHotkey = changeHotkey(globalShortcut, currentHotkey, value,
    () => toggle().catch(e => notify(e.message)), next => store.setSettings({ hotkey: next }, { allowHotkey: true }));
}
function updateTray() {
  if (!tray) return;
  tray.setToolTip(`Alex Dictate · ${phase === 'idle' ? 'Listo' : phase === 'recording' ? 'Grabando' : 'Procesando'}`);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: phase === 'recording' ? 'Terminar dictado' : 'Iniciar dictado', enabled: ['idle', 'recording'].includes(phase), click: () => toggle().catch(e => notify(e.message)) },
    { label: 'Guardar sin enviar', visible: phase === 'recording', click: () => overlaySend('overlay:command', { type: 'cancel' }) },
    { label: 'Abrir Alex Dictate', click: settingsWindow }, { type: 'separator' },
    { label: 'Salir', click: () => app.quit() }
  ]));
}
function queueInsertion(delta) {
  if (!liveAllowed || !delta) return;
  liveBuffer += delta;
  if (liveTimer) return;
  liveTimer = setTimeout(flushInsertion, 350);
}
function flushInsertion() {
  clearTimeout(liveTimer); liveTimer = null;
  const text = liveBuffer; liveBuffer = '';
  if (!text || !liveAllowed) return;
  liveInsertion = liveInsertion.then(async () => {
    if (!liveAllowed) return;
    const result = await pasteText(text);
    liveInserted = true;
    if (result.warning) { liveAllowed = false; overlaySend('overlay:live-text', { warning: 'Escritura en vivo detenida. El resultado completo quedará en Historial.' }); }
  }).catch(() => { liveAllowed = false; });
}
function startLive() {
  live?.close(); live = null; liveBuffer = ''; liveInserted = false;
  const s = store.state.settings;
  liveAllowed = s.insertionMode === 'live-experimental' && s.livePreview && s.autoPaste;
  if (!s.livePreview) return;
  const key = store.getSecret('mistral');
  if (!key) { overlaySend('overlay:live-text', { warning: 'Sin clave Mistral: la transcripción final sigue disponible.' }); return; }
  try {
    live = new LivePreview(net.WebSocket, key, s.liveTargetDelayMs,
      (text, delta) => { overlaySend('overlay:live-text', { text }); queueInsertion(delta); },
      warning => overlaySend('overlay:live-text', { warning }));
  } catch (_) { overlaySend('overlay:live-text', { warning: 'Vista en directo no disponible. Se conserva la captura local.' }); }
}
async function toggle(fromSettings = false) {
  if (phase === 'recording') { phase = 'stopping'; changed(); overlaySend('overlay:command', { type: 'stop' }); return; }
  if (isBusy()) return;
  clearTimeout(hideTimer); phase = 'starting'; captureFault = null; changed();
  try {
    if (fromSettings && settingsWin?.isVisible()) { settingsWin.hide(); await new Promise(r => setTimeout(r, 180)); }
    await overlayReady; positionOverlay(); overlayWin.showInactive(); overlaySend('overlay:command', { type: 'start' });
  } catch (e) { reset(); throw e; }
}
async function processHistory(id, options = {}) {
  phase = 'processing'; processingId = id; changed();
  const behavior = { ...store.state.settings };
  overlaySend('overlay:status', { status: 'processing', text: 'Transcribiendo con tu orden guardado…' });
  try {
    const result = await transcribeWithFallback(store, id, options);
    store.markSuccess(id, result.text, result.route);
    // A failed paste must NEVER turn a successful transcription into a failed one.
    let insertion = { method: 'clipboard' };
    if (options.manual || liveInserted || !behavior.autoPaste) clipboard.writeText(result.text);
    else { try { insertion = await pasteText(result.text); } catch (_) { clipboard.writeText(result.text); insertion.warning = 'Texto copiado. El sistema no permitió pegar automáticamente.'; } }
    if (options.manual) insertion.warning = 'Reintento completado. Texto copiado; no se pega en otra ventana sin tu intervención.';
    else if (liveInserted) insertion.warning = 'Resultado final disponible en Historial y portapapeles; no se sobrescribió el texto en vivo.';
    store.updateHistory(id, { insertion: insertion.method, insertionWarning: insertion.warning || null });
    overlaySend('overlay:status', { status: 'done', text: result.text, warning: insertion.warning });
    if (options.manual) notify('Transcripción recuperada y copiada.');
    hideLater(insertion.warning ? 4500 : 1700);
  } catch (e) {
    quietFailure(id, String(e.message || e)); overlaySend('overlay:status', { status: 'failed', text: 'No se pudo transcribir. Tu audio sigue en Historial.', warning: e.message });
    notify('Audio guardado: puedes reintentar desde Historial.');
  } finally { liveAllowed = false; reset(); }
}
function validSender(event, role = 'either') {
  const windows = role === 'settings' ? [settingsWin] : role === 'overlay' ? [overlayWin] : [settingsWin, overlayWin];
  return windows.some(w => w && !w.isDestroyed() && event.sender === w.webContents && event.senderFrame === w.webContents.mainFrame);
}
function handle(channel, role, fn) {
  ipcMain.handle(channel, (e, ...args) => { if (!validSender(e, role)) throw new Error('Origen IPC no autorizado.'); return fn(...args); });
}
function activeCapture(id) { if (!id || id !== activeId) throw new Error('Esta grabación ya no está activa.'); }
async function abortCapture({ id, error }) {
  if (id && id !== activeId) return false;
  live?.close(); liveAllowed = false; clearTimeout(liveTimer); liveBuffer = '';
  quietFailure(id || activeId, `Captura interrumpida: ${String(error || 'Error de micrófono').slice(0, 400)}`);
  reset(); notify('No se pudo completar la captura. Revisa micrófono y audio local en Historial.'); return true;
}
app.whenReady().then(async () => {
  store = new Store(); store.recoverInterrupted(); store.cleanupCompletedAudio();
  session.defaultSession.setPermissionRequestHandler((wc, permission, cb, details = {}) => {
    const own = [settingsWin, overlayWin].some(w => w && w.webContents === wc);
    cb(own && permission === 'media' && !(details.mediaTypes || []).includes('video'));
  });
  session.defaultSession.setPermissionCheckHandler((wc, permission) => [settingsWin, overlayWin].some(w => w && w.webContents === wc) && permission === 'media');
  makeOverlay();
  const icon = nativeImage.createFromPath(path.join(__dirname, '..', 'assets', 'icon.png')).resize({ width: 22, height: 22 });
  tray = new Tray(icon); tray.on('click', settingsWindow); updateTray();
  updates.configureUpdater(data => send(settingsWin, 'update:status', data), {
    isBusy, beforeInstall: () => { app.isQuitting = true; }
  });
  await overlayReady;
  try { registerHotkey(store.state.settings.hotkey); } catch (e) { settingsWindow(); setTimeout(() => notify(e.message), 600); }
  if (!store.state.settings.onboardingComplete || process.argv.includes('--dev')) settingsWindow();
  try { app.setAsDefaultProtocolClient('alex-dictate'); } catch (_) {}
  const check = () => { if (!isBusy() && store.state.settings.checkUpdatesAutomatically) updates.checkForUpdates(); };
  setTimeout(check, 15000); updateTimer = setInterval(check, 6 * 60 * 60 * 1000);
  handleArgs(process.argv);
}).catch(error => { dialog.showErrorBox('Alex Dictate', `No se pudo iniciar. No se ha eliminado tu audio.\n${error.message}`); app.exit(1); });
function handleArgs(args = []) { if (args.some(a => a === '--toggle' || /^alex-dictate:\/\/(toggle|dictate)\/?$/i.test(a))) toggle().catch(e => notify(e.message)); }
app.on('second-instance', (_e, argv) => { if (store) handleArgs(argv); });
app.on('open-url', (e, url) => { e.preventDefault(); app.whenReady().then(() => handleArgs([url])); });
app.on('activate', () => { if (store) settingsWindow(); });
app.on('window-all-closed', () => {});
app.on('before-quit', event => {
  if (app.isQuitting) return;
  if (isBusy()) {
    event.preventDefault();
    if (phase === 'recording') {
      const choice = dialog.showMessageBoxSync({ type: 'question', buttons: ['Continuar dictando', 'Guardar y salir'], defaultId: 0, cancelId: 0, message: 'Hay un dictado activo.', detail: 'Guardar y salir conserva el audio sin enviarlo.' });
      if (choice === 1) { quitAfterSave = true; overlaySend('overlay:command', { type: 'cancel' }); }
    } else notify('Espera a que termine la operación para salir.');
  } else app.isQuitting = true;
});
app.on('will-quit', () => { clearInterval(updateTimer); globalShortcut.unregisterAll(); live?.close(); });

handle('state:get', 'either', () => ({ ...store.publicState(), runtime: { phase, activeId, processingId, hotkeyRegistered: Boolean(currentHotkey && globalShortcut.isRegistered(currentHotkey)) } }));
handle('update:get', 'settings', updates.getUpdateState);
handle('update:check', 'settings', updates.checkForUpdates);
handle('update:download', 'settings', updates.downloadUpdate);
handle('update:install', 'settings', updates.installUpdate);
handle('update:apply', 'settings', updates.applyUpdate);
handle('external:open', 'settings', async raw => {
  const url = new URL(String(raw));
  if (url.protocol !== 'https:' || url.username || url.password || !['openrouter.ai','console.groq.com','console.mistral.ai','platform.openai.com','github.com'].includes(url.hostname)) throw new Error('Enlace no permitido.');
  await shell.openExternal(url.href); return true;
});
handle('secret:set', 'settings', (name, value) => { store.setSecret(name, value); changed(); return true; });
handle('credential:test', 'settings', name => testCredential(name, store.getSecret(name)));
handle('settings:set', 'settings', patch => { store.setSettings(patch); changed(); return store.publicState(); });
handle('hotkey:set', 'settings', value => { if (isBusy()) throw new Error('Termina el dictado antes de cambiar el atajo.'); registerHotkey(value); changed(); return { ok: true, hotkey: currentHotkey }; });
handle('routing:set', 'settings', patch => { store.setRouting(patch); changed(); return store.publicState(); });
handle('dictionary:set', 'settings', items => { store.setDictionary(items); changed(); return true; });
handle('snippets:set', 'settings', items => { store.setSnippets(items); changed(); return true; });
handle('catalog:refresh', 'settings', async () => { const data = await fetchOpenRouterCatalog(store.getSecret('openrouter'), undefined, store.state.settings.openRouterRegion); store.setCatalog(data); changed(); return store.state.routing; });
handle('linux:setup-wayland', 'settings', launchWaylandSetup);
handle('diagnose', 'settings', async () => ({ ...(await diagnoseInjection()), secureStorage: store.secureStatus(),
  microphonePermission: process.platform === 'darwin' ? systemPreferences.getMediaAccessStatus('microphone') : 'Comprueba con Probar micrófono',
  accessibility: process.platform === 'darwin' ? systemPreferences.isTrustedAccessibilityClient(false) : null,
  hotkey: currentHotkey || store.state.settings.hotkey, hotkeyRegistered: Boolean(currentHotkey && globalShortcut.isRegistered(currentHotkey)),
  version: app.getVersion(), userData: store.dir, routeReadiness: store.state.routing.chain.map(id => { const r = routeById(id); return { id, ready: Boolean(r && store.getSecret(r.keyRef)), keyRef: r?.keyRef }; }) }));
ipcMain.on('recording:toggle', (e, data) => { if (validSender(e)) toggle(validSender(e, 'settings') && !data?.test).catch(error => notify(error.message)); });
ipcMain.on('window:settings', e => { if (validSender(e)) settingsWindow(); });
handle('recording:started', 'overlay', meta => {
  if (phase !== 'starting' || activeId) throw new Error('Ya hay una grabación activa.');
  const item = store.createPending({ microphoneLabel: String(meta?.microphoneLabel || '').slice(0, 200) }); activeId = item.id;
  try { store.beginPcmStream(item.id); phase = 'recording'; startLive(); changed(); return item.id; }
  catch (error) { quietFailure(item.id, error.message); reset(); throw error; }
});
handle('recording:pcm', 'overlay', payload => {
  activeCapture(payload?.id);
  if (!['recording', 'stopping'].includes(phase)) throw new Error('Captura detenida.');
  try { const bytes = Buffer.from(payload.chunk); store.appendPcmChunk(activeId, bytes); try { live?.push(bytes); } catch (_) { live?.close(); } return true; }
  catch (error) { captureFault = error.message; throw error; }
});
handle('recording:aborted', 'overlay', abortCapture);
handle('recording:finished', 'overlay', async payload => {
  activeCapture(payload?.id); const id = activeId; phase = 'stopping';
  try {
    if (captureFault) throw new Error(captureFault);
    store.finalizePcmStream(id); // metadata duration is computed from samples, not wall time
    await live?.finish(); flushInsertion(); await liveInsertion; liveAllowed = false;
    activeId = null; processHistory(id); return true;
  } catch (e) { await abortCapture({ id, error: e.message }); throw e; }
});
handle('recording:cancelled', 'overlay', async id => {
  activeCapture(id); live?.close(); liveAllowed = false; clearTimeout(liveTimer); liveBuffer = '';
  store.cancelRecording(id); reset(); overlayWin.hide();
  if (quitAfterSave) { app.isQuitting = true; app.quit(); }
  return true;
});
handle('history:retry', 'settings', id => {
  if (isBusy()) throw new Error('Termina el dictado actual antes de reintentar.');
  store.ensureWavForHistory(id); store.updateHistory(id, { status: 'queued', error: null });
  liveInserted = false; processHistory(id, { ignoreCooldown: true, manual: true }); return true;
});
handle('history:copy', 'settings', id => { const h = store.state.history.find(h => h.id === id); if (h?.text) clipboard.writeText(h.text); return true; });
handle('history:delete', 'settings', id => { if (id === activeId || id === processingId) throw new Error('No puedes borrar una operación activa.'); store.deleteHistory(id); changed(); return true; });
handle('history:save-audio', 'settings', async id => {
  if (id === activeId) throw new Error('Termina primero la grabación.');
  const h = store.state.history.find(h => h.id === id);
  if (!h?.audioPath || !fs.existsSync(h.audioPath)) throw new Error('El audio ya no está disponible.');
  if (h.audioPath.endsWith('.pcm.partial')) { try { store.ensureWavForHistory(id); } catch (_) {} }
  const file = store.state.history.find(h => h.id === id).audioPath;
  const result = await dialog.showSaveDialog(settingsWin, { defaultPath: path.join(app.getPath('downloads'), `alex-dictate-${id}${path.extname(file)}`) });
  if (!result.canceled && result.filePath) fs.copyFileSync(file, result.filePath); return !result.canceled;
});
