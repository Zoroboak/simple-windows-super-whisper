const fs = require('fs');
const path = require('path');

const PCM_SAMPLE_RATE = 16000;
const PCM_CHANNELS = 1;
const PCM_BITS = 16;

function createWavBuffer(pcm, sampleRate = PCM_SAMPLE_RATE, channels = PCM_CHANNELS, bitsPerSample = PCM_BITS) {
  const data = Buffer.isBuffer(pcm) ? pcm : Buffer.from(pcm);
  const header = Buffer.alloc(44);
  const byteRate = sampleRate * channels * bitsPerSample / 8;
  const blockAlign = channels * bitsPerSample / 8;
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

function parseWav(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 44 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('WAV no válido.');
  }
  let offset = 12;
  let fmt = null;
  let data = null;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString('ascii', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (body + size > buffer.length) break;
    if (id === 'fmt ') {
      fmt = {
        format: buffer.readUInt16LE(body),
        channels: buffer.readUInt16LE(body + 2),
        sampleRate: buffer.readUInt32LE(body + 4),
        bitsPerSample: buffer.readUInt16LE(body + 14)
      };
    } else if (id === 'data') {
      data = buffer.subarray(body, body + size);
      break;
    }
    offset = body + size + (size % 2);
  }
  if (!fmt || !data || fmt.format !== 1 || fmt.bitsPerSample !== 16 || fmt.channels !== 1) {
    throw new Error('Alex Dictate espera WAV PCM16 mono.');
  }
  return { ...fmt, pcm: data };
}

function finalizePcmPartial(partialPath, wavPath, sampleRate = PCM_SAMPLE_RATE) {
  if (!fs.existsSync(partialPath)) throw new Error('No existe el PCM parcial.');
  let pcm = fs.readFileSync(partialPath);
  if (pcm.length % 2) pcm = pcm.subarray(0, pcm.length - 1);
  const minBytes = Math.round(sampleRate * 2 * 0.12);
  if (pcm.length < minBytes) throw new Error('El audio parcial recuperado es demasiado corto.');
  const tmp = `${wavPath}.tmp`;
  fs.writeFileSync(tmp, createWavBuffer(pcm, sampleRate));
  fs.renameSync(tmp, wavPath);
  return { bytes: pcm.length, durationMs: Math.round(pcm.length / (sampleRate * 2) * 1000) };
}

function rmsAt(pcm, startSample, windowSamples) {
  const totalSamples = pcm.length >> 1;
  const start = Math.max(0, Math.min(totalSamples - 1, startSample));
  const end = Math.min(totalSamples, start + windowSamples);
  if (end <= start) return Infinity;
  let sum = 0;
  for (let i = start; i < end; i++) {
    const s = pcm.readInt16LE(i * 2) / 32768;
    sum += s * s;
  }
  return Math.sqrt(sum / (end - start));
}

function findSilenceCut(pcm, sampleRate, targetSample, searchSeconds = 4, windowMs = 90) {
  const totalSamples = pcm.length >> 1;
  const search = Math.round(searchSeconds * sampleRate);
  const windowSamples = Math.max(64, Math.round(windowMs / 1000 * sampleRate));
  const from = Math.max(windowSamples, targetSample - search);
  const to = Math.min(totalSamples - windowSamples, targetSample + search);
  if (from >= to) return Math.max(1, Math.min(totalSamples - 1, targetSample));
  const step = Math.max(80, Math.round(sampleRate * 0.025));
  let bestSample = targetSample;
  let bestScore = Infinity;
  for (let s = from; s <= to; s += step) {
    const energy = rmsAt(pcm, s - Math.floor(windowSamples / 2), windowSamples);
    const distancePenalty = Math.abs(s - targetSample) / search * 0.015;
    const score = energy + distancePenalty;
    if (score < bestScore) { bestScore = score; bestSample = s; }
  }
  return bestSample;
}

function splitWavBuffer(buffer, maxSeconds = 42, options = {}) {
  const parsed = parseWav(buffer);
  const { pcm, sampleRate } = parsed;
  const totalSamples = pcm.length >> 1;
  const maxSamples = Math.max(sampleRate * 5, Math.floor(maxSeconds * sampleRate));
  if (totalSamples <= maxSamples) return [{ buffer, startSec: 0, endSec: totalSamples / sampleRate }];
  const minSegmentSeconds = Number(options.minSegmentSeconds || 8);
  const minSamples = Math.floor(minSegmentSeconds * sampleRate);
  const cuts = [0];
  let cursor = 0;
  while (totalSamples - cursor > maxSamples) {
    const target = cursor + maxSamples;
    let cut = findSilenceCut(pcm, sampleRate, target, Number(options.searchSeconds || 4));
    if (cut - cursor < minSamples) cut = Math.min(totalSamples, cursor + maxSamples);
    if (totalSamples - cut < Math.min(minSamples, maxSamples / 2)) break;
    cuts.push(cut);
    cursor = cut;
  }
  cuts.push(totalSamples);
  const out = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const start = cuts[i], end = cuts[i + 1];
    const chunkPcm = pcm.subarray(start * 2, end * 2);
    out.push({
      buffer: createWavBuffer(chunkPcm, sampleRate),
      startSec: start / sampleRate,
      endSec: end / sampleRate
    });
  }
  return out;
}

function splitWavFile(filePath, maxSeconds, options) {
  return splitWavBuffer(fs.readFileSync(filePath), maxSeconds, options);
}

function pcmPartialPath(audioDir, id) { return path.join(audioDir, `${id}.pcm.partial`); }
function wavPath(audioDir, id) { return path.join(audioDir, `${id}.wav`); }

module.exports = {
  PCM_SAMPLE_RATE, PCM_CHANNELS, PCM_BITS,
  createWavBuffer, parseWav, finalizePcmPartial,
  findSilenceCut, splitWavBuffer, splitWavFile,
  pcmPartialPath, wavPath
};
