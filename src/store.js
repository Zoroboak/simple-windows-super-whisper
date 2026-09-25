const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { safeStorage, app } = require('electron');
const { PCM_SAMPLE_RATE, finalizePcmPartial, pcmPartialPath, wavPath } = require('./audio');
const { ROUTES, PROFILES, normalizeChain } = require('./catalog');

class Store {
  constructor() {
    this.dir = app.getPath('userData');
    this.file = path.join(this.dir, 'state.json');
    this.audioDir = path.join(this.dir, 'audio');
    fs.mkdirSync(this.audioDir, { recursive: true });
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
        livePreview: true,
        liveProvider: 'mistral',
        liveTargetDelayMs: 650,
        cleanupFillers: false,
        microphoneId: 'default',
        openRouterRegion: 'global'
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
      schema: 2
    };
  }

  migrate(parsed) {
    const base = this.defaults();
    const next = {
      ...base,
      ...parsed,
      settings: { ...base.settings, ...(parsed.settings || {}) },
      routing: { ...base.routing, ...(parsed.routing || {}) },
      schema: 2
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
      return base;
    }
  }

  save() {
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.state, null, 2));
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

  publicState() {
    const copy = JSON.parse(JSON.stringify(this.state));
    copy.secrets = Object.fromEntries(Object.keys(copy.secrets || {}).map(k => [k, true]));
    copy.stats = this.computedStats();
    copy.routeCatalog = ROUTES;
    copy.profiles = PROFILES;
    return copy;
  }

  setSettings(patch) { this.state.settings = { ...this.state.settings, ...patch }; this.save(); }
  setRouting(patch) {
    const profile = patch.profile ?? this.state.routing.profile;
    const chain = normalizeChain(patch.chain ?? this.state.routing.chain);
    this.state.routing = { ...this.state.routing, ...patch, profile, chain: chain.length ? chain : [...PROFILES.balanced.chain] };
    this.save();
  }
  setCatalog(catalog) {
    this.state.routing.catalog = Array.isArray(catalog) ? catalog : [];
    this.state.routing.catalogUpdatedAt = new Date().toISOString();
    this.save();
  }
  setDictionary(items) { this.state.dictionary = items; this.save(); }
  setSnippets(items) { this.state.snippets = items; this.save(); }

  setSecret(name, value) {
    if (!value) { delete this.state.secrets[name]; this.save(); return; }
    if (!safeStorage.isEncryptionAvailable()) throw new Error('El almacén seguro del sistema no está disponible todavía.');
    this.state.secrets[name] = safeStorage.encryptString(value).toString('base64');
    this.save();
  }

  getSecret(name) {
    const raw = this.state.secrets[name];
    if (!raw || !safeStorage.isEncryptionAvailable()) return null;
    try { return safeStorage.decryptString(Buffer.from(raw, 'base64')); } catch (_) { return null; }
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
    fs.writeFileSync(p, Buffer.alloc(0));
    this.updateHistory(id, { audioPath: p, bytes: 0, mime: 'audio/pcm;rate=16000' });
    return p;
  }

  appendPcmChunk(id, buffer) {
    const item = this.state.history.find(x => x.id === id);
    if (!item?.audioPath || !item.audioPath.endsWith('.pcm.partial')) return false;
    const chunk = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
    fs.appendFileSync(item.audioPath, chunk);
    item.bytes = Number(item.bytes || 0) + chunk.length;
    item.updatedAt = new Date().toISOString();
    return true;
  }

  finalizePcmStream(id) {
    const item = this.state.history.find(x => x.id === id);
    if (!item?.audioPath || !item.audioPath.endsWith('.pcm.partial')) throw new Error('No existe una captura PCM activa.');
    const target = wavPath(this.audioDir, id);
    const info = finalizePcmPartial(item.audioPath, target, PCM_SAMPLE_RATE);
    try { fs.unlinkSync(item.audioPath); } catch (_) {}
    this.updateHistory(id, { audioPath: target, bytes: fs.statSync(target).size, durationMs: info.durationMs, mime: 'audio/wav', status: 'queued' });
    return target;
  }

  markSuccess(id, text, route) {
    return this.updateHistory(id, { status: 'done', text, provider: route.id, model: route.model, error: null });
  }
  markFailure(id, error) { return this.updateHistory(id, { status: 'failed', error: String(error) }); }

  recoverInterrupted() {
    let changed = false;
    for (const h of this.state.history) {
      if (!['recording', 'processing', 'queued'].includes(h.status)) continue;
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
    if (h.audioPath) { try { if (fs.existsSync(h.audioPath)) fs.unlinkSync(h.audioPath); } catch (_) {} }
    this.updateHistory(id, { status: 'cancelled', error: null, audioPath: null, bytes: 0 });
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
        try { if (fs.existsSync(h.audioPath)) fs.unlinkSync(h.audioPath); } catch (_) {}
        h.audioPath = null;
        changed = true;
      }
    }
    if (changed) this.save();
  }
}

module.exports = { Store };
