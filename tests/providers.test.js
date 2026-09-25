const test=require('node:test');const assert=require('node:assert/strict');const {postProcess,applyDictionaryPrompt,joinSegments}=require('../src/providers');
test('snippets expand case-insensitively',()=>{const s={snippets:[{trigger:'mi firma',expansion:'Pedro'}],settings:{cleanupFillers:false}};assert.equal(postProcess('Incluye mi firma aquí',s),'Incluye Pedro aquí')});
test('filler cleanup is optional',()=>{const s={snippets:[],settings:{cleanupFillers:true}};assert.equal(postProcess('Hola eh esto funciona',s),'Hola esto funciona')});
test('dictionary prompt includes preferred spellings',()=>assert.match(applyDictionaryPrompt([{term:'Zoroboak'}]),/Zoroboak/));
test('joinSegments removes spaces before punctuation',()=>assert.equal(joinSegments(['Hola mundo',' , seguimos.']),'Hola mundo, seguimos.'));
