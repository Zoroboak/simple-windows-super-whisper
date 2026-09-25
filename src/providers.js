const fs = require('fs');
const path = require('path');
const { splitWavBuffer } = require('./audio');
const { routeById } = require('./catalog');

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
    if (e?.name === 'AbortError') throw new Error(`Timeout tras ${Math.round(timeoutMs / 1000)} s.`);
    throw e;
  } finally { clearTimeout(timer); }
}

function openRouterBody(route, wavBuffer, state) {
  const body = {
    model: route.model,
    input_audio: { data: wavBuffer.toString('base64'), format: 'wav' }
  };
  const language = state.settings.language;
  if (language && language !== 'auto') body.language = language;
  const terms = dictionaryTerms(state.dictionary);
  const prompt = applyDictionaryPrompt(state.dictionary);
  if (prompt) body.prompt = prompt;
  if (terms.length) {
    body.provider = { options: {
      groq: { prompt },
      azure: {
        phraseList: { phrases: terms },
        enhancedMode: { modelOptions: { transcribeStyle: 'clean' } }
      }
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
  }, 57000);
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
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form
  }, 120000);
  const raw = await res.text();
  const data = parseResponseText(raw, res);
  return { text: data.text, costUsd: null, upstream: route.name, generationId: null };
}

async function transcribeRoute(route, apiKey, audioPath, state) {
  if (!apiKey) throw new Error(`Falta credencial ${route.keyRef}.`);
  const audio = fs.readFileSync(audioPath);
  const segments = splitWavBuffer(audio, Number(route.maxSegmentSeconds || 42), { searchSeconds: 4, minSegmentSeconds: 8 });
  const texts = [];
  let costUsd = 0;
  let upstream = null;
  for (let index = 0; index < segments.length; index++) {
    const part = segments[index];
    const result = route.transport === 'openrouter-json'
      ? await transcribeOpenRouterSegment(route, apiKey, part.buffer, state)
      : await transcribeMultipartSegment(route, apiKey, part.buffer, state);
    texts.push(result.text);
    if (Number.isFinite(result.costUsd)) costUsd += result.costUsd;
    if (result.upstream) upstream = result.upstream;
  }
  return { text: postProcess(joinSegments(texts), state), segments: segments.length, costUsd: costUsd || null, upstream };
}

async function transcribeWithFallback(store, historyId) {
  const item = store.state.history.find(x => x.id === historyId);
  if (!item?.audioPath || !fs.existsSync(item.audioPath)) throw new Error('No existe el audio local para este dictado.');
  const chain = store.state.routing?.chain || [];
  if (!chain.length) throw new Error('La cadena de transcripción está vacía.');

  let lastError = null;
  let attempted = 0;
  for (const routeId of chain) {
    const route = routeById(routeId);
    if (!route) continue;
    const key = store.getSecret(route.keyRef);
    if (!key) {
      store.addAttempt(historyId, { route: route.id, model: route.model, status: 'skipped', reason: `Sin API key ${route.keyRef}` });
      continue;
    }
    attempted += 1;
    const started = Date.now();
    store.updateHistory(historyId, { status: 'processing', provider: route.id, model: route.model, error: null });
    try {
      const result = await transcribeRoute(route, key, item.audioPath, store.state);
      store.addAttempt(historyId, {
        route: route.id, model: route.model, status: 'ok', latencyMs: Date.now() - started,
        segments: result.segments, costUsd: result.costUsd, upstream: result.upstream
      });
      return { ...result, route };
    } catch (e) {
      lastError = e;
      store.addAttempt(historyId, {
        route: route.id, model: route.model, status: 'error', latencyMs: Date.now() - started,
        error: String(e.message || e), httpStatus: e.status || null
      });
    }
  }
  if (!attempted) throw new Error('Ninguna ruta de la cadena tiene una API key configurada. Abre Proveedores y añade OpenRouter o Groq.');
  throw lastError || new Error('Todos los proveedores fallaron.');
}

module.exports = {
  transcribeWithFallback, transcribeRoute, transcribeOpenRouterSegment, transcribeMultipartSegment,
  postProcess, applyDictionaryPrompt, dictionaryTerms, joinSegments
};
