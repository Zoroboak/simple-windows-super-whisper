const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const originalLoad = Module._load;
let registration;
Module._load = function (id, ...args) {
  if (id === 'electron') return { protocol: { registerSchemesAsPrivileged: schemes => { registration = schemes; }, handle: () => {} } };
  return originalLoad.call(this, id, ...args);
};
const { uiUrl, resolveResource, serve } = require('../src/local-ui');
Module._load = originalLoad;
test('local UI scheme is secure without disabling CSP', () => {
  assert.equal(registration[0].privileges.secure, true);
  assert.equal(registration[0].privileges.standard, true);
  assert.equal(registration[0].privileges.bypassCSP, undefined);
});
test('local UI serves only exact bundled assets, never arbitrary disk paths', () => {
  assert.ok(resolveResource(uiUrl('index.html')));
  assert.ok(resolveResource('alexui://desktop/assets/icon.png'));
  for (const url of ['file:///etc/passwd', 'https://desktop/renderer/app.js', 'alexui://evil/renderer/app.js',
    'alexui://desktop/src/store.js', 'alexui://desktop/state.json', 'alexui://desktop/%2e%2e/etc/passwd',
    'alexui://user:pass@desktop/renderer/app.js', 'alexui://desktop/renderer/app.js?file=state.json']) assert.equal(resolveResource(url), null);
});
test('AudioWorklet module is served with JavaScript MIME and no network redirection', async () => {
  const response = await serve({ url: uiUrl('pcm-worklet.js'), method: 'GET' });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /application\/javascript/);
  assert.match(await response.text(), /registerProcessor\('alex-pcm'/);
});
test('bundled UI protocol refuses writes and does not expose unknown files', async () => {
  assert.equal((await serve({ url: uiUrl('index.html'), method: 'POST' })).status, 405);
  assert.equal((await serve({ url: 'alexui://desktop/secrets.json', method: 'GET' })).status, 404);
});
