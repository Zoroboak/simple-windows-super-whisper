/* Mono PCM16 capture on the audio rendering thread, with a stateful resampler. */
class PcmRecorder extends AudioWorkletProcessor {
  constructor() {
    super(); this.samples = new Int16Array(2048); this.count = 0;
    this.ratio = sampleRate / 16000; this.weight = 0; this.sum = 0; this.stopped = false;
    this.port.onmessage = event => {
      if (event.data === 'flush') { this.stopped = true; this.flush(); this.port.postMessage({ flushed: true }); }
    };
  }
  put(value) {
    const s = Math.max(-1, Math.min(1, value));
    this.samples[this.count++] = Math.round(s * (s < 0 ? 32768 : 32767));
    if (this.count === this.samples.length) this.flush();
  }
  flush() {
    if (!this.count) return;
    // Explicit little endian, independently of host endianness.
    const bytes = new ArrayBuffer(this.count * 2), view = new DataView(bytes);
    for (let i = 0; i < this.count; i++) view.setInt16(i * 2, this.samples[i], true);
    this.port.postMessage({ pcm: bytes }, [bytes]); this.count = 0;
  }
  process(inputs) {
    if (this.stopped) return false;
    const data = inputs[0]?.[0];
    if (data) for (const value of data) {
      let remaining = 1;
      while (remaining > 1e-9) {
        const take = Math.min(remaining, this.ratio - this.weight);
        this.sum += value * take; this.weight += take; remaining -= take;
        if (this.weight >= this.ratio - 1e-9) { this.put(this.sum / this.ratio); this.sum = 0; this.weight = 0; }
      }
    }
    return true;
  }
}
registerProcessor('alex-pcm', PcmRecorder);
