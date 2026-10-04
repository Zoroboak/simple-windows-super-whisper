// Integration test entry only; not included in installers. No DevTools attachment.
const { app, BrowserWindow, session } = require('electron');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
if (process.env.ALEX_QA !== '1' || !process.defaultApp) throw new Error('Test entry is development-only.');
const output = path.resolve('qa'); fs.mkdirSync(output, { recursive: true });
app.setPath('userData', process.env.ALEX_QA_DIR);
const failures = [], delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let step = 'startup';
const json = (name, value) => fs.writeFileSync(path.join(output, name), JSON.stringify(value, null, 2));
const log = value => { console.log(value); fs.appendFileSync(path.join(output, 'native-smoke.log'), value + '\n'); };
const js = (win, code) => win.webContents.executeJavaScript(code, true);
async function until(fn, message, timeout = 15000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { const value = await fn(); if (value) return value; await delay(75); }
  throw new Error(message);
}
async function image(win, name) { await delay(250); fs.writeFileSync(path.join(output, name + '.png'), (await win.webContents.capturePage()).toPNG()); }
app.on('browser-window-created', (_event, win) => {
  win.webContents.on('console-message', (_event, level, message) => log(`renderer ${level}: ${message}`));
  win.webContents.on('preload-error', (_event, _file, error) => failures.push(error.message));
  win.webContents.on('render-process-gone', (_event, details) => failures.push(details.reason));
});
require('./src/main');
app.whenReady().then(async () => {
  let settings, overlay;
  try {
    session.defaultSession.webRequest.onCompleted(details => {
      if (details.url.startsWith('alexui:')) log(`resource ${details.statusCode}: ${details.url}`);
    });
    settings = await until(() => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('/index.html')), 'Settings window missing');
    overlay = await until(() => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('/overlay.html')), 'Overlay missing');
    step = 'wizard'; log(step);
    await until(() => js(settings, 'Boolean(document.querySelector(".onboarding-modal"))'), 'Wizard did not appear');
    await image(settings, 'onboarding');
    await js(settings, 'document.querySelector("#closeModal").click()');
    step = 'capture'; log(step);
    await js(settings, 'window.alex.toggle(true)');
    await until(() => js(overlay, 'document.querySelector("#label").textContent === "Escuchando"'), 'Audio engine did not become ready', 16000);
    assert.equal(overlay.isFocusable(), false, 'overlay does not steal focus');
    await delay(1700); await image(overlay, 'recording');
    step = 'stop and preserve'; log(step);
    await js(settings, 'window.alex.toggle(true)');
    await until(() => js(settings, 'window.alex.state().then(s => s.runtime.phase === "idle")'), 'Capture did not finish');
    let state = await js(settings, 'window.alex.state()');
    assert.equal(state.history.length, 1); assert.equal(state.history[0].status, 'failed');
    const id = state.history[0].id;
    assert.ok(state.history[0].bytes > 44);
    const wav = fs.readFileSync(state.history[0].audioPath);
    assert.equal(wav.toString('ascii', 0, 4), 'RIFF'); assert.equal(wav.readUInt32LE(24), 16000); assert.equal(wav.readUInt16LE(22), 1);
    let peak = 0; for (let i = 44; i + 1 < wav.length; i += 2) peak = Math.max(peak, Math.abs(wav.readInt16LE(i)));
    assert.ok(peak > 0, 'synthetic microphone has non-silent samples');
    step = 'retry and IPC'; log(step);
    await js(settings, `window.alex.retry(${JSON.stringify(id)})`);
    await until(() => js(settings, 'window.alex.state().then(s => s.runtime.phase === "idle")'), 'Retry did not finish');
    assert.ok(fs.existsSync(state.history[0].audioPath));
    assert.equal(await js(settings, 'window.alex.recordingStarted({}).then(() => false, () => true)'), true);
    step = 'navigation'; log(step);
    for (const route of ['home', 'providers', 'settings', 'history', 'dictionary', 'snippets', 'diagnostics']) {
      await js(settings, `document.querySelector('[data-r="${route}"]').click()`);
      await delay(180); await image(settings, route);
    }
    const diagnosis = await js(settings, 'window.alex.diagnose()');
    assert.equal(diagnosis.version, require('./package.json').version);
    assert.deepEqual(failures, []);
    json('smoke-result.json', { passed: true, scope: 'Real Electron Linux; synthetic microphone; no DevTools; no cloud credentials',
      tests: ['startup', 'onboarding', 'AudioWorklet capture', 'non-silent mono PCM16 WAV', 'missing-key failure preserves audio', 'manual retry', 'privileged IPC refused', 'overlay non-focusable', 'all navigation screens'],
      bytes: wav.length, durationMs: state.history[0].durationMs, peak, failures });
    log('Native Electron smoke passed.'); app.exit(0);
  } catch (error) {
    log(`FAILED at ${step}: ${error.stack}`);
    json('smoke-result.json', { passed: false, step, error: error.stack, failures });
    for (const [win, name] of [[settings, 'settings'], [overlay, 'overlay']]) {
      if (!win || win.isDestroyed()) continue;
      try { await image(win, 'failure-' + name); } catch (_) {}
      try { json('failure-' + name + '.json', await js(win, '({text:document.body.innerText, state:typeof stage === "undefined" ? null : stage, audio:typeof audioCtx === "undefined" ? null : { state:audioCtx?.state, rate:audioCtx?.sampleRate }, origin:location.href})')); } catch (_) {}
    }
    app.exit(1);
  }
});
