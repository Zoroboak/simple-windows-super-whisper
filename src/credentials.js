const { requestText } = require('./http');
const TARGETS = {
  groq: 'https://api.groq.com/openai/v1/models',
  openrouter: 'https://openrouter.ai/api/v1/key',
  mistral: 'https://api.mistral.ai/v1/models',
  openai: 'https://api.openai.com/v1/models'
};
async function testCredential(name, key) {
  if (!TARGETS[name] || !key) throw new Error('Guarda primero una clave para este proveedor.');
  const started = Date.now();
  const { response } = await requestText(TARGETS[name], { headers: { Authorization: `Bearer ${key}` } }, 12000);
  if (!response.ok) {
    const text = response.status === 401 ? 'Clave rechazada.' : response.status === 429 ? 'Límite temporal del proveedor.' : `El proveedor respondió HTTP ${response.status}.`;
    throw new Error(text);
  }
  return { ok: true, latencyMs: Date.now() - started, checkedAt: new Date().toISOString(),
    note: 'Autenticación aceptada. Esta comprobación no envía audio ni certifica saldo, cuota o acceso a todos los modelos.' };
}
module.exports = { testCredential };
