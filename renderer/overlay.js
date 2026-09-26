let stream, audioCtx, source, analyser, processor, anim, maxTimer, rid = null;
let stage = 'idle', started = 0, writes = Promise.resolve(), pending = 0, writeError = null, flushResolve;
const $ = s => document.querySelector(s), canvas = $('#wave'), ctx = canvas.getContext('2d');
function ui(status, message) {
  $('#dot').className = 'dot ' + ({ recording: 'live', processing: 'work', done: 'ok', failed: 'bad' }[status] || '');
  $('#label').textContent = { starting: 'Preparando micrófono', recording: 'Escuchando', processing: 'Procesando', done: 'Listo', failed: 'Revisa el historial' }[status] || status;
  $('#text').className = status === 'recording' ? 'ghost' : 'solid';
  if (message !== undefined) $('#text').textContent = message;
}
function draw() {
  if (!analyser || stage !== 'recording') return;
  const data = new Uint8Array(analyser.fftSize); analyser.getByteTimeDomainData(data);
  ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.beginPath();
  for (let i = 0; i < data.length; i++) {
    const x = i / (data.length - 1) * canvas.width, y = data[i] / 255 * canvas.height;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.strokeStyle = 'rgba(174,180,193,.65)'; ctx.lineWidth = 1.5; ctx.stroke();
  const seconds = Math.floor((performance.now() - started) / 1000);
  $('#timer').textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  anim = requestAnimationFrame(draw);
}
async function openMic(deviceId) {
  const audio = { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true };
  if (deviceId && deviceId !== 'default') audio.deviceId = { exact: deviceId };
  return navigator.mediaDevices.getUserMedia({ audio });
}
async function start() {
  if (stage !== 'idle') return;
  stage = 'starting'; writeError = null; writes = Promise.resolve(); pending = 0;
  ui('starting', 'Esperando permiso de micrófono…');
  try {
    const state = await window.alex.state(); let warning = '';
    try { stream = await openMic(state.settings.microphoneId); }
    catch (e) {
      if (state.settings.microphoneId !== 'default' && ['NotFoundError', 'OverconstrainedError'].includes(e.name)) {
        stream = await openMic('default'); warning = 'Micrófono seleccionado no disponible; usando el predeterminado.';
      } else throw e;
    }
    audioCtx = new AudioContext({ sampleRate: 16000 });
    await audioCtx.audioWorklet.addModule('pcm-worklet.js');
    processor = new AudioWorkletNode(audioCtx, 'alex-pcm');
    source = audioCtx.createMediaStreamSource(stream);
    analyser = audioCtx.createAnalyser(); analyser.fftSize = 256;
    rid = await window.alex.recordingStarted({ microphoneLabel: stream.getAudioTracks()[0]?.label || '' });
    const recordingId = rid;
    processor.port.onmessage = event => {
      if (event.data.flushed) { flushResolve?.(); return; }
      if (!event.data.pcm || writeError) return;
      const chunk = new Uint8Array(event.data.pcm); pending++;
      writes = writes.then(() => window.alex.recordingChunk(recordingId, chunk)).catch(e => {
        writeError = e; if (stage === 'recording') setTimeout(() => stop(true), 0);
      }).finally(() => { pending--; });
      if (pending > 32 && stage === 'recording') { writeError = new Error('El disco no guarda el audio con suficiente rapidez.'); setTimeout(() => stop(true), 0); }
    };
    source.connect(analyser); source.connect(processor); processor.connect(audioCtx.destination);
    await audioCtx.resume(); started = performance.now(); stage = 'recording';
    stream.getAudioTracks()[0].onended = () => { if (stage === 'recording') stop(true); };
    ui('recording', warning || 'Habla con naturalidad. Tu audio se está guardando.');
    $('#hint').textContent = 'Pulsa el atajo para terminar · guardar sin enviar desde la bandeja';
    maxTimer = setTimeout(() => stop(), 30 * 60 * 1000); draw();
  } catch (error) {
    await release(); stage = 'idle';
    await window.alex.recordingAborted({ id: rid, error: error.message }).catch(() => {}); rid = null;
    ui('failed', 'No se pudo iniciar: ' + error.message);
  }
}
async function release() {
  cancelAnimationFrame(anim); clearTimeout(maxTimer);
  if (stream) stream.getTracks().forEach(t => { t.onended = null; t.stop(); });
  try { source?.disconnect(); processor?.disconnect(); await audioCtx?.close(); } catch (_) {}
  stream = audioCtx = source = processor = analyser = null;
}
async function stop(saveOnly = false) {
  if (stage !== 'recording') return;
  stage = 'stopping'; ui('processing', 'Guardando los últimos fragmentos…');
  cancelAnimationFrame(anim); clearTimeout(maxTimer);
  try {
    // Flush the AudioWorklet and await every acknowledged disk write before finalizing.
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('El micrófono no respondió al cierre.')), 2000);
      flushResolve = () => { clearTimeout(timer); resolve(); };
      processor.port.postMessage('flush');
    });
    await writes;
    const id = rid; await release(); rid = null;
    if (writeError) await window.alex.recordingAborted({ id, error: writeError.message });
    else if (saveOnly) await window.alex.recordingCancelled(id);
    else await window.alex.recordingFinished({ id });
  } catch (error) {
    await release();
    await window.alex.recordingAborted({ id: rid, error: error.message }).catch(() => {}); rid = null;
    ui('failed', error.message + ' Revisa el audio guardado en Historial.');
  } finally { stage = 'idle'; flushResolve = null; }
}
window.alex.onCommand(command => {
  if (command.type === 'start') start();
  else if (command.type === 'stop') stop();
  else if (command.type === 'cancel') stop(true);
});
window.alex.onLiveText(data => {
  if (!['recording', 'stopping'].includes(stage)) return;
  if (data.text) { $('#text').textContent = data.text; $('#text').className = 'ghost'; $('#text').scrollTop = $('#text').scrollHeight; }
  if (data.warning) $('#hint').textContent = data.warning;
});
window.alex.onStatus(s => ui(s.status, s.text + (s.warning ? ` · ${s.warning}` : '')));
window.alex.onHint(data => { if (data.text) $('#hint').textContent = data.text; });
