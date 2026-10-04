let stream, audioCtx, source, analyser, processor, anim, maxTimer, rid = null;
let stage = 'idle', started = 0, writes = Promise.resolve(), pending = 0, writeError = null, flushResolve;
let stopRequested = null;
const $ = s => document.querySelector(s), canvas = $('#wave'), ctx = canvas.getContext('2d');
function ui(status, message) {
  $('#dot').className = 'dot ' + ({ recording: 'live', processing: 'work', done: 'ok', failed: 'bad' }[status] || '');
  $('#label').textContent = { starting: 'Preparando micrófono', recording: 'Escuchando', processing: 'Procesando', done: 'Listo', failed: 'Revisa el historial' }[status] || status;
  $('#text').className = status === 'recording' ? 'ghost' : 'solid';
  if (message !== undefined) $('#text').textContent = message;
}
function deadline(promise, ms, message, onLate) {
  let expired = false, timer;
  return Promise.race([
    promise.then(value => { if (expired) { onLate?.(value); throw new Error(message); } return value; }),
    new Promise((_, reject) => { timer = setTimeout(() => { expired = true; reject(new Error(message)); }, ms); })
  ]).finally(() => clearTimeout(timer));
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
  return deadline(navigator.mediaDevices.getUserMedia({ audio }), 30000,
    'No se recibió permiso de micrófono. Revisa los permisos del sistema y vuelve a intentarlo.',
    lateStream => lateStream.getTracks().forEach(track => track.stop()));
}
async function start() {
  if (stage !== 'idle') return;
  stage = 'starting'; stopRequested = null; writeError = null; writes = Promise.resolve(); pending = 0;
  ui('starting', 'Esperando permiso de micrófono…');
  try {
    const state = await window.alex.state(); let warning = '';
    try { stream = await openMic(state.settings.microphoneId); }
    catch (e) {
      if (state.settings.microphoneId !== 'default' && ['NotFoundError', 'OverconstrainedError'].includes(e.name)) {
        stream = await openMic('default'); warning = 'Micrófono seleccionado no disponible; usando el predeterminado.';
      } else throw e;
    }
    // Use the sound server's native rate. The tested worklet converts to 16 kHz.
    audioCtx = new AudioContext({ latencyHint: 'interactive' });
    ui('starting', 'Iniciando el motor de audio…');
    await deadline(audioCtx.resume(), 6000, 'El motor de audio no respondió. Comprueba el dispositivo de sonido y vuelve a intentarlo.');
    ui('starting', 'Preparando la captura local…');
    await deadline(audioCtx.audioWorklet.addModule('pcm-worklet.js'), 8000, 'No se pudo preparar el motor de audio.');
    processor = new AudioWorkletNode(audioCtx, 'alex-pcm');
    source = audioCtx.createMediaStreamSource(stream);
    analyser = audioCtx.createAnalyser(); analyser.fftSize = 256;
    // Announce recording only after the engine and capture worklet are ready.
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
    started = performance.now(); stage = 'recording';
    stream.getAudioTracks()[0].onended = () => { if (stage === 'recording') stop(true); };
    ui('recording', warning || 'Habla con naturalidad. Tu audio se está guardando.');
    $('#hint').textContent = 'Pulsa el atajo para terminar · guardar sin enviar desde la bandeja';
    maxTimer = setTimeout(() => stop(), 30 * 60 * 1000); draw();
    if (stopRequested !== null) await stop(stopRequested);
  } catch (error) {
    const failedId = rid; await release(); stage = 'idle'; rid = null;
    await window.alex.recordingAborted({ id: failedId, error: error.message }).catch(() => {});
    ui('failed', 'No se pudo iniciar: ' + error.message);
  }
}
async function release() {
  cancelAnimationFrame(anim); clearTimeout(maxTimer);
  const oldStream = stream, oldContext = audioCtx, oldSource = source, oldProcessor = processor;
  stream = audioCtx = source = processor = analyser = null;
  if (oldStream) oldStream.getTracks().forEach(t => { t.onended = null; t.stop(); });
  try { oldSource?.disconnect(); oldProcessor?.disconnect(); } catch (_) {}
  try { if (oldContext) await deadline(oldContext.close(), 2000, 'Cierre de audio pendiente.'); } catch (_) {}
}
async function stop(saveOnly = false) {
  if (stage === 'starting') { stopRequested = saveOnly; return; }
  if (stage !== 'recording') return;
  stage = 'stopping'; ui('processing', 'Guardando los últimos fragmentos…');
  cancelAnimationFrame(anim); clearTimeout(maxTimer);
  const id = rid;
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('El micrófono no respondió al cierre.')), 2000);
      flushResolve = () => { clearTimeout(timer); resolve(); };
      processor.port.postMessage('flush');
    });
    await writes; await release(); rid = null;
    if (writeError) await window.alex.recordingAborted({ id, error: writeError.message });
    else if (saveOnly) await window.alex.recordingCancelled(id);
    else await window.alex.recordingFinished({ id });
  } catch (error) {
    await release();
    await window.alex.recordingAborted({ id, error: error.message }).catch(() => {}); rid = null;
    ui('failed', error.message + ' Revisa el audio guardado en Historial.');
  } finally { stage = 'idle'; flushResolve = null; stopRequested = null; }
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
