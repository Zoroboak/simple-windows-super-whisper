const ROUTES = [
  {
    id: 'openrouter-mai2', name: 'OpenRouter · MAI-Transcribe 2', family: 'premium', transport: 'openrouter-json',
    keyRef: 'openrouter', model: 'microsoft/mai-transcribe-2', costPerHourUsd: 0.10, maxSegmentSeconds: 42, requestTimeoutMs: 25000,
    badge: 'Español + términos', note: 'Multilingüe, code-switching y keyword biasing. Buena primera opción premium.'
  },
  {
    id: 'openrouter-gpt-transcribe', name: 'OpenRouter · GPT Transcribe', family: 'premium', transport: 'openrouter-json',
    keyRef: 'openrouter', model: 'openai/gpt-transcribe', costPerHourUsd: 0.27, maxSegmentSeconds: 42, requestTimeoutMs: 25000,
    badge: 'Máxima calidad', note: 'Alta precisión; úsalo cuando priorices calidad sobre coste.'
  },
  {
    id: 'openrouter-whisper-v3', name: 'OpenRouter · Whisper Large v3', family: 'value', transport: 'openrouter-json',
    keyRef: 'openrouter', model: 'openai/whisper-large-v3', costPerHourUsd: 0.0288, maxSegmentSeconds: 42, requestTimeoutMs: 25000,
    badge: 'Valor', note: 'Muy barato, robusto y multilingüe; OpenRouter enruta entre varios hosts.'
  },
  {
    id: 'openrouter-whisper-turbo', name: 'OpenRouter · Whisper Large v3 Turbo', family: 'value', transport: 'openrouter-json',
    keyRef: 'openrouter', model: 'openai/whisper-large-v3-turbo', costPerHourUsd: 0.0108, maxSegmentSeconds: 42, requestTimeoutMs: 25000,
    badge: 'Muy barato', note: 'Prioriza velocidad y coste.'
  },
  {
    id: 'openrouter-qwen-flash', name: 'OpenRouter · Qwen3 ASR Flash', family: 'premium', transport: 'openrouter-json',
    keyRef: 'openrouter', model: 'qwen/qwen3-asr-flash-2026-02-10', costPerHourUsd: 0.126, maxSegmentSeconds: 42, requestTimeoutMs: 25000,
    badge: 'Ruido / campo lejano', note: 'Interesante para español y audio acústicamente difícil.'
  },
  {
    id: 'openrouter-qwen-06b', name: 'OpenRouter · Qwen3 ASR 0.6B', family: 'value', transport: 'openrouter-json',
    keyRef: 'openrouter', model: 'qwen/qwen3-asr-0.6b', costPerHourUsd: 0.0108, maxSegmentSeconds: 42, requestTimeoutMs: 25000,
    badge: 'Alternativa económica', note: 'Compacto y barato; útil como fallback adicional.'
  },
  {
    id: 'groq-turbo', name: 'Groq directo · Whisper Large v3 Turbo', family: 'free', transport: 'openai-multipart',
    keyRef: 'groq', baseUrl: 'https://api.groq.com/openai/v1', model: 'whisper-large-v3-turbo', costPerHourUsd: 0.04,
    maxSegmentSeconds: 240, requestTimeoutMs: 20000, badge: 'Free tier', note: 'Ruta gratuita recomendada; pago por uso muy barato si superas los límites.'
  },
  {
    id: 'groq-large', name: 'Groq directo · Whisper Large v3', family: 'free', transport: 'openai-multipart',
    keyRef: 'groq', baseUrl: 'https://api.groq.com/openai/v1', model: 'whisper-large-v3', costPerHourUsd: 0.111,
    maxSegmentSeconds: 240, requestTimeoutMs: 22000, badge: 'Free tier · precisión', note: 'Fallback gratuito de mayor precisión.'
  },
  {
    id: 'openai-gpt-transcribe', name: 'OpenAI directo · GPT Transcribe', family: 'premium', transport: 'openai-multipart',
    keyRef: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'gpt-transcribe', costPerHourUsd: 0.27,
    maxSegmentSeconds: 240, requestTimeoutMs: 30000, badge: 'Directo', note: 'Ruta directa opcional, independiente de OpenRouter.'
  }
];

const PROFILES = {
  free: {
    id: 'free', name: 'Gratis', description: 'Sin gasto mientras permanezcas dentro del free tier de Groq.',
    chain: ['groq-turbo', 'groq-large']
  },
  balanced: {
    id: 'balanced', name: 'Premium equilibrado', description: 'Primero calidad/precio de pago; después dos fallbacks gratuitos.',
    chain: ['openrouter-mai2', 'openrouter-whisper-v3', 'groq-turbo', 'groq-large']
  },
  quality: {
    id: 'quality', name: 'Máxima calidad', description: 'Prioriza precisión; mantiene rutas baratas y gratuitas al final.',
    chain: ['openrouter-gpt-transcribe', 'openrouter-mai2', 'openrouter-qwen-flash', 'openrouter-whisper-v3', 'groq-large']
  }
};

function routeMap() { return Object.fromEntries(ROUTES.map(x => [x.id, x])); }
function routeById(id) { return ROUTES.find(x => x.id === id) || null; }
function normalizeChain(chain) {
  const valid = new Set(ROUTES.map(x => x.id));
  return [...new Set((chain || []).filter(x => valid.has(x)))];
}

function firstFinite(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function endpointSummary(endpoint = {}) {
  const p = endpoint.pricing || {};
  const perf = endpoint.performance || endpoint.metrics || {};
  const provider = endpoint.provider_name || endpoint.provider?.name || endpoint.name || endpoint.provider || endpoint.tag || 'Proveedor';
  const latencyRaw = firstFinite(
    endpoint.latency, endpoint.latency_p50, endpoint.latency_last_30m,
    endpoint.latency_last_1h, perf.latency, perf.latency_p50, perf.latency_last_30m
  );
  const throughputRaw = firstFinite(
    endpoint.throughput, endpoint.throughput_p50, endpoint.throughput_last_30m,
    endpoint.throughput_last_1h, perf.throughput, perf.throughput_p50, perf.throughput_last_30m
  );
  const uptimeRaw = firstFinite(
    endpoint.uptime, endpoint.uptime_last_30m, endpoint.uptime_last_1h,
    endpoint.uptime_last_24h, perf.uptime, perf.uptime_last_30m
  );
  // OpenRouter presents latency as seconds in public performance views. Some
  // internal/legacy shapes may already return milliseconds; avoid double scaling.
  const latencyMs = latencyRaw == null ? null : latencyRaw * (latencyRaw < 50 ? 1000 : 1);
  const uptime = uptimeRaw == null ? null : (uptimeRaw <= 1 ? uptimeRaw * 100 : uptimeRaw);
  return {
    provider: String(provider),
    contextLength: endpoint.context_length || endpoint.contextLength || null,
    latencyMs: Number.isFinite(latencyMs) ? Math.round(latencyMs) : null,
    throughput: throughputRaw == null ? null : Number(throughputRaw),
    uptime: uptime == null ? null : Number(uptime),
    quantization: endpoint.quantization || endpoint.architecture?.quantization || null,
    location: endpoint.region || endpoint.location || endpoint.datacenter || null,
    pricing: p
  };
}

async function fetchOpenRouterCatalog(apiKey, modelIds = ROUTES.filter(x => x.transport === 'openrouter-json').map(x => x.model), region = 'global') {
  if (!apiKey) throw new Error('Añade una API key de OpenRouter para actualizar el catálogo.');
  const headers = { Authorization: `Bearer ${apiKey}` };
  const domain = region === 'eu' ? 'https://eu.openrouter.ai' : 'https://openrouter.ai';
  const models = [...new Set(modelIds)];
  return Promise.all(models.map(async model => {
    const [author, ...rest] = model.split('/');
    const slug = rest.join('/');
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);
    try {
      const res = await fetch(`${domain}/api/v1/models/${encodeURIComponent(author)}/${encodeURIComponent(slug)}/endpoints`, { headers, signal: ctrl.signal });
      const raw = await res.text();
      let data = null;
      try { data = JSON.parse(raw); } catch (_) {}
      if (!res.ok) throw new Error(data?.error?.message || `${res.status} ${res.statusText}`);
      const body = data?.data || data || {};
      return {
        model,
        name: body.name || ROUTES.find(r => r.model === model)?.name || model,
        endpoints: (body.endpoints || []).map(endpointSummary),
        fetchedAt: new Date().toISOString()
      };
    } catch (error) {
      return { model, name: model, endpoints: [], error: String(error.message || error), fetchedAt: new Date().toISOString() };
    } finally { clearTimeout(timer); }
  }));
}

module.exports = { ROUTES, PROFILES, routeMap, routeById, normalizeChain, fetchOpenRouterCatalog, endpointSummary };
