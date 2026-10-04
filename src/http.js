// A deadline covers connection AND response body consumption, not only headers.
async function requestText(url, options = {}, timeoutMs = 25000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal, redirect: 'error' });
    const raw = await response.text();
    return { response, raw };
  } catch (error) {
    if (controller.signal.aborted) {
      const timeout = new Error(`El proveedor no respondió en ${Math.round(timeoutMs / 1000)} s.`);
      timeout.code = 'TIMEOUT';
      throw timeout;
    }
    throw error;
  } finally { clearTimeout(timer); }
}
module.exports = { requestText };
