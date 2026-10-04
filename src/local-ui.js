// A secure, standard, local-only origin for bundled UI and AudioWorklet modules.
const { protocol } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const MIME = Object.freeze({
  '/renderer/index.html': 'text/html; charset=utf-8',
  '/renderer/overlay.html': 'text/html; charset=utf-8',
  '/renderer/app.js': 'application/javascript; charset=utf-8',
  '/renderer/overlay.js': 'application/javascript; charset=utf-8',
  '/renderer/pcm-worklet.js': 'application/javascript; charset=utf-8',
  '/renderer/style.css': 'text/css; charset=utf-8',
  '/renderer/overlay.css': 'text/css; charset=utf-8',
  '/assets/icon.png': 'image/png'
});
protocol.registerSchemesAsPrivileged([{ scheme: 'alexui', privileges: {
  standard: true, secure: true, supportFetchAPI: true, corsEnabled: true
} }]);
function resolveResource(raw) {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'alexui:' || url.host !== 'desktop' || url.username || url.password || url.search || url.hash) return null;
    if (!Object.hasOwn(MIME, url.pathname)) return null;
    return { file: path.join(__dirname, '..', url.pathname.slice(1)), mime: MIME[url.pathname] };
  } catch (_) { return null; }
}
function uiUrl(name) {
  const url = `alexui://desktop/renderer/${name}`;
  if (!resolveResource(url)) throw new Error('Recurso de interfaz no permitido.');
  return url;
}
async function serve(request) {
  if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 405 });
  const resource = resolveResource(request.url);
  if (!resource) return new Response(null, { status: 404 });
  try {
    const bytes = await fs.readFile(resource.file);
    return new Response(request.method === 'HEAD' ? null : bytes, { headers: {
      'Content-Type': resource.mime, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store'
    } });
  } catch (_) { return new Response(null, { status: 404 }); }
}
function installLocalUi() { protocol.handle('alexui', serve); }
module.exports = { installLocalUi, uiUrl, resolveResource, serve };
