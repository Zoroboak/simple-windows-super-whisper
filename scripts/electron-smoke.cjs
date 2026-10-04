// Real Electron + fake microphone. No cloud keys, paid requests or user data.
const { _electron: electron } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), assert = require('node:assert/strict');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'alex-electron-'));
  const output = path.resolve('qa'); fs.mkdirSync(output, { recursive: true });
  let app, step = 'launch'; const errors = [];
  const watchdog = setTimeout(() => { console.error('Smoke timed out at:', step); app?.process()?.kill('SIGKILL'); process.exit(1); }, 120000);
  const record = (name, value) => fs.writeFileSync(path.join(output, name), JSON.stringify(value, null, 2));
  try {
    app = await electron.launch({ args: [path.resolve('.'), '--user-data-dir=' + dir,
      '--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
      env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: 'true' }, timeout: 45000 });
    app.context().setDefaultTimeout(10000);
    app.process().stderr.on('data', d => fs.appendFileSync(path.join(output, 'electron-stderr.log'), d));
    const listen = win => {
      win.on('pageerror', e => { errors.push(e.message); console.error('Renderer error:', e.message); });
      win.on('console', msg => fs.appendFileSync(path.join(output, 'renderer-console.log'), `${win.url()} ${msg.type()}: ${msg.text()}\n`));
    };
    app.on('window', listen); app.windows().forEach(listen);
    let win, overlay;
    for (let n = 0; n < 100; n++) {
      win = app.windows().find(w => w.url().endsWith('/index.html'));
      overlay = app.windows().find(w => w.url().endsWith('/overlay.html'));
      if (win && overlay) break; await delay(100);
    }
    assert.ok(win && overlay, 'both windows exist');
    step = 'wizard'; console.log(step);
    await win.waitForSelector('.onboarding-modal'); await win.screenshot({ path: path.join(output, 'onboarding.png') });
    await win.click('#closeModal');
    step = 'start capture'; console.log(step);
    await win.evaluate(() => window.alex.toggle(true));
    await overlay.waitForFunction(() => document.querySelector('#label').textContent === 'Escuchando', undefined, { timeout: 15000 });
    await win.waitForFunction(async () => (await window.alex.state()).runtime.phase === 'recording', undefined, { timeout: 5000 });
    await delay(1600); await overlay.screenshot({ path: path.join(output, 'recording.png') });
    step = 'stop capture'; console.log(step);
    await win.evaluate(() => window.alex.toggle(true));
    await win.waitForFunction(async () => (await window.alex.state()).runtime.phase === 'idle', undefined, { timeout: 15000 });
    let state = await win.evaluate(() => window.alex.state());
    assert.equal(state.history.length, 1); assert.equal(state.history[0].status, 'failed');
    assert.ok(state.history[0].bytes > 44, 'PCM samples persisted before expected missing-key failure');
    const audio = fs.readFileSync(state.history[0].audioPath);
    assert.equal(audio.toString('ascii', 0, 4), 'RIFF'); assert.equal(audio.readUInt32LE(24), 16000); assert.equal(audio.readUInt16LE(22), 1);
    step = 'manual retry'; console.log(step);
    await win.evaluate(id => window.alex.retry(id), state.history[0].id);
    await win.waitForFunction(async () => (await window.alex.state()).runtime.phase === 'idle', undefined, { timeout: 10000 });
    state = await win.evaluate(() => window.alex.state()); assert.ok(fs.existsSync(state.history[0].audioPath));
    const refused = await win.evaluate(async () => { try { await window.alex.recordingStarted({}); return false; } catch { return true; } });
    assert.equal(refused, true, 'settings cannot invoke privileged capture IPC');
    step = 'screens'; console.log(step);
    for (const route of ['home', 'providers', 'settings', 'history', 'dictionary', 'snippets', 'diagnostics', 'updates']) {
      const button = win.locator(`[data-r=${route}]`);
      if (!await button.count()) continue;
      await button.click(); await delay(150); await win.screenshot({ path: path.join(output, `${route}.png`) });
    }
    const diag = await win.evaluate(() => window.alex.diagnose());
    assert.equal(diag.version, require('../package.json').version); assert.deepEqual(errors, []);
    record('smoke-result.json', { passed: true, scope: 'Electron Linux; fake microphone; no cloud calls',
      tests: ['startup', 'wizard', 'AudioWorklet capture ready', 'PCM16 WAV durability', 'missing-key failure', 'retry preserves audio', 'IPC role rejection', 'all sidebar routes'],
      bytes: audio.length, durationMs: state.history[0].durationMs, errors });
    step = 'complete'; console.log('Electron smoke passed.');
  } catch (error) {
    console.error(`FAILED at ${step}:`, error);
    record('smoke-result.json', { passed: false, step, error: error.stack, errors });
    if (app) {
      for (const w of app.windows()) {
        try { await w.screenshot({ path: path.join(output, `failure-${w.url().includes('overlay') ? 'overlay' : 'settings'}.png`), timeout: 2000 }); } catch (_) {}
        try { const state = await w.evaluate(() => window.alex.state()); record('failure-state.json', state); } catch (_) {}
      }
    }
    process.exitCode = 1;
  } finally {
    // Tests must not hang on the production "save active recording before quit" dialog.
    if (app) {
      await Promise.race([app.evaluate(({ app }) => app.exit(0)).catch(() => {}), delay(2000)]);
      if (app.process().exitCode === null) app.process().kill('SIGKILL');
    }
    clearTimeout(watchdog); fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch(e => { console.error(e); process.exit(1); });
