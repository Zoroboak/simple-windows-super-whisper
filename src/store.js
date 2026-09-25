const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { safeStorage, app } = require('electron');

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
        language: 'auto',
        autoPaste: true,
        keepCompletedAudioDays: 14,
        mode: 'balanced',
        livePreview: false,
        liveProvider: 'mistral',
        liveTargetDelayMs: 650,
        cleanupFillers: false,
        microphoneId: 'default'
      },
      providers: [
        { id: 'groq-turbo', name: 'Groq · Whisper Large v3 Turbo', type: 'openai-stt', baseUrl: 'https://api.groq.com/openai/v1', model: 'whisper-large-v3-turbo', enabled: true, priority: 10, keyRef: 'groq', note: 'Best value / default' },
        { id: 'groq-large', name: 'Groq · Whisper Large v3', type: 'openai-stt', baseUrl: 'https://api.groq.com/openai/v1', model: 'whisper-large-v3', enabled: true, priority: 20, keyRef: 'groq', note: 'Accuracy fallback' },
        { id: 'openai-transcribe', name: 'OpenAI · gpt-4o-mini-transcribe', type: 'openai-stt', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini-transcribe', enabled: false, priority: 30, keyRef: 'openai', note: 'Optional paid fallback' }
      ],
      secrets: {},
      dictionary: [],
      snippets: [],
      history: [],
      stats: { totalWords: 0, totalSeconds: 0, successful: 0, failed: 0 },
      schema: 1
    };
  }

  load() {
    const base = this.defaults();
    try {
      if (!fs.existsSync(this.file)) return base;
      const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      return {
        ...base,
        ...parsed,
        settings: { ...base.settings, ...(parsed.settings || {}) },
        stats: { ...base.stats, ...(parsed.stats || {}) }
      };
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

  publicState() {
    const copy = JSON.parse(JSON.stringify(this.state));
    copy.secrets = Object.fromEntries(Object.keys(copy.secrets || {}).map(k => [k, true]));
    return copy;
  }

  setSettings(patch) { this.state.settings = { ...this.state.settings, ...patch }; this.save(); }
  setProviders(items) { this.state.providers = items; this.save(); }
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
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'recording',
      text: '', provider: null, error: null,
      durationMs: 0, bytes: 0, mime: meta.mime || 'audio/webm',
      audioPath: null, attempts: [], appHint: meta.appHint || null
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

  beginAudioStream(id, ext = 'webm') {
    const finalPath = path.join(this.audioDir, `${id}.${ext}`);
    const partialPath = `${finalPath}.partial`;
    fs.writeFileSync(partialPath, Buffer.alloc(0));
    this.updateHistory(id, { audioPath: partialPath, bytes: 0 });
    return partialPath;
  }

  appendAudioChunk(id, buffer) {
    const item = this.state.history.find(x => x.id === id);
    if (!item?.audioPath || !item.audioPath.endsWith('.partial')) return false;
    fs.appendFileSync(item.audioPath, buffer);
    item.bytes = Number(item.bytes || 0) + buffer.length;
    item.updatedAt = new Date().toISOString();
    return true;
  }

  finalizeAudioStream(id) {
    const item = this.state.history.find(x => x.id === id);
    if (!item?.audioPath) return null;
    const partialPath = item.audioPath;
    const finalPath = partialPath.endsWith('.partial') ? partialPath.slice(0, -8) : partialPath;
    if (partialPath !== finalPath && fs.existsSync(partialPath)) fs.renameSync(partialPath, finalPath);
    const bytes = fs.existsSync(finalPath) ? fs.statSync(finalPath).size : Number(item.bytes || 0);
    this.updateHistory(id, { audioPath: finalPath, bytes, status: 'queued' });
    return finalPath;
  }

  saveAudio(id, buffer, ext = 'webm') {
    const p = path.join(this.audioDir, `${id}.${ext}`);
    const tmp = `${p}.partial`;
    fs.writeFileSync(tmp, buffer);
    fs.renameSync(tmp, p);
    this.updateHistory(id, { audioPath: p, bytes: buffer.length, status: 'queued' });
    return p;
  }

  markSuccess(id, text, provider, durationMs) {
    const words = String(text || '').trim().split(/\s+/).filter(Boolean).length;
    this.state.stats.totalWords += words;
    this.state.stats.totalSeconds += Math.round((durationMs || 0) / 1000);
    this.state.stats.successful += 1;
    const out = this.updateHistory(id, { status: 'done', text, provider, error: null, durationMs });
    this.save();
    return out;
  }

  markFailure(id, error) {
    this.state.stats.failed += 1;
    const out = this.updateHistory(id, { status: 'failed', error: String(error) });
    this.save();
    return out;
  }

  recoverInterrupted() {
    let changed = false;
    for (const h of this.state.history) {
      if (!['recording', 'processing'].includes(h.status)) continue;
      if (h.audioPath && fs.existsSync(h.audioPath)) {
        if (h.audioPath.endsWith('.partial')) {
          const finalPath = h.audioPath.slice(0, -8);
          try {
            fs.renameSync(h.audioPath, finalPath);
            h.audioPath = finalPath;
            h.bytes = fs.statSync(finalPath).size;
          } catch (_) {}
        }
        h.status = 'queued';
        h.error = 'La aplicación se cerró durante la grabación o el procesamiento; se recuperó el audio local y está listo para reintentar.';
      } else {
        h.status = 'failed';
        h.error = 'La aplicación se cerró antes de poder persistir audio recuperable.';
      }
      h.updatedAt = new Date().toISOString();
      changed = true;
    }
    if (changed) this.save();
  }

  cleanupCompletedAudio() {
    const days = Number(this.state.settings.keepCompletedAudioDays || 14);
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
