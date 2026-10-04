const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { PCM_SAMPLE_RATE, finalizePcmPartial, pcmPartialPath, wavPath } = require('./audio');
const { ROUTES, PROFILES, normalizeChain } = require('./catalog');

class Store {
  constructor(options = {}) {
    const electron = options.electron || require('electron');
    this.safeStorage = electron.safeStorage; this.app = electron.app;
    this.lastSync = new Map();
    this.dir = options.directory || this.app.getPath('userData');
    this.file = path.join(this.dir, 'state.json');
    this.audioDir = path.join(this.dir, 'audio');
    fs.mkdirSync(this.audioDir, { recursive: true, mode: 0o700 });
    this.state = this.load();
  }

  defaults() {
    return {
      settings: {
        hotkey: 'CommandOrControl+Shift+Space',
        language: 'es',
        autoPaste: true,
        insertionMode: 'final-safe',
        keepCompletedAudioDays: 14,
        livePreview: false,
        liveProvider: 'mistral',
        liveTargetDelayMs: 650,
        cleanupFillers: false,
        microphoneId: 'default',
        openRouterRegion: 'global',
        onboardingComplete: false,
        checkUpdatesAutomatically: true
      },
      routing: {
        profile: 'balanced',
        chain: [...PROFILES.balanced.chain],
        catalog: [],
        catalogUpdatedAt: null
      },
      secrets: {},
      dictionary: [],
      snippets: [],
      history: [],
      schema: 3
    };
  }

  migrate(parsed) {
    const base = this.defaults();
    const next = {
      ...base,
      ...parsed,
      settings: { ...base.settings, ...(parsed.settings || {}) },
      routing: { ...base.routing, ...(parsed.routing || {}) },
      schema: 3
    };
    if (!parsed.routing && Array.isArray(parsed.providers)) {
      const legacy = parsed.providers.filter(x => x.enabled).sort((a,b) => Number(a.priority || 0) - Number(b.priority || 0)).map(x => x.id);
      const mapped = legacy.map(id => ({
        'groq-turbo': 'groq-turbo',
        'groq-large': 'groq-large',
        'openai-transcribe': 'openai-gpt-transcribe'
      }[id])).filter(Boolean);
      if (mapped.length) next.routing.chain = mapped;
    }
    next.routing.chain = normalizeChain(next.routing.chain);
    if (!next.routing.chain.length) next.routing.chain = [...PROFILES.balanced.chain];
    if (typeof parsed.settings?.onboardingComplete !== 'boolean') {
      next.settings.onboardingComplete = Boolean(
        Object.keys(parsed.secrets || {}).length || (parsed.history || []).length
      );
    }
    delete next.providers;
    delete next.stats;
    return next;
  }

  load() {
    const base = this.defaults();
    try {
      if (!fs.existsSync(this.file)) return base;
      const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      return this.migrate(parsed);
    } catch (e) {
      const backup = `${this.file}.corrupt-${Date.now()}`;
      try { fs.copyFileSync(this.file, backup); } catch (_) {}
      try { return this.migrate(JSON.parse(fs.readFileSync(`${this.file}.bak`, 'utf8'))); } catch (_) { return base; }
    }
  }

  save() {
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.state, null, 2), { mode: 0o600 });
    const fd = fs.openSync(tmp, 'r+'); try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    if (fs.existsSync(this.file)) fs.copyFileSync(this.file, `${this.file}.bak`);
    fs.renameSync(tmp, this.file);
  }

  computedStats() {
    const done = this.state.history.filter(x => x.status === 'done');
    const failed = this.state.history.filter(x => x.status === 'failed');
    return {
      totalWords: done.reduce((n, h) => n + String(h.text || '').trim().split(/\s+/).filter(Boolean).length, 0),
      totalSeconds: Math.round(done.reduce((n, h) => n + Number(h.durationMs || 0), 0) / 1000),
      successful: done.length,
      failed: failed.length,
      total: done.length + failed.length,
      successRate: done.length + failed.length ? Math.round(done.length / (done.length + failed.length) * 100) : 100
    };
  }

  computedRouteStats() {
    const byRoute = {};
    for (const h of this.state.history || []) {
      for (const a of h.attempts || []) {
        if (!a.route || !['ok', 'error'].includes(a.status)) continue;
        const r = byRoute[a.route] || (byRoute[a.route] = { attempts: 0, ok: 0, error: 0, latencyMsTotal: 0, latencySamples: 0, costUsd: 0, lastAt: null });
        r.attempts += 1;
        r[a.status] += 1;
        if (a.latencyMs != null && Number.isFinite(Number(a.latencyMs))) { r.latencyMsTotal += Number(a.latencyMs); r.latencySamples += 1; }
        if (Number.isFinite(Number(a.costUsd))) r.costUsd += Number(a.costUsd);
        if (a.at && (!r.lastAt || a.at > r.lastAt)) r.lastAt = a.at;
      }
    }
    return Object.fromEntries(Object.entries(byRoute).map(([id, r]) => [id, {
      attempts: r.attempts,
      ok: r.ok,
      error: r.error,
      successRate: r.attempts ? Math.round(r.ok / r.attempts * 100) : null,
      avgLatencyMs: r.latencySamples ? Math.round(r.latencyMsTotal / r.latencySamples) : null,
      costUsd: Math.round(r.costUsd * 1e6) / 1e6,
      lastAt: r.lastAt
    }]));
  }

  publicState() {
    const copy = JSON.parse(JSON.stringify(this.state));
    copy.secrets = Object.fromEntries(Object.keys(copy.secrets || {}).map(k => [k, Boolean(this.getSecret(k))]));
    copy.secureStorage = this.secureStatus();
    copy.stats = this.computedStats();
    copy.routeCatalog = ROUTES;
    copy.profiles = PROFILES;
    copy.routeStats = this.computedRouteStats();
    copy.appVersion = this.app.getVersion();
    return copy;
  }

  setSettings(patch, { allowHotkey = false } = {}) {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('Ajustes inválidos.');
    const next = { ...this.state.settings };
    const bools = ['autoPaste', 'livePreview', 'cleanupFillers', 'onboardingComplete', 'checkUpdatesAutomatically'];
    for (const [key, value] of Object.entries(patch)) {
      if (bools.includes(key)) { if (typeof value !== 'boolean') throw new Error(`Valor inválido: ${key}`); next[key] = value; }
      else if (key === 'hotkey' && allowHotkey) next[key] = String(value);
      else if (key === 'keepCompletedAudioDays') { if (!Number.isInteger(value) || value < -1 || value > 3650) throw new Error('Retención: usa -1 (siempre) o un número entre 0 y 3650.'); next[key] = value; }
      else if (key === 'liveTargetDelayMs') { if (!Number.isFinite(value) || value < 240 || value > 3000) throw new Error('Retardo inválido.'); next[key] = value; }
      else if (key === 'language' && /^(auto|[a-z]{2})$/.test(value)) next[key] = value;
      else if (key === 'microphoneId' && typeof value === 'string' && value.length <= 300) next[key] = value;
      else if (key === 'insertionMode' && ['final-safe', 'live-experimental'].includes(value)) next[key] = value;
      else if (key === 'openRouterRegion' && ['global', 'eu'].includes(value)) next[key] = value;
      else if (key === 'liveProvider' && value === 'mistral') next[key] = value;
      else throw new Error(`Ajuste no permitido: ${key}`);
    }
    const previous = this.state.settings; this.state.settings = next;
    try { this.save(); } catch (e) { this.state.settings = previous; throw e; }
  }
  setRouting(patch) {
    const profile = patch.profile ?? this.state.routing.profile;
    const chain = normalizeChain(patch.chain ?? this.state.routing.chain);
    if (!chain.length) throw new Error('Añade al menos una ruta antes de guardar.');
    this.state.routing = { ...this.state.routing, profile: PROFILES[profile] ? profile : 'custom', chain };
    this.save();
  }
  setCatalog(catalog) {
    this.state.routing.catalog = Array.isArray(catalog) ? catalog : [];
    this.state.routing.catalogUpdatedAt = new Date().toISOString();
    this.save();
  }
  setDictionary(items) { this.state.dictionary = items; this.save(); }
  setSnippets(items) { this.state.snippets = items; this.save(); }

  secureStatus() {
    const backend = process.platform === 'linux' ? this.safeStorage.getSelectedStorageBackend?.() || 'unknown' : process.platform;
    return { backend, available: this.safeStorage.isEncryptionAvailable() && !['basic_text', 'unknown'].includes(backend) };
  }

  setSecret(name, value) {
    if (!['groq', 'openrouter', 'mistral', 'openai'].includes(name) || typeof value !== 'string' || value.length > 4096) throw new Error('Credencial inválida.');
    if (!value) { delete this.state.secrets[name]; this.save(); return; }
    if (!this.secureStatus().available) throw new Error('Desbloquea KWallet o el llavero del sistema y reinicia Alex Dictate. No se guardarán claves con cifrado débil.');
    this.state.secrets[name] = this.safeStorage.encryptString(value).toString('base64');
    this.save();
  }

  getSecret(name) {
    const raw = this.state.secrets[name];
    if (!raw || !this.secureStatus().available) return null;
    try { return this.safeStorage.decryptString(Buffer.from(raw, 'base64')); } catch (_) { return null; }
  }

  createPending(meta = {}) {
    const item = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      status: 'recording', text: '', provider: null, model: null, error: null,
      durationMs: 0, bytes: 0, mime: 'audio/wav', audioPath: null,
      attempts: [], microphoneLabel: meta.microphoneLabel || null
    };
    this.state.history.unshift(item);
    this.save();
    return item;
  }

  updateHistory(id, patch) {
    const i = this.state.history.findIndex(x => x.id === id);
    if (i < 0) return null;
    this.state.history[i] = { ...this.state.history[i], ...patch, updatedAt: new Date().toISOString() };
    this.save();
    return this.state.history[i];
  }

  addAttempt(id, attempt) {
    const item = this.state.history.find(x => x.id === id);
    if (!item) return;
    item.attempts = [...(item.attempts || []), { at: new Date().toISOString(), ...attempt }];
    item.updatedAt = new Date().toISOString();
    this.save();
  }

  beginPcmStream(id) {
    const p = pcmPartialPath(this.audioDir, id);
    fs.writeFileSync(p, Buffer.alloc(0), { flag: 'wx', mode: 0o600 });
    this.updateHistory(id, { audioPath: p, bytes: 0, mime: 'audio/pcm;rate=16000' });
    return p;
  }

  appendPcmChunk(id, buffer) {
    const item = this.state.history.find(x => x.id === id);
    if (!item?.audioPath || !item.audioPath.endsWith('.pcm.partial')) throw new Error('La captura ya no está activa.');
    const chunk = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
    if (!chunk.length || chunk.length % 2 || chunk.length > 65536) throw new Error('Bloque de audio inválido.');
    fs.appendFileSync(item.audioPath, chunk);
    if (Date.now() - (this.lastSync.get(id) || 0) >= 2000) {
      const fd = fs.openSync(item.audioPath, 'r+'); try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
      this.lastSync.set(id, Date.now());
    }
    item.bytes = Number(item.bytes || 0) + chunk.length;
    item.updatedAt = new Date().toISOString();
    return true;
  }

  finalizePcmStream(id) {
    const item = this.state.history.find(x => x.id === id);
    if (!item?.audioPath || !item.audioPath.endsWith('.pcm.partial')) throw new Error('No existe una captura PCM activa.');
    const target = wavPath(this.audioDir, id);
    const info = finalizePcmPartial(item.audioPath, target, PCM_SAMPLE_RATE);
    const partial = item.audioPath;
    this.updateHistory(id, { audioPath: target, bytes: fs.statSync(target).size, durationMs: info.durationMs, mime: 'audio/wav', status: 'queued' });
    try { fs.unlinkSync(partial); } catch (_) {}
    return target;
  }

  ensureWavForHistory(id) {
    const item = this.state.history.find(x => x.id === id);
    if (!item?.audioPath || !fs.existsSync(item.audioPath)) throw new Error('No hay audio local recuperable.');
    if (!item.audioPath.endsWith('.pcm.partial')) return item.audioPath;
    const target = wavPath(this.audioDir, id);
    const info = finalizePcmPartial(item.audioPath, target, PCM_SAMPLE_RATE);
    const partial = item.audioPath;
    this.updateHistory(id, { audioPath: target, bytes: fs.statSync(target).size, durationMs: item.durationMs || info.durationMs, mime: 'audio/wav', status: 'queued', error: null });
    try { fs.unlinkSync(partial); } catch (_) {}
    return target;
  }

  markSuccess(id, text, route) {
    return this.updateHistory(id, { status: 'done', text, provider: route.id, model: route.model, error: null });
  }
  markFailure(id, error) { return this.updateHistory(id, { status: 'failed', error: String(error) }); }

  recoverInterrupted() {
    let changed = false;
    // Recover orphaned audio after a state-file crash without inventing transcripts.
    for (const file of fs.readdirSync(this.audioDir)) {
      const match = file.match(/^([0-9a-f-]{36})\.(pcm\.partial|wav|webm|ogg)$/i);
      if (!match || this.state.history.some(h => h.id === match[1])) continue;
      this.state.history.push({ id: match[1], createdAt: fs.statSync(path.join(this.audioDir, file)).mtime.toISOString(), status: 'queued', text: '', attempts: [], audioPath: path.join(this.audioDir, file), bytes: 0 });
      changed = true;
    }
    for (const h of this.state.history) {
      if (h.audioPath && !fs.existsSync(h.audioPath) && fs.existsSync(wavPath(this.audioDir, h.id))) { h.audioPath = wavPath(this.audioDir, h.id); changed = true; }
      if (!['recording', 'processing', 'queued'].includes(h.status) && !(h.status === 'failed' && h.audioPath?.endsWith('.pcm.partial'))) continue;
      const previousStatus = h.status;
      if (h.audioPath && fs.existsSync(h.audioPath)) {
        if (h.audioPath.endsWith('.pcm.partial')) {
          const target = wavPath(this.audioDir, h.id);
          try {
            const info = finalizePcmPartial(h.audioPath, target, PCM_SAMPLE_RATE);
            try { fs.unlinkSync(h.audioPath); } catch (_) {}
            h.audioPath = target;
            h.bytes = fs.statSync(target).size;
            h.durationMs = h.durationMs || info.durationMs;
            h.mime = 'audio/wav';
            h.status = 'queued';
            h.error = 'Grabación recuperada tras un cierre inesperado. Puedes reintentarla.';
          } catch (e) {
            h.status = 'failed';
            h.error = `No se pudo recuperar el PCM parcial: ${e.message}`;
          }
        } else {
          h.status = 'queued';
          if (previousStatus === 'processing') h.error = 'Procesamiento interrumpido; el audio local sigue disponible.';
        }
      } else {
        h.status = 'failed';
        h.error = 'La aplicación se cerró antes de persistir audio recuperable.';
      }
      h.updatedAt = new Date().toISOString();
      changed = true;
    }
    if (changed) this.save();
  }

  cancelRecording(id) {
    const h = this.state.history.find(x => x.id === id);
    if (!h) return;
    if (h.audioPath?.endsWith('.pcm.partial')) {
      try { this.ensureWavForHistory(id); } catch (_) { /* Preserve even a very short partial. */ }
    }
    this.updateHistory(id, { status: 'cancelled', error: 'Guardado sin enviar. Puedes reintentarlo o eliminarlo.' });
  }

  deleteHistory(id) {
    const h = this.state.history.find(x => x.id === id);
    if (h?.audioPath) { try { if (fs.existsSync(h.audioPath)) fs.unlinkSync(h.audioPath); } catch (_) {} }
    this.state.history = this.state.history.filter(x => x.id !== id);
    this.save();
  }

  cleanupCompletedAudio() {
    const days = Number(this.state.settings.keepCompletedAudioDays ?? 14);
    if (days < 0) return;
    const cutoff = Date.now() - days * 86400000;
    let changed = false;
    for (const h of this.state.history) {
      if (h.status !== 'done' || !h.audioPath) continue;
      const ts = Date.parse(h.updatedAt || h.createdAt);
      if (Number.isFinite(ts) && ts < cutoff) {
        try { if (fs.existsSync(h.audioPath)) fs.unlinkSync(h.audioPath); } catch (_) { continue; }
        h.audioPath = null;
        changed = true;
      }
    }
    if (changed) this.save();
  }
}

module.exports = { Store };
