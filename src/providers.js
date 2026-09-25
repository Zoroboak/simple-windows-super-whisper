const fs = require('fs');
const { splitWavBuffer } = require('./audio');
const { routeById } = require('./catalog');

const routeHealth = new Map();

function parseRetryAfter(value, now = Date.now()) {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, Math.round(seconds * 1000));
  const at = Date.parse(value);
  return Number.isFinite(at) ? Math.max(0, at - now) : null;
}

function cooldownForError(error, failures = 1) {
  const status = Number(error?.status || 0);
  if (status === 429) return Math.min(180000, Math.max(15000, Number(error?.retryAfterMs || 30000)));
  if (status === 401 || status === 403) return 120000;
  if (status === 400 || status === 404 || status === 422) return 300000;
  const base = error?.code === 'TIMEOUT' || status >= 500 || !status ? 10000 : 8000;
  return Math.min(120000, base * (2 ** Math.max(0, failures - 1)));
}

function markRouteFailure(routeId, error, now = Date.now()) {
  const previous = routeHealth.get(routeId);
  const failures = (previous?.failures || 0) + 1;
  const cooldownMs = cooldownForError(error, failures);
  const next = { failures, blockedUntil: now + cooldownMs, reason: String(error?.message || error), status: error?.status || null };
  routeHealth.set(routeId, next);
  return next;
}

function markRouteSuccess(routeId) { routeHealth.delete(routeId); }
function routeCooldown(routeId, now = Date.now()) {
  const h = routeHealth.get(routeId);
  if (!h) return null;
  if (h.blockedUntil <= now) { routeHealth.delete(routeId); return null; }
  return { ...h, remainingMs: h.blockedUntil - now };
}
function resetRouteHealth() { routeHealth.clear(); }

function dictionaryTerms(dictionary = []) {
  return dictionary.map(x => typeof x === 'string' ? x : x.term).map(x => String(x || '').trim()).filter(Boolean).slice(0, 180);
}

function applyDictionaryPrompt(dictionary = []) {
  const terms = dictionaryTerms(dictionary);
  if (!terms.length) return '';
  return `Preferred spellings and vocabulary: ${terms.join(', ')}. Preserve these spellings when spoken.`;
}

function postProcess(text, state) {
  let out = String(text || '').trim();
  for (const snip of state.snippets || []) {
    const trigger = String(snip.trigger || '').trim();
    if (!trigger) continue;
    const escaped = trigger.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), snip.expansion || '');
  }
  if (state.settings.cleanupFillers) {
    out = out.replace(/\b(um+|uh+|eh+|em+)\b[,.]?\s*/gi, '').replace(/\s{2,}/g, ' ').trim();
  }
  return out;
}

function joinSegments(parts) {
  return parts.map(x => String(x || '').trim()).filter(Boolean).join(' ').replace(/\s+([,.;:!?])/g, '$1').replace(/\s{2,}/g, ' ').trim();
}

function parseResponseText(raw, res) {
  let data;
  try { data = JSON.parse(raw); } catch (_) { data = { text: raw }; }
  if (!res.ok) {
    const msg = data?.error?.message || data?.message || `${res.status} ${res.statusText}`;
    const e = new Error(msg);
    e.status = res.status;
    e.retryAfterMs = parseRetryAfter(res.headers.get('retry-after'));
    throw e;
  }
  if (!data?.text) throw new Error('El proveedor respondió sin texto.');
  return data;
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try { return await fetch(url, { ...options, signal: ctrl.signal }); }
  catch (e) {
    if (e?.name === 'AbortError') { const err = new Error(`Timeout tras ${Math.round(timeoutMs / 1000)} s.`); err.code = 'TIMEOUT'; throw err; }
    throw e;
  } finally { clearTimeout(timer); }
}

function openRouterBody(route, wavBuffer, state) {
  const body = { model: route.model, input_audio: { data: wavBuffer.toString('base64'), format: 'wav' } };
  const language = state.settings.language;
  if (language && language !== 'auto') body.language = language;
  const terms = dictionaryTerms(state.dictionary);
  const prompt = applyDictionaryPrompt(state.dictionary);
  if (prompt) body.prompt = prompt;
  if (terms.length) {
    body.provider = { options: {
      groq: { prompt },
      azure: { phraseList: { phrases: terms }, enhancedMode: { modelOptions: { transcribeStyle: 'clean' } } }
    } };
  }
  return body;
}

async function transcribeOpenRouterSegment(route, apiKey, wavBuffer, state) {
  const domain = state.settings.openRouterRegion === 'eu' ? 'https://eu.openrouter.ai' : 'https://openrouter.ai';
  const res = await fetchWithTimeout(`${domain}/api/v1/audio/transcriptions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://github.com/Zoroboak/simple-windows-super-whisper',
      'X-OpenRouter-Title': 'Alex Dictate'
    },
    body: JSON.stringify(openRouterBody(route, wavBuffer, state))
  }, Number(route.requestTimeoutMs || 25000));
  const raw = await res.text();
  const data = parseResponseText(raw, res);
  return {
    text: data.text,
    costUsd: Number(data?.usage?.cost || 0) || null,
    upstream: res.headers.get('x-openrouter-provider') || data?.provider || null,
    generationId: res.headers.get('x-generation-id') || null
  };
}

async function transcribeMultipartSegment(route, apiKey, wavBuffer, state) {
  const form = new FormData();
  form.append('file', new Blob([wavBuffer], { type: 'audio/wav' }), 'dictation.wav');
  form.append('model', route.model);
  const language = state.settings.language;
  if (language && language !== 'auto') form.append('language', language);
  const prompt = applyDictionaryPrompt(state.dictionary);
  if (prompt) form.append('prompt', prompt);
  form.append('response_format', 'json');
  const res = await fetchWithTimeout(`${route.baseUrl.replace(/\/$/, '')}/audio/transcriptions`, {
    method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, body: form
  }, Number(route.requestTimeoutMs || 30000));
  const raw = await res.text();
  const data = parseResponseText(raw, res);
  return { text: data.text, costUsd: null, upstream: route.name, generationId: null };
}

async function transcribeMistralSegment(route, apiKey, wavBuffer, state) {
  const form = new FormData();
  form.append('file', new Blob([wavBuffer], { type: 'audio/wav' }), 'dictation.wav');
  form.append('model', route.model);
  const language = state.settings.language;
  if (language && language !== 'auto') form.append('language', language);
  const terms = dictionaryTerms(state.dictionary);
  if (terms.length) form.append('context_bias', JSON.stringify(terms.slice(0, 100)));
  const res = await fetchWithTimeout(`${route.baseUrl.replace(/\/$/, '')}/audio/transcriptions`, {
    method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, body: form
  }, Number(route.requestTimeoutMs || 30000));
  const raw = await res.text();
  const data = parseResponseText(raw, res);
  return { text: data.text, costUsd: null, upstream: 'Mistral', generationId: null };
}

async function transcribeRoute(route, apiKey, audioPath, state) {
  if (!apiKey) throw new Error(`Falta credencial ${route.keyRef}.`);
  const audio = fs.readFileSync(audioPath);
  const segments = splitWavBuffer(audio, Number(route.maxSegmentSeconds || 42), { searchSeconds: 4, minSegmentSeconds: 8 });
  const texts = [];
  let costUsd = 0;
  let upstream = null;
  for (const part of segments) {
    let result;
    if (route.transport === 'openrouter-json') result = await transcribeOpenRouterSegment(route, apiKey, part.buffer, state);
    else if (route.transport === 'mistral-multipart') result = await transcribeMistralSegment(route, apiKey, part.buffer, state);
    else result = await transcribeMultipartSegment(route, apiKey, part.buffer, state);
    texts.push(result.text);
    if (Number.isFinite(result.costUsd)) costUsd += result.costUsd;
    if (result.upstream) upstream = result.upstream;
  }
  return { text: postProcess(joinSegments(texts), state), segments: segments.length, costUsd: costUsd || null, upstream };
}

async function transcribeWithFallback(store, historyId, options = {}) {
  const item = store.state.history.find(x => x.id === historyId);
  if (!item?.audioPath || !fs.existsSync(item.audioPath)) throw new Error('No existe el audio local para este dictado.');
  const chain = store.state.routing?.chain || [];
  if (!chain.length) throw new Error('La cadena de transcripción está vacía.');

  let lastError = null;
  let attempted = 0;
  let credentialed = 0;
  let cooldownSkipped = 0;
  for (const routeId of chain) {
    const route = routeById(routeId);
    if (!route) continue;
    const key = store.getSecret(route.keyRef);
    if (!key) {
      store.addAttempt(historyId, { route: route.id, model: route.model, status: 'skipped', reason: `Sin API key ${route.keyRef}` });
      continue;
    }
    credentialed += 1;
    const cooldown = options.ignoreCooldown ? null : routeCooldown(route.id);
    if (cooldown) {
      cooldownSkipped += 1;
      store.addAttempt(historyId, {
        route: route.id, model: route.model, status: 'cooldown',
        reason: `Ruta omitida temporalmente tras un fallo reciente (${Math.ceil(cooldown.remainingMs / 1000)} s).`
      });
      continue;
    }
    attempted += 1;
    const started = Date.now();
    store.updateHistory(historyId, { status: 'processing', provider: route.id, model: route.model, error: null });
    try {
      const result = await transcribeRoute(route, key, item.audioPath, store.state);
      markRouteSuccess(route.id);
      store.addAttempt(historyId, {
        route: route.id, model: route.model, status: 'ok', latencyMs: Date.now() - started,
        segments: result.segments, costUsd: result.costUsd, upstream: result.upstream
      });
      return { ...result, route };
    } catch (e) {
      lastError = e;
      markRouteFailure(route.id, e);
      store.addAttempt(historyId, {
        route: route.id, model: route.model, status: 'error', latencyMs: Date.now() - started,
        error: String(e.message || e), httpStatus: e.status || null
      });
    }
  }
  if (!credentialed) throw new Error('Ninguna ruta de la cadena tiene una API key configurada. Abre Proveedores y añade OpenRouter o Groq.');
  if (!attempted && cooldownSkipped) throw new Error('Todas las rutas con credencial están temporalmente en cooldown tras fallos recientes. El WAV sigue guardado para reintentar.');
  throw lastError || new Error('Todos los proveedores fallaron.');
}

module.exports = {
  transcribeWithFallback, transcribeRoute, transcribeOpenRouterSegment, transcribeMultipartSegment, transcribeMistralSegment,
  postProcess, applyDictionaryPrompt, dictionaryTerms, joinSegments,
  parseRetryAfter, cooldownForError, markRouteFailure, markRouteSuccess, routeCooldown, resetRouteHealth
};
