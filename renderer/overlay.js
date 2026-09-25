let stream, audioCtx, source, analyser, processor, anim, started=0, rid=null, stopping=false, microphoneLabel='';
const $=s=>document.querySelector(s), dot=$('#dot'), label=$('#label'), timer=$('#timer'), text=$('#text'), canvas=$('#wave'), ctx=canvas.getContext('2d'), hint=$('#hint');
function ui(status,msg){dot.className='dot '+({recording:'live',processing:'work',done:'ok',failed:'bad'}[status]||'');label.textContent={recording:'Escuchando',processing:'Procesando',done:'Listo',failed:'Error'}[status]||status;text.className=status==='recording'?'ghost':'solid';if(msg!==undefined)text.textContent=msg}
function draw(){if(!analyser)return;const data=new Uint8Array(analyser.frequencyBinCount);analyser.getByteTimeDomainData(data);ctx.clearRect(0,0,canvas.width,canvas.height);ctx.beginPath();for(let i=0;i<data.length;i++){const x=i/(data.length-1)*canvas.width,y=(data[i]/255)*canvas.height;i?ctx.lineTo(x,y):ctx.moveTo(x,y)}ctx.strokeStyle='rgba(174,180,193,.58)';ctx.lineWidth=1.5;ctx.stroke();timer.textContent=((performance.now()-started)/1000).toFixed(1)+'s';anim=requestAnimationFrame(draw)}
function floatTo16(float32){const out=new Int16Array(float32.length);for(let i=0;i<float32.length;i++){const s=Math.max(-1,Math.min(1,float32[i]));out[i]=s<0?s*0x8000:s*0x7fff}return out}
function resampleTo16k(float32,sourceRate){
  if(!sourceRate||Math.abs(sourceRate-16000)<1)return floatTo16(float32);
  const ratio=sourceRate/16000;
  const outLength=Math.max(1,Math.round(float32.length/ratio));
  const out=new Int16Array(outLength);
  if(ratio>=1){
    for(let i=0;i<outLength;i++){
      const start=Math.floor(i*ratio),end=Math.min(float32.length,Math.max(start+1,Math.floor((i+1)*ratio)));
      let sum=0;for(let j=start;j<end;j++)sum+=float32[j];
      const sample=Math.max(-1,Math.min(1,sum/Math.max(1,end-start)));out[i]=sample<0?sample*0x8000:sample*0x7fff;
    }
  }else{
    for(let i=0;i<outLength;i++){const pos=i*ratio,lo=Math.floor(pos),hi=Math.min(float32.length-1,lo+1),frac=pos-lo;const sample=Math.max(-1,Math.min(1,float32[lo]*(1-frac)+float32[hi]*frac));out[i]=sample<0?sample*0x8000:sample*0x7fff}
  }
  return out;
}
async function openMic(deviceId){const audio={channelCount:1,echoCancellation:true,noiseSuppression:true,autoGainControl:true};if(deviceId&&deviceId!=='default')audio.deviceId={exact:deviceId};return navigator.mediaDevices.getUserMedia({audio})}
async function start(){if(stream||stopping)return;try{const state=await window.alex.state();let warning='';try{stream=await openMic(state.settings.microphoneId)}catch(e){if(state.settings.microphoneId&&state.settings.microphoneId!=='default'){stream=await openMic('default');warning='Micrófono elegido no disponible; usando el predeterminado.'}else throw e}microphoneLabel=stream.getAudioTracks()[0]?.label||'';rid=await window.alex.recordingStarted({microphoneLabel});audioCtx=new AudioContext({sampleRate:16000});source=audioCtx.createMediaStreamSource(stream);analyser=audioCtx.createAnalyser();analyser.fftSize=256;processor=audioCtx.createScriptProcessor(4096,1,1);processor.onaudioprocess=e=>{const pcm=resampleTo16k(e.inputBuffer.getChannelData(0),audioCtx.sampleRate);window.alex.recordingChunk(rid,new Uint8Array(pcm.buffer))};source.connect(analyser);source.connect(processor);processor.connect(audioCtx.destination);started=performance.now();ui('recording',warning||'Habla con naturalidad…');hint.textContent='Esc cancela · pulsa el atajo de nuevo para terminar';draw()}catch(e){ui('failed','No se pudo abrir el micrófono: '+e.message)}}
async function stop(){if(!stream||stopping)return;stopping=true;ui('processing','Cerrando WAV local…');cancelAnimationFrame(anim);const durationMs=performance.now()-started;stream.getTracks().forEach(t=>t.stop());processor?.disconnect();source?.disconnect();await audioCtx?.close();const id=rid;stream=null;processor=null;source=null;audioCtx=null;rid=null;try{await window.alex.recordingFinished({id,durationMs,microphoneLabel})}finally{stopping=false}}
async function cancel(){if(stopping)return;stopping=true;cancelAnimationFrame(anim);stream?.getTracks().forEach(t=>t.stop());processor?.disconnect();source?.disconnect();try{await audioCtx?.close()}catch(_){}const id=rid;stream=null;processor=null;source=null;audioCtx=null;rid=null;await window.alex.recordingCancelled(id);stopping=false}
window.alex.onLiveText(d=>{if(d.text){text.textContent=d.text;text.className='ghost'}if(d.warning)label.textContent=d.warning});window.alex.onCommand(c=>c.type==='start'?start():c.type==='stop'?stop():c.type==='cancel'?cancel():null);window.alex.onStatus(s=>ui(s.status,s.text+(s.warning?' · '+s.warning:'')));window.alex.onHint(d=>{if(d?.text)hint.textContent=d.text});window.addEventListener('keydown',e=>{if(e.key==='Escape')cancel()});
