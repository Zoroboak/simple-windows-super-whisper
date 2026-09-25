const fs = require('fs');
const path = require('path');

function applyDictionaryPrompt(dictionary = []) {
  const terms = dictionary.map(x => typeof x === 'string' ? x : x.term).filter(Boolean).slice(0, 200);
  if (!terms.length) return '';
  return `Vocabulary / preferred spellings: ${terms.join(', ')}. Preserve these spellings when spoken.`;
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

async function transcribeOpenAICompatible(provider, apiKey, audioPath, state) {
  if (!apiKey) throw new Error(`Falta la API key: ${provider.keyRef}`);
  const bytes = fs.readFileSync(audioPath);
  const form = new FormData();
  form.append('file', new Blob([bytes]), path.basename(audioPath));
  form.append('model', provider.model);
  const lang = state.settings.language;
  if (lang && lang !== 'auto') form.append('language', lang);
  const prompt = applyDictionaryPrompt(state.dictionary);
  if (prompt) form.append('prompt', prompt);
  form.append('response_format', 'json');

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 120000);
  try {
    const res = await fetch(`${provider.baseUrl.replace(/\/$/, '')}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: ctrl.signal
    });
    const raw = await res.text();
    let data;
    try { data = JSON.parse(raw); } catch (_) { data = { text: raw }; }
    if (!res.ok) throw new Error(data?.error?.message || data?.message || `${res.status} ${res.statusText}`);
    if (!data.text) throw new Error('El proveedor respondió sin texto.');
    return postProcess(data.text, state);
  } finally { clearTimeout(timer); }
}

async function transcribeWithFallback(store, historyId) {
  const item = store.state.history.find(x => x.id === historyId);
  if (!item?.audioPath || !fs.existsSync(item.audioPath)) throw new Error('No existe el audio local para este dictado.');
  const providers = [...store.state.providers].filter(p => p.enabled).sort((a,b) => a.priority - b.priority);
  if (!providers.length) throw new Error('No hay proveedores habilitados.');

  let last;
  for (const provider of providers) {
    const started = Date.now();
    try {
      store.updateHistory(historyId, { status: 'processing', provider: provider.id, error: null });
      let text;
      if (provider.type === 'openai-stt') {
        text = await transcribeOpenAICompatible(provider, store.getSecret(provider.keyRef), item.audioPath, store.state);
      } else {
        throw new Error(`Tipo de proveedor no implementado: ${provider.type}`);
      }
      store.addAttempt(historyId, { provider: provider.id, ok: true, latencyMs: Date.now() - started });
      return { text, provider: provider.id };
    } catch (e) {
      last = e;
      store.addAttempt(historyId, { provider: provider.id, ok: false, latencyMs: Date.now() - started, error: String(e.message || e) });
    }
  }
  throw last || new Error('Todos los proveedores fallaron.');
}

module.exports = { transcribeWithFallback, postProcess, applyDictionaryPrompt };
