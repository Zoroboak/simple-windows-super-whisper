// Realtime is an optional preview. It never owns the only copy of the audio.
class LivePreview {
  constructor(WebSocketClass, apiKey, delayMs, onText, onWarning) {
    this.queue = []; this.queuedBytes = 0; this.text = ''; this.ready = false; this.closed = false; this.ending = false;
    this.onText = onText; this.onWarning = onWarning;
    this.done = new Promise(resolve => { this.resolveDone = resolve; });
    this.socket = new WebSocketClass('wss://api.mistral.ai/v1/audio/transcriptions/realtime?model=voxtral-mini-transcribe-realtime-2602',
      { headers: { Authorization: `Bearer ${apiKey}` }, useSessionCookies: false });
    this.timer = setTimeout(() => this.fail('No se pudo conectar el texto en directo. El audio sigue guardándose.'), 10000);
    this.socket.onmessage = event => {
      if (this.closed) return;
      let message; try { message = JSON.parse(String(event.data)); } catch (_) { return; }
      if (message.type === 'session.created') {
        this.socket.send(JSON.stringify({ type: 'session.update', session: {
          audio_format: { encoding: 'pcm_s16le', sample_rate: 16000 }, target_streaming_delay_ms: delayMs
        } }));
        this.ready = true; clearTimeout(this.timer);
        for (const chunk of this.queue) this.send(chunk);
        this.queue = []; this.queuedBytes = 0;
        if (this.ending) this.endFrames();
      } else if (message.type === 'transcription.text.delta' && typeof message.text === 'string') {
        this.text += message.text; this.onText(this.text, message.text);
      } else if (message.type === 'transcription.done') this.close();
      else if (['error', 'transcription.error'].includes(message.type)) this.fail('Texto en directo no disponible. La transcripción final sigue activa.');
    };
    this.socket.onerror = () => this.fail('Se desconectó el texto en directo. El audio local sigue disponible.');
    this.socket.onclose = () => { if (!this.closed && !this.ending) this.onWarning('Vista en directo desconectada; se transcribirá el WAV completo al terminar.'); this.close(); };
  }
  send(chunk) {
    if (this.closed || this.socket.readyState !== 1) return;
    if (this.socket.bufferedAmount > 640000) return this.fail('La conexión en directo es demasiado lenta; se conserva el dictado local.');
    this.socket.send(JSON.stringify({ type: 'input_audio.append', audio: Buffer.from(chunk).toString('base64') }));
  }
  push(chunk) {
    if (this.closed || this.ending) return;
    if (this.ready) return this.send(chunk);
    this.queue.push(Buffer.from(chunk)); this.queuedBytes += chunk.length;
    if (this.queuedBytes > 320000) this.fail('No se conectó la vista en directo. Continúa hablando: se guarda el audio.');
  }
  endFrames() {
    if (this.closed || this.socket.readyState !== 1) return;
    this.socket.send(JSON.stringify({ type: 'input_audio.flush' }));
    this.socket.send(JSON.stringify({ type: 'input_audio.end' }));
  }
  finish() {
    if (this.closed) return this.done;
    this.ending = true; clearTimeout(this.timer);
    if (this.ready) this.endFrames();
    this.timer = setTimeout(() => this.close(), 4000);
    return this.done;
  }
  fail(message) { if (this.closed) return; this.onWarning(message); this.close(); }
  close() {
    if (this.closed) return;
    this.closed = true; clearTimeout(this.timer); this.queue = []; this.queuedBytes = 0;
    try { this.socket.close(); } catch (_) {}
    this.resolveDone(this.text);
  }
}
module.exports = { LivePreview };
