const test=require('node:test');const assert=require('node:assert/strict');const {PROFILES,normalizeChain,endpointSummary}=require('../src/catalog');
test('balanced profile prioritizes paid route then free fallback',()=>{assert.equal(PROFILES.balanced.chain[0],'openrouter-mai2');assert.ok(PROFILES.balanced.chain.includes('groq-turbo'))});
test('normalizeChain removes invalid and duplicate routes',()=>assert.deepEqual(normalizeChain(['groq-turbo','nope','groq-turbo','groq-large']),['groq-turbo','groq-large']));
test('endpoint latency seconds are normalized to milliseconds',()=>assert.equal(endpointSummary({provider_name:'X',latency:0.25}).latencyMs,250));
