const test=require('node:test');
const assert=require('node:assert/strict');
const {createWavBuffer,parseWav,splitWavBuffer,findSilenceCut}=require('../src/audio');
function tone(seconds=1,sampleRate=16000,amp=0.3){const b=Buffer.alloc(Math.floor(seconds*sampleRate)*2);for(let i=0;i<b.length/2;i++)b.writeInt16LE(Math.round(Math.sin(i/10)*amp*32767),i*2);return b}
test('createWavBuffer creates parseable PCM16 mono wav',()=>{const wav=createWavBuffer(tone(.5));const p=parseWav(wav);assert.equal(p.sampleRate,16000);assert.equal(p.channels,1);assert.equal(p.pcm.length,16000)});
test('splitWavBuffer splits long audio under configured duration',()=>{const pcm=Buffer.concat([tone(4),Buffer.alloc(16000*2),tone(4),Buffer.alloc(16000*2),tone(4)]);const parts=splitWavBuffer(createWavBuffer(pcm),6,{searchSeconds:2,minSegmentSeconds:2});assert.ok(parts.length>=2);assert.ok(parts.every(p=>p.endSec-p.startSec<8.1))});
test('silence cut prefers a quiet valley near target',()=>{const sr=16000;const pcm=Buffer.concat([tone(2,sr,.5),Buffer.alloc(sr*2),tone(2,sr,.5)]);const cut=findSilenceCut(pcm,sr,3*sr,1.5);assert.ok(cut>1.8*sr&&cut<4.2*sr)});
