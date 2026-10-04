const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { Store } = require('../src/store');
const { createWavBuffer, parseWav, splitWavBuffer } = require('../src/audio');
const { changeHotkey, validateAccelerator } = require('../src/hotkey');
const { updatePolicy } = require('../src/update-policy');
const { LivePreview } = require('../src/live');
const { requestText } = require('../src/http');
const { endpointSummary } = require('../src/catalog');
const providers = require('../src/providers');
function fixture(t, backend = 'kwallet6') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'alex-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const electron = { app: { getPath: () => dir, getVersion: () => '1.2.0' }, safeStorage: {
    isEncryptionAvailable: () => true, getSelectedStorageBackend: () => backend,
    encryptString: s => Buffer.from(`sealed:${s}`), decryptString: b => b.toString().slice(7)
  }};
  return { store: new Store({ directory: dir, electron }), electron, dir };
}
function recorded(store) { const h = store.createPending(); store.beginPcmStream(h.id); store.appendPcmChunk(h.id, Buffer.alloc(16000)); return h.id; }
test('PCM is recoverable after process restart and duration comes from samples', t => {
  const { store, electron, dir } = fixture(t); const id = recorded(store);
  const reopened = new Store({ directory: dir, electron }); reopened.recoverInterrupted();
  const h = reopened.state.history.find(h => h.id === id);
  assert.equal(h.status, 'queued'); assert.equal(h.durationMs, 500); assert.equal(parseWav(fs.readFileSync(h.audioPath)).pcm.length, 16000);
});
test('cancel means save without sending, never discard', t => {
  const { store } = fixture(t); const id = recorded(store); store.cancelRecording(id);
  const h = store.state.history[0]; assert.equal(h.status, 'cancelled'); assert.ok(fs.existsSync(h.audioPath));
  assert.ok(store.ensureWavForHistory(id).endsWith('.wav'));
});
test('failed dictations survive cleanup and successful zero-day retention works', t => {
  const { store } = fixture(t); const id = recorded(store); store.finalizePcmStream(id); store.markFailure(id, 'offline');
  store.setSettings({ keepCompletedAudioDays: 0 }); store.cleanupCompletedAudio(); assert.ok(fs.existsSync(store.state.history[0].audioPath));
  store.markSuccess(id, 'hola', { id: 'groq-turbo', model: 'whisper-large-v3-turbo' });
  store.state.history[0].updatedAt = '2020-01-01'; store.cleanupCompletedAudio(); assert.equal(store.state.history[0].audioPath, null);
});
test('statistics count dictations once, even after successful retry', t => {
  const { store } = fixture(t); const id = recorded(store); store.finalizePcmStream(id);
  store.markSuccess(id, 'hola mundo', { id: 'x' }); store.markSuccess(id, 'hola mundo', { id: 'x' });
  assert.equal(store.computedStats().successful, 1); assert.equal(store.computedStats().totalWords, 2);
});
test('PCM is retained when final metadata commit fails', t => {
  const { store } = fixture(t); const id = recorded(store); const partial = store.state.history[0].audioPath;
  store.updateHistory = () => { throw new Error('disk full'); };
  assert.throws(() => store.finalizePcmStream(id), /disk full/); assert.ok(fs.existsSync(partial));
});
test('invalid settings and empty chains do not replace saved settings', t => {
  const { store } = fixture(t); const old = JSON.stringify(store.state.settings);
  assert.throws(() => store.setSettings({ autoPaste: 'yes' })); assert.throws(() => store.setSettings({ hotkey: 'X' }));
  assert.throws(() => store.setSettings({ keepCompletedAudioDays: NaN })); assert.equal(JSON.stringify(store.state.settings), old);
  assert.throws(() => store.setRouting({ chain: [] }));
});
test('API secrets are never exposed through public state', t => {
  const { store } = fixture(t); store.setSecret('groq', 'test-secret');
  const publicState = store.publicState(); assert.equal(publicState.secrets.groq, true); assert.ok(!JSON.stringify(publicState).includes('test-secret'));
  store.setSecret('groq', ''); assert.equal(store.getSecret('groq'), null);
});
test('weak Linux basic_text key storage is rejected', { skip: process.platform !== 'linux' }, t => {
  const { store } = fixture(t, 'basic_text'); assert.throws(() => store.setSecret('groq', 'x'), /cifrado débil/);
});
test('global hotkey rollback keeps old shortcut if saving fails', () => {
  const active = new Set(['Control+Space']);
  const api = { isRegistered: a => active.has(a), register: a => { active.add(a); return true; }, unregister: a => active.delete(a) };
  assert.throws(() => changeHotkey(api, 'Control+Space', 'Control+Shift+Space', () => {}, () => { throw new Error('disk'); }), /disk/);
  assert.deepEqual([...active], ['Control+Space']);
});
test('conflicting hotkey never unregisters previous key', () => {
  let removed = false;
  assert.throws(() => changeHotkey({ register: () => false, isRegistered: () => false, unregister: () => { removed = true; } }, 'Control+Space', 'Alt+F8', () => {}, () => {}));
  assert.equal(removed, false);
});
test('hotkey validation rejects bare typing keys but permits function keys', () => {
  assert.throws(() => validateAccelerator('A')); assert.equal(validateAccelerator('F8'), 'F8');
});
test('platform update capabilities distinguish unsigned Mac and portable Windows', () => {
  assert.equal(updatePolicy({ packaged: true, platform: 'darwin', signedMac: false }).canAutoInstall, false);
  assert.equal(updatePolicy({ packaged: true, platform: 'win32', portable: true }).canAutoInstall, false);
  assert.equal(updatePolicy({ packaged: true, platform: 'linux', appImage: true }).canAutoInstall, true);
  assert.equal(updatePolicy({ packaged: true, platform: 'linux', packageType: 'deb' }).canAutoInstall, true);
  assert.equal(updatePolicy({ packaged: false, platform: 'linux' }).canAutoInstall, false);
});
test('all audio segments respect endpoint cap with exact sample conservation', () => {
  const pcm = Buffer.alloc(32000 * 91 + 600); for (let i = 0; i < pcm.length; i += 2) pcm.writeInt16LE((i % 16000) - 8000, i);
  const parts = splitWavBuffer(createWavBuffer(pcm), 42);
  assert.ok(parts.every(p => p.endSec - p.startSec <= 42));
  assert.deepEqual(Buffer.concat(parts.map(p => parseWav(p.buffer).pcm)), pcm);
});
test('invalid truncated WAV formats are rejected', () => {
  const wav = createWavBuffer(Buffer.alloc(16000)); wav.writeUInt32LE(2, 16); assert.throws(() => parseWav(wav));
});
test('Spanish snippets honor accents and literal dollar sequences', () => {
  assert.equal(providers.postProcess('Di acción ahora', { snippets: [{ trigger: 'acción', expansion: '$& 20 €' }], settings: {} }), 'Di $& 20 € ahora');
});
test('endpoint units do not guess seconds based on magnitude', () => { assert.equal(endpointSummary({ latency: 60 }).latencyMs, 60000); });
test('invalid JSON or empty response cannot be pasted as a transcript', () => {
  const res = { ok: true }; assert.throws(() => providers.parseResponseText('<html>failure</html>', res));
  assert.throws(() => providers.parseResponseText('{"text":{}}', res));
});
test('request deadline includes the response body, not just response headers', async t => {
  const original = global.fetch; t.after(() => { global.fetch = original; });
  global.fetch = async (_url, opts) => ({ text: () => new Promise((_resolve, reject) => opts.signal.addEventListener('abort', () => { const e = new Error('aborted'); e.name = 'AbortError'; reject(e); })) });
  await assert.rejects(requestText('https://test.invalid', {}, 15), e => e.code === 'TIMEOUT');
});
test('fixed fallback order is used without any catalog lookup', async t => {
  const { store } = fixture(t); const id = recorded(store); store.finalizePcmStream(id);
  store.setSecret('openrouter', 'test'); store.setSecret('groq', 'test');
  store.setRouting({ chain: ['openrouter-mai2', 'groq-turbo', 'groq-large'] }); providers.resetRouteHealth();
  const original = global.fetch, urls = []; t.after(() => { global.fetch = original; providers.resetRouteHealth(); });
  global.fetch = async (url, options) => { urls.push(url); return new Response(JSON.stringify(url.includes('openrouter') ? { error: { message: 'upstream offline' } } : { text: 'Hola Pedro' }), { status: url.includes('openrouter') ? 503 : 200 }); };
  const result = await providers.transcribeWithFallback(store, id);
  assert.equal(result.route.id, 'groq-turbo'); assert.equal(urls.length, 2); assert.ok(urls.every(url => url.endsWith('/audio/transcriptions')));
  assert.ok(fs.existsSync(store.state.history[0].audioPath));
});
test('manual retry bypasses circuit cooldown, automatic dictation respects it', async t => {
  const { store } = fixture(t); const id = recorded(store); store.finalizePcmStream(id); store.setSecret('groq', 'test'); store.setRouting({ chain: ['groq-turbo'] });
  providers.resetRouteHealth(); providers.markRouteFailure('groq-turbo', { status: 429 });
  const original = global.fetch; let called = 0; t.after(() => { global.fetch = original; providers.resetRouteHealth(); });
  global.fetch = async () => { called++; return new Response('{"text":"recuperado"}'); };
  await assert.rejects(providers.transcribeWithFallback(store, id), /cooldown/); assert.equal(called, 0);
  await providers.transcribeWithFallback(store, id, { ignoreCooldown: true }); assert.equal(called, 1);
});
class FakeSocket {
  constructor(url, options) { this.url = url; this.options = options; this.readyState = 1; this.sent = []; this.bufferedAmount = 0; }
  send(s) { this.sent.push(JSON.parse(s)); } close() {}
  message(data) { this.onmessage({ data: JSON.stringify(data) }); }
}
test('realtime keeps initial frames until authenticated session is ready', async () => {
  const texts = [], live = new LivePreview(FakeSocket, 'secret', 650, t => texts.push(t), () => {});
  live.push(Buffer.alloc(100)); assert.equal(live.socket.sent.length, 0);
  live.socket.message({ type: 'session.created' }); assert.equal(live.socket.sent[0].type, 'session.update');
  assert.equal(live.socket.sent[1].type, 'input_audio.append');
  live.socket.message({ type: 'transcription.text.delta', text: 'Hola' });
  const done = live.finish(); live.socket.message({ type: 'transcription.done' });
  assert.equal(await done, 'Hola'); assert.equal(live.socket.options.headers.Authorization, 'Bearer secret');
  assert.ok(live.socket.sent.some(m => m.type === 'input_audio.end'));
});
test('realtime failure frees resources and never owns persisted audio', () => {
  const warnings = []; const live = new LivePreview(FakeSocket, 'secret', 650, () => {}, m => warnings.push(m));
  live.socket.onerror(); assert.equal(live.closed, true); assert.equal(warnings.length, 1); live.push(Buffer.alloc(16)); assert.equal(live.queue.length, 0);
});
for (const rate of [16000, 44100, 48000]) test(`AudioWorklet resamples ${rate} Hz without per-block drift`, () => {
  let Processor; const chunks = [];
  const context = { sampleRate: rate, AudioWorkletProcessor: class { constructor() { this.port = { postMessage: m => { if (m.pcm) chunks.push(Buffer.from(m.pcm)); } }; } }, registerProcessor: (_n, p) => { Processor = p; } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../renderer/pcm-worklet.js'), 'utf8'), context);
  const worklet = new Processor(); for (let n = 0; n < rate; n += 128) worklet.process([[new Float32Array(Math.min(128, rate - n)).fill(0.5)]]);
  worklet.port.onmessage({ data: 'flush' }); const pcm = Buffer.concat(chunks);
  assert.equal(pcm.length, 32000); assert.equal(pcm.readInt16LE(0), 16384);
});
