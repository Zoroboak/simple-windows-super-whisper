const test=require('node:test');
const assert=require('node:assert/strict');
const {postProcess,applyDictionaryPrompt,joinSegments,parseRetryAfter,markRouteFailure,markRouteSuccess,routeCooldown,resetRouteHealth}=require('../src/providers');
test('snippets expand case-insensitively',()=>{const s={snippets:[{trigger:'mi firma',expansion:'Pedro'}],settings:{cleanupFillers:false}};assert.equal(postProcess('Incluye mi firma aquí',s),'Incluye Pedro aquí')});
test('filler cleanup is optional',()=>{const s={snippets:[],settings:{cleanupFillers:true}};assert.equal(postProcess('Hola eh esto funciona',s),'Hola esto funciona')});
test('dictionary prompt includes preferred spellings',()=>assert.match(applyDictionaryPrompt([{term:'Zoroboak'}]),/Zoroboak/));
test('joinSegments removes spaces before punctuation',()=>assert.equal(joinSegments(['Hola mundo',' , seguimos.']),'Hola mundo, seguimos.'));
test('route circuit breaker cools down transient failures and clears on success',()=>{resetRouteHealth();const err=new Error('upstream down');err.status=503;const h=markRouteFailure('route-x',err,1000);assert.ok(h.blockedUntil>=11000);assert.ok(routeCooldown('route-x',1500).remainingMs>0);markRouteSuccess('route-x');assert.equal(routeCooldown('route-x',1500),null)});
test('Retry-After supports seconds and HTTP dates',()=>{assert.equal(parseRetryAfter('3',1000),3000);assert.equal(parseRetryAfter(new Date(6000).toUTCString(),1000),5000)});
