// Real Electron/Linux smoke, fake microphone, NO cloud key or paid request.
const { _electron: electron } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), assert = require('node:assert/strict');
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'alex-electron-'));
  const output = path.resolve('qa'); fs.mkdirSync(output, { recursive: true });
  const app = await electron.launch({ args: [path.resolve('.'), '--user-data-dir=' + dir,
    '--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
    env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: 'true' }, timeout: 45000 });
  const errors = [];
  app.process().stderr.on('data', d => fs.appendFileSync(path.join(output, 'electron-stderr.log'), d));
  try {
    let win;
    for (let n = 0; n < 100; n++) {
      win = app.windows().find(w => w.url().endsWith('/index.html'));
      if (win) break; await new Promise(r => setTimeout(r, 100));
    }
    assert.ok(win, 'settings window exists'); win.on('pageerror', e => errors.push(e.message));
    await win.waitForSelector('.onboarding-modal'); await win.screenshot({ path: path.join(output, 'onboarding.png') });
    await win.click('#closeModal');
    // Empty credentials: recording must survive the expected network configuration failure.
    await win.evaluate(() => window.alex.toggle(true));
    await win.waitForFunction(async () => (await window.alex.state()).runtime.phase === 'recording', undefined, { timeout: 15000 });
    await win.waitForTimeout(1500);
    const overlay = app.windows().find(w => w.url().endsWith('/overlay.html'));
    if (overlay) await overlay.screenshot({ path: path.join(output, 'recording.png') });
    await win.evaluate(() => window.alex.toggle(true));
    await win.waitForFunction(async () => (await window.alex.state()).runtime.phase === 'idle', undefined, { timeout: 15000 });
    let state = await win.evaluate(() => window.alex.state());
    assert.equal(state.history.length, 1); assert.equal(state.history[0].status, 'failed');
    assert.ok(state.history[0].bytes > 44, 'recording has PCM samples');
    const audio = fs.readFileSync(state.history[0].audioPath); assert.equal(audio.toString('ascii', 0, 4), 'RIFF');
    assert.equal(audio.readUInt32LE(24), 16000); assert.equal(audio.readUInt16LE(22), 1);
    await win.evaluate(async id => { await window.alex.retry(id); }, state.history[0].id);
    await win.waitForFunction(async () => (await window.alex.state()).runtime.phase === 'idle');
    state = await win.evaluate(() => window.alex.state()); assert.ok(fs.existsSync(state.history[0].audioPath));
    // Access rules are enforced on the main process, not merely in the interface.
    const refused = await win.evaluate(async () => { try { await window.alex.recordingStarted({}); return false; } catch { return true; } });
    assert.equal(refused, true, 'settings renderer cannot start privileged audio lifecycle IPC');
    await win.click('[data-r=settings]'); await win.screenshot({ path: path.join(output, 'settings.png') });
    const diag = await win.evaluate(() => window.alex.diagnose()); assert.equal(diag.version, '1.2.0');
    await win.click('[data-r=history]'); await win.screenshot({ path: path.join(output, 'history.png') });
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, 'smoke-result.json'), JSON.stringify({ passed: true, scope: 'Electron Linux, fake microphone, no cloud calls',
      tests: ['startup', 'wizard', 'AudioWorklet capture', 'PCM16 WAV durability', 'missing-key failure', 'retry preserves audio', 'IPC role rejection', 'settings', 'history'],
      bytes: audio.length, durationMs: state.history[0].durationMs, errors }, null, 2));
  } finally { await app.close(); fs.rmSync(dir, { recursive: true, force: true }); }
})().catch(e => { console.error(e); process.exit(1); });
