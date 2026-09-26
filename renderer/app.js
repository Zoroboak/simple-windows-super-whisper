const NAV = [
  ['home', 'Inicio'],
  ['history', 'Historial'],
  ['dictionary', 'Diccionario'],
  ['snippets', 'Snippets'],
  ['providers', 'Proveedores'],
  ['settings', 'Ajustes'],
  ['diagnostics', 'Diagnóstico']
];

let state;
let updateState = { status: 'idle', currentVersion: '—' };
let route = 'home';
let capturedHotkey = null;
let onboardingStep = 0;
let onboardingProfile = 'balanced';
let dirty = false, suppressReload = false, wizardDismissed = false, noticeTimer;
let micTestStream = null;
const keyDrafts = {};
const obDrafts = {};
function toast(message) { const el = $('#toast'); el.textContent = String(message); el.hidden = false; clearTimeout(noticeTimer); noticeTimer = setTimeout(() => { el.hidden = true; }, 6500); }
function rememberKeys() { document.querySelectorAll('[data-key]').forEach(i => { if (i.value) keyDrafts[i.dataset.key] = i.value; }); }
window.addEventListener('unhandledrejection', e => { e.preventDefault(); toast(e.reason?.message || 'No se pudo completar la operación. Tus datos siguen guardados.'); });

const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));
const money = value => value == null ? '—' : `$${Number(value).toFixed(Number(value) < 0.1 ? 4 : 2)}/h`;

async function load() {
  const pad = $('#testPad'); const savedPad = pad ? { value: pad.value, focused: document.activeElement === pad, start: pad.selectionStart, end: pad.selectionEnd } : null;
  dirty = false;
  const [nextState, nextUpdate] = await Promise.all([
    window.alex.state(),
    window.alex.updateState().catch(() => updateState)
  ]);
  state = nextState;
  updateState = nextUpdate || updateState;
  $('#appVersion').textContent = `v${state.appVersion || updateState.currentVersion || '—'}`;
  renderNav();
  render();
  renderUpdateGift();
  if (savedPad && $('#testPad')) { const next = $('#testPad'); next.value = savedPad.value; if (savedPad.focused) { next.focus(); next.setSelectionRange(savedPad.start, savedPad.end); } }
  if (!wizardDismissed && !state.settings.onboardingComplete && !document.querySelector('.onboarding-modal')) openOnboarding();
}

window.alex.onStateChanged(() => { if (!dirty && !suppressReload && !document.querySelector('.onboarding-modal')) load(); });
window.alex.onNotice?.(data => toast(data.text));
$('#view').addEventListener('input', () => { dirty = true; });
$('#view').addEventListener('change', () => { dirty = true; });
window.alex.onUpdateStatus(next => {
  updateState = next;
  renderUpdateGift();
  if (document.querySelector('.update-modal')) showUpdateModal();
  // Update progress must not destroy unsaved settings fields.
});

$('#dictate').onclick = () => window.alex.toggle();
$('#updateGift').onclick = () => showUpdateModal();

function renderNav() {
  $('#nav').innerHTML = NAV.map(([id, label]) =>
    `<button data-r="${id}" class="${route === id ? 'active' : ''}">${label}</button>`
  ).join('');
  document.querySelectorAll('[data-r]').forEach(button => {
    button.onclick = () => {
      if (dirty && !confirm('Tienes cambios sin guardar. ¿Salir de esta pantalla?')) return;
      rememberKeys(); dirty = false; stopMicTest();
      route = button.dataset.r;
      renderNav();
      render();
    };
  });
}

function head(title, subtitle) {
  $('#title').textContent = title;
  $('#subtitle').textContent = subtitle;
}

function routeInfo(id) {
  return (state.routeCatalog || []).find(item => item.id === id);
}

function readyRoute() {
  return (state.routing.chain || []).map(routeInfo).find(item => item && state.secrets[item.keyRef]);
}

function routeStatsText(id) {
  const stats = state.routeStats?.[id];
  if (!stats?.attempts) return 'sin uso local todavía';
  const latency = stats.avgLatencyMs == null ? '—' : `${(stats.avgLatencyMs / 1000).toFixed(2)} s`;
  const cost = stats.costUsd ? ` · $${Number(stats.costUsd).toFixed(4)} real` : '';
  return `${stats.successRate}% éxito · ${latency} media${cost}`;
}

function statusBadge(item) {
  const labels = {
    done: 'completado', failed: 'fallido', queued: 'pendiente', processing: 'procesando',
    recording: 'grabando', cancelled: 'cancelado'
  };
  const className = item.status === 'done' ? 'ok' : item.status === 'failed' ? 'bad' : '';
  return `<span class="pill ${className}">${labels[item.status] || esc(item.status)}</span>`;
}

function attemptsHtml(item) {
  if (!item.attempts?.length) return '';
  return `<details class="attempts"><summary>${item.attempts.length} intento${item.attempts.length === 1 ? '' : 's'} / fallbacks</summary><div class="attempt-list">${item.attempts.map(attempt =>
    `<div class="attempt"><span class="pill ${attempt.status === 'ok' ? 'ok' : attempt.status === 'error' ? 'bad' : ''}">${esc(attempt.status || '')}</span><span>${esc(attempt.route || attempt.provider || '')}</span>${attempt.upstream ? `<span class="muted">vía ${esc(attempt.upstream)}</span>` : ''}${attempt.latencyMs != null ? `<span class="muted">${(attempt.latencyMs / 1000).toFixed(2)} s</span>` : ''}${attempt.segments > 1 ? `<span class="muted">${attempt.segments} segmentos</span>` : ''}${attempt.error ? `<span class="bad small">${esc(attempt.error)}</span>` : ''}</div>`
  ).join('')}</div></details>`;
}

function profileLabel() {
  if (state.routing.profile === 'custom') return 'Personalizado';
  return state.profiles?.[state.routing.profile]?.name || 'Personalizado';
}

function quickGuideHtml() {
  return `<div class="quick-guide">
    <div class="guide-card recommended"><span class="eyebrow">Recomendado</span><b>MAI-Transcribe 2</b><small>Buen equilibrio para español, términos propios y cambio de idioma. Se usa desde OpenRouter con un único saldo.</small></div>
    <div class="guide-card"><span class="eyebrow">Gratis</span><b>Groq · Whisper Turbo</b><small>La forma más sencilla de empezar sin coste mientras estés dentro de los límites gratuitos de Groq.</small></div>
    <div class="guide-card"><span class="eyebrow">Alternativa de precisión</span><b>GPT Transcribe</b><small>Úsalo cuando prefieras precisión frente a coste. Mantén Groq como fallback para no quedarte sin dictado.</small></div>
  </div>`;
}

function render() {
  rememberKeys();
  const view = $('#view');
  if (route === 'home') renderHome(view);
  else if (route === 'history') renderHistory(view);
  else if (route === 'dictionary') renderDictionary(view);
  else if (route === 'snippets') renderSnippets(view);
  else if (route === 'providers') renderProviders(view);
  else if (route === 'settings') renderSettings(view);
  else if (route === 'diagnostics') renderDiagnostics(view);
  document.querySelectorAll('[data-key]').forEach(i => { if (keyDrafts[i.dataset.key]) i.value = keyDrafts[i.dataset.key]; });
  labelControls();
}

function renderHome(view) {
  const metrics = state.stats;
  const primary = readyRoute();
  const chain = (state.routing.chain || []).map(routeInfo).filter(Boolean);
  head('Inicio', 'Dicta en cualquier aplicación con el menor número de pasos posible.');
  view.innerHTML = `${!primary ? `<div class="setup-callout"><div><h3>Termina la configuración en 2 minutos</h3><p>Elige gratis o premium, pega la clave de tu cuenta y Alex Dictate quedará preparado para usar en cualquier aplicación.</p></div><button class="primary" id="startSetup">Configurar ahora</button></div>` : ''}
    <div class="grid metrics">
      <div class="card"><h3>Palabras dictadas</h3><div class="metric">${metrics.totalWords.toLocaleString()}</div><span class="muted">histórico local</span></div>
      <div class="card"><h3>Tiempo hablado</h3><div class="metric">${Math.round(metrics.totalSeconds / 60)} min</div><span class="muted">dictados completados</span></div>
      <div class="card"><h3>Fiabilidad</h3><div class="metric">${metrics.total ? metrics.successRate + '%' : '—'}</div><span class="muted">por dictado, no por reintento</span></div>
    </div>
    <div class="home-grid">
      <div class="card"><div class="row between"><div><h3>${primary ? 'Listo para dictar' : 'Aún sin proveedor listo'}</h3><p class="muted">${primary ? `Perfil <b>${esc(profileLabel())}</b> · primera ruta lista: <b>${esc(primary.name)}</b>` : 'Añade una clave de OpenRouter o Groq para activar la cadena.'}</p></div><span class="status-big ${primary ? 'ready' : 'warn'}">${primary ? 'Preparado' : 'Configurar'}</span></div><div class="route-mini">${chain.map((item, index) => `<span class="route-chip ${state.secrets[item.keyRef] ? '' : 'dim'}">${index + 1}. ${esc(item.name)}</span>`).join('')}</div></div>
      <div class="card"><h3>Acceso instantáneo</h3><div class="big-kbd">${esc(state.settings.hotkey)}</div><p class="muted">Pulsa una vez para empezar y otra para terminar. También puedes mapear un botón del ratón a <code>alex-dictate://toggle</code>.</p></div>
    </div>
    <div class="card"><div class="row between"><div><h3>¿Qué configuración elegir?</h3><p class="muted">No necesitas conocer modelos. Estas tres opciones cubren casi todos los casos.</p></div><button class="secondary" id="openProviders">Ver proveedores</button></div>${quickGuideHtml()}</div>
    <div class="notice" style="margin-top:14px"><b>Audio recuperable:</b> cada fragmento se guarda antes de enviarlo. La transcripción final utiliza el WAV completo. Si un proveedor falla, se usa el siguiente; si todos fallan, tu audio sigue en Historial.</div>`;
  view.insertAdjacentHTML('beforeend', '<div class="card"><h3>Tu primer dictado</h3><p class="muted">Haz clic aquí y pulsa tu atajo. Prueba: «Mañana revisamos el informe SEO de Pedro». El audio se envía a tu proveedor configurado.</p><textarea id="testPad" aria-label="Zona de prueba de dictado" placeholder="El texto aparecerá aquí…"></textarea><button class="secondary" id="testHere">Probar en este cuadro</button></div>');
  $('#testHere').onclick = () => { $('#testPad').focus(); window.alex.toggle(true); };
  if ($('#startSetup')) $('#startSetup').onclick = () => openOnboarding();
  $('#openProviders').onclick = () => { route = 'providers'; renderNav(); render(); };
}

function renderHistory(view) {
  head('Historial', 'Reintenta, descarga o inspecciona exactamente qué fallback se utilizó.');
  view.innerHTML = state.history.length ? `<div class="list">${state.history.map(item =>
    `<div class="history"><div class="row between"><div class="row">${statusBadge(item)}<span class="muted">${new Date(item.createdAt).toLocaleString()}</span></div><span class="muted">${Math.round((item.durationMs || 0) / 1000)} s · ${Math.round((item.bytes || 0) / 1024)} KB</span></div><div class="history-text">${esc(item.text || item.error || 'Audio pendiente de transcripción')}</div><div class="muted">${item.provider ? `Ruta: ${esc(item.provider)}${item.model ? ` · ${esc(item.model)}` : ''}` : 'Sin ruta final todavía'}${item.microphoneLabel ? ` · ${esc(item.microphoneLabel)}` : ''}</div>${item.insertionWarning ? `<p class="muted">${esc(item.insertionWarning)}</p>` : ''}${attemptsHtml(item)}<div class="actions" style="margin-top:10px">${item.status !== 'recording' && item.audioPath ? `<button class="secondary" data-retry="${item.id}" ${state.runtime?.phase && state.runtime.phase !== 'idle' ? 'disabled' : ''}>Reintentar</button>` : ''}${item.text ? `<button class="secondary" data-copy="${item.id}">Copiar texto</button>` : ''}${item.audioPath ? `<button class="secondary" data-audio="${item.id}">Exportar audio…</button>` : ''}<button class="danger" data-del="${item.id}" ${['recording','processing'].includes(item.status) ? 'disabled' : ''}>Eliminar</button></div></div>`
  ).join('')}</div>` : '<div class="empty">Todavía no hay dictados.</div>';
  if (state.history.length) { view.insertAdjacentHTML('afterbegin', '<input id="historySearch" type="search" aria-label="Buscar dictados" placeholder="Buscar en tu historial…">'); $('#historySearch').oninput = e => { document.querySelectorAll('.history').forEach(card => { card.hidden = !card.textContent.toLowerCase().includes(e.target.value.toLowerCase()); }); }; }
  bindHistory();
}

function renderDictionary(view) {
  head('Diccionario', 'Nombres, clientes, marcas y términos técnicos que deben reconocerse correctamente.');
  view.innerHTML = `<div class="card"><div id="dictList" class="list">${(state.dictionary || []).map((item, index) => `<div class="row"><input value="${esc(typeof item === 'string' ? item : item.term)}" data-di="${index}" placeholder="Ej. Zoroboak"><button class="danger" data-dr="${index}">Quitar</button></div>`).join('')}</div><div class="actions" style="margin-top:12px"><button class="secondary" id="addDict">+ Añadir</button><button class="primary" id="saveDict">Guardar diccionario</button></div><p class="muted">Añade nombres y marcas tal como quieres que se escriban. Alex Dictate los envía al proveedor cuando su API permite biasing o prompt de vocabulario.</p></div>`;
  bindDictionary();
}

function renderSnippets(view) {
  head('Snippets', 'Expande frases habladas en texto completo después de la transcripción.');
  view.innerHTML = `<div class="stack" id="snipList">${(state.snippets || []).map((item, index) => `<div class="card"><div class="field"><label>Disparador hablado</label><input data-st="${index}" value="${esc(item.trigger)}" placeholder="mi firma"></div><div class="field" style="margin-top:9px"><label>Expansión</label><textarea data-se="${index}">${esc(item.expansion)}</textarea></div><button class="danger" data-sr="${index}" style="margin-top:9px">Quitar</button></div>`).join('')}</div><div class="actions" style="margin-top:12px"><button class="secondary" id="addSnip">+ Añadir</button><button class="primary" id="saveSnip">Guardar snippets</button></div>`;
  bindSnippets();
}

function renderProviders(view) {
  head('Proveedores', 'Elige un perfil sencillo o define tu cadena. Solo se compara el catálogo cuando tú lo pides.');
  const profiles = state.profiles || {};
  const chain = state.routing.chain || [];
  const used = new Set(chain);
  const available = (state.routeCatalog || []).filter(item => !used.has(item.id));
  view.innerHTML = `<div class="card"><h3>Guía rápida</h3><p class="muted">Si no quieres pensar en modelos, usa <b>Premium equilibrado</b>. Si quieres coste cero, usa <b>Gratis</b>.</p>${quickGuideHtml()}</div>
    <div class="notice" style="margin-top:14px"><b>Tu orden es persistente.</b> No hacemos benchmark antes de cada dictado. “Actualizar catálogo” solo consulta OpenRouter cuando tú pulsas el botón.</div>
    <section class="section"><h2>1. Elige un perfil</h2><div class="profile-grid">${Object.values(profiles).map(profile => `<button class="profile ${state.routing.profile === profile.id ? 'selected' : ''}" data-profile="${profile.id}"><b>${esc(profile.name)}</b><span>${esc(profile.description)}</span></button>`).join('')}<button class="profile ${state.routing.profile === 'custom' ? 'selected' : ''}" data-profile="custom"><b>Personalizado</b><span>Tu orden manual persistente.</span></button></div></section>
    <section class="section"><div class="row between"><div><h2>2. Cadena real de prioridad</h2><p class="muted">Solo pasa al siguiente si falla, hay timeout/429 o falta credencial.</p></div><button class="primary" id="saveChain">Guardar cadena</button></div><div class="chain" id="chain">${chain.map((id, index) => { const item = routeInfo(id); if (!item) return ''; return `<div class="route-row" data-route="${item.id}"><span class="order">${index + 1}</span><div class="route-main"><b>${esc(item.name)}</b><div class="muted"><code>${esc(item.model)}</code> · ${money(item.costPerHourUsd)} · ${esc(item.badge || '')}</div><small>${esc(item.note || '')}</small><div class="muted small">Tu uso: ${esc(routeStatsText(item.id))}</div></div><span class="pill ${state.secrets[item.keyRef] ? 'ok' : 'bad'}">${state.secrets[item.keyRef] ? 'clave lista' : `falta ${esc(item.keyRef)}`}</span><div class="route-actions"><button class="icon" data-up="${index}" ${index === 0 ? 'disabled' : ''}>↑</button><button class="icon" data-down="${index}" ${index === chain.length - 1 ? 'disabled' : ''}>↓</button><button class="icon danger" data-remove="${index}">×</button></div></div>`; }).join('')}</div><div class="row add-route"><select id="addRoute"><option value="">Añadir otra ruta…</option>${available.map(item => `<option value="${item.id}">${esc(item.name)} · ${money(item.costPerHourUsd)}</option>`).join('')}</select><button class="secondary" id="addRouteBtn">Añadir</button></div></section>
    <section class="section"><h2>3. Credenciales</h2><div class="credential-grid">${credentialCard('openrouter', 'OpenRouter', 'Una sola clave para los modelos premium/económicos', 'https://openrouter.ai/settings/keys')}${credentialCard('groq', 'Groq', 'Free tier + fallback directo', 'https://console.groq.com/keys')}${credentialCard('mistral', 'Mistral', 'Realtime ghost text + batch directo', 'https://console.mistral.ai/api-keys/')}${credentialCard('openai', 'OpenAI directo', 'Fallback opcional independiente', 'https://platform.openai.com/api-keys')}</div><div class="field region-field"><label>Región OpenRouter</label><select id="orRegion"><option value="global">Global · máxima disponibilidad</option><option value="eu">EU in-region · solo endpoints europeos</option></select></div><button class="primary" id="saveKeys">Guardar claves y región</button></section>
    <section class="section"><div class="row between"><div><h2>4. Catálogo OpenRouter bajo demanda</h2><p class="muted">Úsalo para decidir; nunca cambia automáticamente tu cadena.</p></div><button class="secondary" id="refreshCatalog">Actualizar catálogo</button></div><div class="notice subtle">OpenRouter decide actualmente el proveedor interno de STT. Alex Dictate muestra endpoints/latencias como referencia, pero no finge poder fijar Groq/DeepInfra/Together dentro de una petición OpenRouter.</div><div id="catalog">${catalogHtml()}</div></section>`;
  view.insertAdjacentHTML('afterbegin', '<p class="muted small">Precios orientativos de septiembre de 2026, sin impuestos. Las cuotas gratis dependen de tu cuenta. Las latencias reales dependen también de la duración del audio.</p>');
  $('#orRegion').value = state.settings.openRouterRegion || 'global';
  bindProviders();
}

function credentialCard(key, name, note, url) {
  return `<div class="card"><div class="row between"><div><b>${name}</b><div class="muted">${note}</div></div><span class="pill ${state.secrets[key] ? 'ok' : ''}">${state.secrets[key] ? 'guardada' : 'sin clave'}</span></div><div class="field" style="margin-top:10px"><input type="password" data-key="${key}" placeholder="${state.secrets[key] ? '•••••••• · vacío = conservar' : 'Pega tu clave API'}"></div><div class="api-help"><button class="link-button" data-open="${url}">Crear / gestionar clave ↗</button>${state.secrets[key] ? `<button class="link-button" data-test-key="${key}">Comprobar clave</button><button class="link-button bad" data-clear-key="${key}">Eliminar clave</button>` : ''}</div></div>`;
}

function catalogHtml() {
  const catalog = state.routing.catalog || [];
  if (!catalog.length) return '<div class="empty compact">Aún no has actualizado el catálogo. No hace falta hacerlo para dictar.</div>';
  return `<div class="catalog-list">${catalog.map(model => `<details class="catalog-model"><summary><b>${esc(model.name || model.model)}</b><span class="muted">${esc(model.model)}</span><span>${model.endpoints?.length || 0} endpoints</span></summary>${model.error ? `<div class="bad">${esc(model.error)}</div>` : `<div class="endpoint-grid">${(model.endpoints || []).map(endpoint => `<div class="endpoint"><b>${esc(endpoint.provider)}</b><span>Latencia ${endpoint.latencyMs == null ? '—' : `${endpoint.latencyMs} ms`}</span><span>Throughput ${endpoint.throughput == null ? '—' : Number(endpoint.throughput).toFixed(1)}</span><span>Uptime ${endpoint.uptime == null ? '—' : `${Number(endpoint.uptime).toFixed(2)}%`}</span>${endpoint.quantization ? `<span>${esc(endpoint.quantization)}</span>` : ''}<details><summary>Tarifas publicadas</summary><pre>${esc(JSON.stringify(endpoint.pricing || {}, null, 2))}</pre><small>Valores y unidades de OpenRouter; no equivalen necesariamente a precio por hora.</small></details></div>`).join('') || '<div class="muted">OpenRouter no devolvió endpoints medibles para este modelo.</div>'}</div>`}</details>`).join('')}</div><p class="muted">Actualizado: ${state.routing.catalogUpdatedAt ? new Date(state.routing.catalogUpdatedAt).toLocaleString() : '—'}</p>`;
}

function renderSettings(view) {
  head('Ajustes', 'Todo lo necesario para dejar Alex Dictate a tu gusto sin tocar archivos ni comandos.');
  const updateDescription = updateStatusText();
  view.innerHTML = `<div class="settings-grid">
    <div class="card stack"><h3>Entrada</h3><div class="field"><label>Atajo global</label><input id="hotkey" class="hotkey-capture" readonly value="${esc(state.settings.hotkey)}"><span class="muted">Haz clic y pulsa la nueva combinación. El anterior sigue activo hasta confirmar que el nuevo funciona.</span></div><div class="field"><label>Micrófono</label><div class="row"><select id="mic"><option value="default">Predeterminado del sistema</option></select><button class="secondary" id="refreshMic">Actualizar</button></div><span class="muted">Si desaparece un USB/Bluetooth seleccionado, cae automáticamente al predeterminado.</span></div><div class="field"><label>Idioma</label><select id="lang"><option value="auto">Automático</option><option value="es">Español</option><option value="en">English</option><option value="pt">Português</option><option value="fr">Français</option></select></div></div>
    <div class="card stack"><h3>Inserción</h3><label class="row"><input id="autopaste" type="checkbox" ${state.settings.autoPaste ? 'checked' : ''}> Pegar automáticamente al terminar</label><div class="field"><label>Modo</label><select id="insertMode"><option value="final-safe">Final seguro · recomendado</option><option value="live-experimental">Escritura en vivo · experimental</option></select><span class="muted">Final seguro muestra ghost text y pega una sola vez. En vivo inserta deltas realtime; la versión final queda en portapapeles.</span></div><label class="row"><input id="fillers" type="checkbox" ${state.settings.cleanupFillers ? 'checked' : ''}> Limpiar muletillas simples (um/uh/eh)</label></div>
    <div class="card stack"><h3>Realtime</h3><label class="row"><input id="live" type="checkbox" ${state.settings.livePreview ? 'checked' : ''}> Mostrar transcripción fantasma con Mistral Voxtral</label><div class="field"><label>Retardo objetivo</label><input id="liveDelay" type="range" min="240" max="1800" step="50" value="${state.settings.liveTargetDelayMs || 650}"><span class="muted" id="delayLabel">${state.settings.liveTargetDelayMs || 650} ms</span></div><span class="muted">Necesita una clave API de Mistral. El dictado final sigue funcionando aunque el realtime se desconecte.</span></div>
    <div class="card stack"><h3>Datos locales</h3><div class="field"><label>Conservar WAV de completados</label><input id="days" type="number" min="-1" value="${state.settings.keepCompletedAudioDays}"><span class="muted">-1 conserva siempre; 0 limpia completados en el siguiente arranque. Los fallidos y pendientes no se borran automáticamente.</span></div><div class="notice subtle"><b>Botón de ratón:</b> mapea el botón a tu hotkey o a <code>alex-dictate://toggle</code>. Evitamos hooks privilegiados de dispositivo.</div></div>
    <div class="card stack"><h3>Actualizaciones</h3><div class="version-row"><span>Versión instalada</span><strong>v${esc(state.appVersion || updateState.currentVersion)}</strong></div><p class="muted">${esc(updateDescription)}</p><label class="row"><input id="autoUpdates" type="checkbox" ${state.settings.checkUpdatesAutomatically ? 'checked' : ''}> Comprobar novedades automáticamente</label><div class="actions"><button class="secondary" id="checkUpdates">Buscar actualización</button><button class="secondary" id="showSetup">Repetir configuración inicial</button></div></div>
  </div><button class="primary save-wide" id="saveSettings">Guardar ajustes</button>`;
  $('#lang').value = state.settings.language;
  $('#insertMode').value = state.settings.insertionMode || 'final-safe';
  const row = $('#refreshMic').parentElement; const test = document.createElement('button'); test.className = 'secondary'; test.textContent = 'Probar micrófono (5 s)'; test.onclick = () => testMic(test); row.parentElement.appendChild(test);
  bindSettings();
}

function renderDiagnostics(view) {
  head('Diagnóstico', 'Comprueba hotkey, sesión gráfica, herramientas de pegado y cadena real.');
  view.innerHTML = '<div class="card" id="diag">Comprobando…</div>';
  window.alex.diagnose().then(data => {
    const waylandAction = data.wayland && !data.ydotool?.ready
      ? '<div class="actions" style="margin-top:12px"><button class="primary" id="setupWayland">Preparar autopegado KDE/Wayland</button></div>'
      : '';
    if (!$('#diag')) return;
    $('#diag').innerHTML = `<div class="diag-grid">${Object.entries(data).filter(([key]) => !['routeReadiness', 'tools', 'ydotool'].includes(key)).map(([key, value]) => `<div><span class="muted">${esc(key)}</span><strong>${esc(Array.isArray(value) ? value.join(' → ') : (value && typeof value === 'object' ? JSON.stringify(value) : value))}</strong></div>`).join('')}</div>${data.tools ? `<div class="card inset"><h3>Herramientas Linux</h3>${Object.entries(data.tools).map(([key, value]) => `<div class="row between"><span>${esc(key)}</span><span class="pill ${value ? 'ok' : 'bad'}">${value ? 'disponible' : 'no'}</span></div>`).join('')}</div>` : ''}${data.ydotool ? `<div class="card inset"><h3>Estado ydotool / Wayland</h3>${Object.entries(data.ydotool).map(([key, value]) => `<div class="row between"><span>${esc(key)}</span><span class="pill ${value ? 'ok' : 'bad'}">${typeof value === 'boolean' ? (value ? 'sí' : 'no') : esc(value)}</span></div>`).join('')}</div>` : ''}<div class="card inset"><h3>Rutas configuradas</h3>${(data.routeReadiness || []).map((item, index) => `<div class="row between"><span>${index + 1}. ${esc(item.id)}</span><span class="pill ${item.ready ? 'ok' : 'bad'}">${item.ready ? 'lista' : `falta ${esc(item.keyRef)}`}</span></div>`).join('')}</div><div class="notice">${esc(data.recommendation || '')}</div>${waylandAction}`;
    if ($('#setupWayland')) $('#setupWayland').onclick = async () => {
      try { await window.alex.setupWayland(); alert('Se ha abierto el asistente en una terminal. Sigue los pasos y vuelve a Diagnóstico cuando termine.'); }
      catch (error) { alert(`No se pudo abrir el asistente: ${error.message}`); }
    };
  });
}

function bindHistory() {
  document.querySelectorAll('[data-retry]').forEach(button => button.onclick = () => window.alex.retry(button.dataset.retry));
  document.querySelectorAll('[data-copy]').forEach(button => button.onclick = () => window.alex.copyText(button.dataset.copy));
  document.querySelectorAll('[data-audio]').forEach(button => button.onclick = () => window.alex.downloadAudio(button.dataset.audio));
  document.querySelectorAll('[data-del]').forEach(button => button.onclick = async () => {
    if (!confirm('¿Eliminar este dictado y su audio local?')) return;
    await window.alex.deleteHistory(button.dataset.del);
    await load();
  });
}

function bindDictionary() {
  let list = (state.dictionary || []).map(item => typeof item === 'string' ? { term: item } : item);
  document.querySelectorAll('[data-di]').forEach(i => i.oninput = () => { list[Number(i.dataset.di)] = { term: i.value }; state.dictionary = list; });
  $('#addDict').onclick = () => { list.push({ term: '' }); state.dictionary = list; render(); };
  document.querySelectorAll('[data-dr]').forEach(button => button.onclick = () => { list.splice(Number(button.dataset.dr), 1); state.dictionary = list; render(); });
  $('#saveDict').onclick = async () => {
    document.querySelectorAll('[data-di]').forEach(input => list[Number(input.dataset.di)] = { term: input.value.trim() });
    await window.alex.saveDictionary(list.filter(item => item.term));
    await load(); toast('Diccionario guardado.');
  };
}

function bindSnippets() {
  let list = [...(state.snippets || [])];
  document.querySelectorAll('[data-st],[data-se]').forEach(i => i.oninput = () => { const n = Number(i.dataset.st ?? i.dataset.se); list[n] = { ...list[n], [i.dataset.st !== undefined ? 'trigger' : 'expansion']: i.value }; state.snippets = list; });
  $('#addSnip').onclick = () => { list.push({ trigger: '', expansion: '' }); state.snippets = list; render(); };
  document.querySelectorAll('[data-sr]').forEach(button => button.onclick = () => { list.splice(Number(button.dataset.sr), 1); state.snippets = list; render(); });
  $('#saveSnip').onclick = async () => {
    document.querySelectorAll('[data-st]').forEach(input => { const index = Number(input.dataset.st); list[index] = { ...list[index], trigger: input.value.trim() }; });
    document.querySelectorAll('[data-se]').forEach(input => { const index = Number(input.dataset.se); list[index] = { ...list[index], expansion: input.value }; });
    await window.alex.saveSnippets(list.filter(item => item.trigger));
    await load();
  };
}

function bindProviders() {
  document.querySelectorAll('[data-test-key]').forEach(b => b.onclick = async () => { b.disabled = true; try { const result = await window.alex.testCredential(b.dataset.testKey); toast(result.note); } finally { b.disabled = false; } });
  document.querySelectorAll('[data-profile]').forEach(button => button.onclick = async () => {
    const id = button.dataset.profile;
    if (id === 'custom') await window.alex.saveRouting({ profile: 'custom', chain: state.routing.chain });
    else await window.alex.saveRouting({ profile: id, chain: [...state.profiles[id].chain] });
    await load();
  });

  const mutable = [...(state.routing.chain || [])];
  document.querySelectorAll('[data-up]').forEach(button => button.onclick = () => {
    const index = Number(button.dataset.up); [mutable[index - 1], mutable[index]] = [mutable[index], mutable[index - 1]];
    state.routing.chain = mutable; state.routing.profile = 'custom'; dirty = true; render();
  });
  document.querySelectorAll('[data-down]').forEach(button => button.onclick = () => {
    const index = Number(button.dataset.down); [mutable[index + 1], mutable[index]] = [mutable[index], mutable[index + 1]];
    state.routing.chain = mutable; state.routing.profile = 'custom'; dirty = true; render();
  });
  document.querySelectorAll('[data-remove]').forEach(button => button.onclick = () => {
    mutable.splice(Number(button.dataset.remove), 1); state.routing.chain = mutable; state.routing.profile = 'custom'; dirty = true; render();
  });
  $('#addRouteBtn').onclick = () => {
    const id = $('#addRoute').value;
    if (id && !mutable.includes(id)) { mutable.push(id); state.routing.chain = mutable; state.routing.profile = 'custom'; dirty = true; render(); }
  };
  $('#saveChain').onclick = async () => { suppressReload = true; try { await window.alex.saveRouting({ profile: state.routing.profile || 'custom', chain: state.routing.chain }); await load(); toast('Orden guardado. Se aplicará al siguiente dictado.'); } finally { suppressReload = false; } };
  $('#saveKeys').onclick = async () => {
    const values = Object.fromEntries([...document.querySelectorAll('[data-key]')].map(i => [i.dataset.key, i.value.trim()]));
    const region = $('#orRegion').value;
    suppressReload = true;
    try {
      for (const [key, value] of Object.entries(values)) if (value) { await window.alex.setSecret(key, value); delete keyDrafts[key]; }
      await window.alex.saveSettings({ openRouterRegion: region });
      await load(); toast('Claves guardadas. Puedes comprobar la autenticación sin enviar audio.');
    } finally { suppressReload = false; }
  };  document.querySelectorAll('[data-clear-key]').forEach(button => button.onclick = async () => {
    if (confirm('¿Eliminar esta clave API del almacén local?')) { await window.alex.setSecret(button.dataset.clearKey, ''); await load(); }
  });
  document.querySelectorAll('[data-open]').forEach(button => button.onclick = () => window.alex.openExternal(button.dataset.open));
  $('#refreshCatalog').onclick = async () => {
    const button = $('#refreshCatalog'); button.disabled = true; button.textContent = 'Consultando…';
    try { await window.alex.refreshCatalog(); await load(); }
    catch (error) { alert(`No se pudo actualizar OpenRouter: ${error.message}`); }
    finally { button.disabled = false; }
  };
}

function acceleratorFromEvent(event) {
  const modifiers = [];
  if (event.ctrlKey || event.metaKey) modifiers.push('CommandOrControl');
  if (event.altKey) modifiers.push('Alt');
  if (event.shiftKey) modifiers.push('Shift');
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) return null;
  const map = { ' ': 'Space', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', Escape: 'Esc', Enter: 'Enter', Tab: 'Tab', Backspace: 'Backspace', Delete: 'Delete', Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown' };
  let key = map[event.key] || event.key;
  if (key.length === 1) key = key.toUpperCase();
  if (!modifiers.length && !/^F([1-9]|1[0-9]|2[0-4])$/.test(key)) return null;
  return [...new Set(modifiers), key].join('+');
}

async function loadMicrophones() {
  const select = $('#mic');
  if (!select) return;
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const current = select.value || state.settings.microphoneId || 'default';
    select.innerHTML = '<option value="default">Predeterminado del sistema</option>' + devices.filter(device => device.kind === 'audioinput').map((device, index) => `<option value="${esc(device.deviceId)}">${esc(device.label || `Micrófono ${index + 1}`)}</option>`).join('');
    select.value = [...select.options].some(option => option.value === current) ? current : 'default';
  } catch (_) {
    select.innerHTML = '<option value="default">Predeterminado del sistema</option>';
  }
}

function bindSettings() {
  capturedHotkey = state.settings.hotkey;
  const hotkey = $('#hotkey');
  hotkey.onclick = () => { hotkey.value = 'Pulsa la combinación…'; hotkey.focus(); };
  hotkey.onkeydown = event => {
    event.preventDefault();
    if (event.key === 'Escape') { capturedHotkey = state.settings.hotkey; hotkey.value = capturedHotkey; hotkey.blur(); return; }
    const accelerator = acceleratorFromEvent(event);
    if (accelerator) { dirty = true; capturedHotkey = accelerator; hotkey.value = accelerator; hotkey.blur(); }
  };
  $('#refreshMic').onclick = loadMicrophones;
  loadMicrophones();
  $('#liveDelay').oninput = event => $('#delayLabel').textContent = `${event.target.value} ms`;
  $('#checkUpdates').onclick = async () => { await window.alex.checkUpdates(); showUpdateModal(); };
  $('#showSetup').onclick = () => openOnboarding(true);
  $('#saveSettings').onclick = async () => {
    // Snapshot before any IPC await: background events must not replace edited fields.
    const button = $('#saveSettings');
    const patch = {
      language: $('#lang').value, microphoneId: $('#mic').value,
      autoPaste: $('#autopaste').checked, insertionMode: $('#insertMode').value,
      cleanupFillers: $('#fillers').checked, livePreview: $('#live').checked,
      liveProvider: 'mistral', liveTargetDelayMs: Number($('#liveDelay').value),
      keepCompletedAudioDays: Number($('#days').value),
      checkUpdatesAutomatically: $('#autoUpdates').checked
    };
    if (patch.insertionMode === 'live-experimental' && (!patch.livePreview || !patch.autoPaste || !state.secrets.mistral)) {
      toast('La escritura en vivo necesita texto en directo, autopegado y una clave de Mistral. Usa Final seguro para dictado normal.'); return;
    }
    suppressReload = true; button.disabled = true;
    try {
      if (capturedHotkey && capturedHotkey !== state.settings.hotkey) await window.alex.registerHotkey(capturedHotkey);
      await window.alex.saveSettings(patch); dirty = false;
      await load(); toast('Ajustes guardados.');
    } catch (error) { toast(`No se pudo guardar: ${error.message}`); }
    finally { suppressReload = false; button.disabled = false; }
  };
}

function renderUpdateGift() {
  const button = $('#updateGift');
  const hasNews = ['available', 'downloading', 'downloaded'].includes(updateState?.status);
  button.hidden = !hasNews;
  const version = updateState?.availableVersion ? ` v${updateState.availableVersion}` : '';
  button.title = updateState?.status === 'downloaded' ? `Actualización${version} lista para instalar` : `Nueva versión${version}`;
}

function updateStatusText() {
  const status = updateState?.status;
  if (status === 'available') return `Hay una nueva versión v${updateState.availableVersion}.`;
  if (status === 'downloading') return `Descargando v${updateState.availableVersion || ''}: ${Math.round(updateState.percent || 0)}%.`;
  if (status === 'downloaded') return `v${updateState.availableVersion} está descargada y lista para instalar.`;
  if (status === 'current') return 'Estás usando la versión más reciente.';
  if (status === 'checking') return 'Buscando actualizaciones…';
  if (status === 'development') return 'Las actualizaciones automáticas se activan en la versión instalada.';
  if (status === 'manual') return updateState.error || 'Se abrió la descarga oficial.';
  if (status === 'error') return `No se pudo comprobar: ${updateState.error || 'error desconocido'}`;
  return 'Alex Dictate puede avisarte cuando haya una versión nueva.';
}

function showUpdateModal() {
  const root = $('#modalRoot');
  const status = updateState?.status || 'idle';
  let action = '<button class="primary" id="updateCheck">Buscar ahora</button>';
  if (status === 'available') action = `<button class="primary" id="updateDownload">${updateState.canAutoInstall ? 'Actualizar y reiniciar' : 'Abrir descarga oficial'}</button>`;
  if (status === 'downloading') action = '<button class="primary" disabled>Descargando…</button>';
  if (status === 'downloaded') action = '<button class="primary" id="updateInstall">Instalar y reiniciar</button>';
  if (status === 'current') action = '<button class="secondary" id="updateCheck">Comprobar otra vez</button>';
  if (status === 'error' || status === 'manual') action = '<button class="secondary" id="updateCheck">Reintentar</button>';
  root.innerHTML = `<div class="modal-backdrop"><div class="modal update-modal"><div class="modal-head"><div><h2>Novedades de Alex Dictate</h2><p>${esc(updateStatusText())}</p></div><button class="modal-close" id="closeModal">×</button></div><div class="update-panel"><div class="version-row"><span>Instalada</span><strong>v${esc(state?.appVersion || updateState.currentVersion || '—')}</strong></div>${updateState.availableVersion ? `<div class="version-row"><span>Disponible</span><strong>v${esc(updateState.availableVersion)}</strong></div>` : ''}${status === 'downloading' ? `<div class="progress-track"><div class="progress-bar" style="width:${Math.round(updateState.percent || 0)}%"></div></div>` : ''}${updateState.releaseNotes ? `<div class="card inset"><h3>Novedades</h3><div class="muted" style="white-space:pre-wrap">${esc(updateState.releaseNotes)}</div></div>` : ''}<div class="wizard-actions"><button class="secondary" id="openReleases">Ver versiones en GitHub</button><div class="right">${action}</div></div>${!updateState.canAutoInstall && updateState.reason ? `<p class="muted small">${esc(updateState.reason)}</p>` : ''}</div></div></div>`;
  document.querySelector('.shell').inert = true; labelControls();
  $('#closeModal').onclick = closeModal;
  $('#openReleases').onclick = () => window.alex.openExternal('https://github.com/Zoroboak/simple-windows-super-whisper/releases');
  if ($('#updateCheck')) $('#updateCheck').onclick = async () => { updateState = await window.alex.checkUpdates(); showUpdateModal(); };
  if ($('#updateDownload')) $('#updateDownload').onclick = async () => { updateState = await window.alex.applyUpdate(); showUpdateModal(); };
  if ($('#updateInstall')) $('#updateInstall').onclick = () => window.alex.installUpdate();
}

function closeModal() { wizardDismissed = true; stopMicTest(); $('#modalRoot').innerHTML = ''; document.querySelector('.shell').inert = false; }

function openOnboarding(force = false) {
  onboardingStep = 0;
  onboardingProfile = state.secrets.openrouter ? 'balanced' : 'free';
  renderOnboarding(force);
}

function renderOnboarding(force = false) {
  const root = $('#modalRoot');
  const total = 4;
  const stepDots = Array.from({ length: total }, (_, index) => `<span class="step-dot ${index < onboardingStep ? 'done' : index === onboardingStep ? 'active' : ''}"></span>`).join('');
  let body = '';
  if (onboardingStep === 0) body = onboardingChooseProfile();
  if (onboardingStep === 1) body = onboardingKeys();
  if (onboardingStep === 2) body = onboardingBasics();
  if (onboardingStep === 3) body = onboardingFinish();
  root.innerHTML = `<div class="modal-backdrop"><div class="modal wide onboarding-modal"><div class="modal-head"><div><h2>${force ? 'Configuración guiada' : 'Bienvenido a Alex Dictate'}</h2><p>${force ? 'Puedes repetir este asistente cuando quieras.' : 'En unos 2 minutos queda listo para dictar en cualquier aplicación.'}</p></div><button class="modal-close" id="closeModal" aria-label="Cerrar asistente y explorar">×</button></div><div class="steps">${stepDots}</div>${body}</div></div>`;
  if ($('#closeModal')) $('#closeModal').onclick = closeModal;
  bindOnboarding(force);
  document.querySelector('.shell').inert = true; labelControls(); document.querySelector('.onboarding-modal button')?.focus();
}

function onboardingChooseProfile() {
  const items = [
    ['free', 'Gratis', 'Empieza sin coste', 'Groq Whisper Turbo → Groq Whisper Large. Ideal para probar y para el equipo.'],
    ['balanced', 'Premium equilibrado', 'Recomendado', 'MAI-Transcribe 2 primero, OpenRouter Whisper y Groq como fallbacks. Muy buen equilibrio para español.'],
    ['quality', 'Precisión prioritaria', 'Precisión primero', 'GPT Transcribe y MAI primero; mantiene rutas baratas/gratuitas al final.']
  ];
  return `<h3>1. ¿Qué quieres priorizar?</h3><p class="muted">Gratis usa los límites de tu cuenta Groq. Premium consume saldo por audio. Puedes cambiarlo después; la aplicación no cobra suscripción.</p><div class="choice-grid">${items.map(([id, title, tag, description]) => `<button class="choice ${onboardingProfile === id ? 'selected' : ''}" data-ob-profile="${id}"><span class="choice-title">${title}</span><span class="choice-tag">${tag}</span><p>${description}</p></button>`).join('')}</div><div class="wizard-actions"><span class="muted small">Gratis para empezar; Premium equilibrado para usar tu saldo de OpenRouter.</span><div class="right"><button class="primary" id="obNext">Continuar</button></div></div>`;
}

function onboardingKeys() {
  const needsOpenRouter = onboardingProfile !== 'free';
  return `<h3>2. Conecta el proveedor</h3><p class="muted">Las claves se cifran con el almacén seguro del sistema y nunca se muestran de nuevo.</p>${needsOpenRouter ? `<div class="api-card"><div class="row between"><div><b>OpenRouter</b><div class="muted">Necesaria para ${onboardingProfile === 'quality' ? 'Precisión prioritaria' : 'Premium equilibrado'}.</div></div><span class="pill ${state.secrets.openrouter ? 'ok' : ''}">${state.secrets.openrouter ? 'ya guardada' : 'necesaria'}</span></div><div class="field" style="margin-top:10px"><input id="obOpenRouter" type="password" placeholder="${state.secrets.openrouter ? '•••••••• · ya tienes una clave guardada' : 'Pega tu clave API de OpenRouter'}"></div><div class="api-help"><button class="link-button" data-open="https://openrouter.ai/settings/keys">Crear clave en OpenRouter ↗</button></div></div>` : ''}<div class="api-card"><div class="row between"><div><b>Groq</b><div class="muted">${onboardingProfile === 'free' ? 'Necesaria para el perfil Gratis.' : 'Recomendada como fallback gratuito.'}</div></div><span class="pill ${state.secrets.groq ? 'ok' : ''}">${state.secrets.groq ? 'ya guardada' : onboardingProfile === 'free' ? 'necesaria' : 'opcional'}</span></div><div class="field" style="margin-top:10px"><input id="obGroq" type="password" placeholder="${state.secrets.groq ? '•••••••• · ya tienes una clave guardada' : 'Pega tu clave API de Groq'}"></div><div class="api-help"><button class="link-button" data-open="https://console.groq.com/keys">Crear clave gratis en Groq ↗</button></div></div><div class="api-card"><div class="row between"><div><b>Mistral · realtime</b><div class="muted">Opcional. Hace aparecer texto fantasma mientras hablas.</div></div><span class="pill ${state.secrets.mistral ? 'ok' : ''}">${state.secrets.mistral ? 'ya guardada' : 'opcional'}</span></div><div class="field" style="margin-top:10px"><input id="obMistral" type="password" placeholder="${state.secrets.mistral ? '•••••••• · ya tienes una clave guardada' : 'Pega tu clave API de Mistral (opcional)'}"></div><div class="api-help"><button class="link-button" data-open="https://console.mistral.ai/api-keys/">Crear clave en Mistral ↗</button></div></div><div id="obKeyError" class="bad small" style="margin-top:10px"></div><div class="wizard-actions"><button class="secondary" id="obBack">Atrás</button><div class="right"><button class="primary" id="obNext">Guardar y continuar</button></div></div>`;
}

function onboardingBasics() {
  return `<h3>3. Cómo lo usarás</h3><button class="secondary" id="obTestMic">Probar micrófono (5 s)</button><p class="muted small">Esta prueba es local: no guarda ni envía audio. Puedes elegir otro micrófono en Ajustes.</p><div class="checklist"><div class="check-item"><span class="check-icon">1</span><div><b>Pulsa este atajo desde cualquier aplicación</b><div class="big-kbd">${esc(state.settings.hotkey)}</div><span class="muted">Una vez inicia; otra vez termina y pega el texto.</span></div></div><div class="check-item"><span class="check-icon">2</span><div><b>Modo recomendado: Final seguro</b><p class="muted">Alex Dictate conserva el foco, transcribe y pega el texto final de una sola vez. Evita texto provisional incorrecto dentro de tus documentos.</p></div></div><div class="check-item"><span class="check-icon ${state.secrets.mistral ? '' : 'warn'}">${state.secrets.mistral ? '3' : '!'}</span><div><b>Texto en directo ${state.secrets.mistral ? 'disponible' : 'opcional'}</b><p class="muted">${state.secrets.mistral ? 'Puedes activar la previsualización. Se factura aparte de la transcripción final.' : 'Puedes añadir Mistral más tarde si quieres ver la transcripción en directo.'}</p></div></div></div><label class="row"><input id="obRealtime" type="checkbox" ${state.settings.livePreview && state.secrets.mistral ? 'checked' : ''} ${state.secrets.mistral ? '' : 'disabled'}> Activar texto en directo (consumo adicional de Mistral)</label><div class="wizard-actions"><button class="secondary" id="obBack">Atrás</button><div class="right"><button class="primary" id="obNext">Continuar</button></div></div>`;
}

function onboardingFinish() {
  const profile = state.profiles?.[onboardingProfile];
  const primaryRoute = profile?.chain?.map(routeInfo).find(item => item && state.secrets[item.keyRef]);
  return `<h3>4. Comprueba tu primer dictado</h3><div class="checklist"><div class="check-item"><span class="check-icon">✓</span><div><b>Perfil</b><p class="muted">${esc(profile?.name || onboardingProfile)}</p></div></div><div class="check-item"><span class="check-icon ${primaryRoute ? '' : 'warn'}">${primaryRoute ? '✓' : '!'}</span><div><b>Proveedor</b><p class="muted">${primaryRoute ? esc(primaryRoute.name) : 'No hay una clave guardada todavía. Puedes terminar y configurarla después.'}</p></div></div><div class="check-item"><span class="check-icon">✓</span><div><b>Atajo</b><p class="muted"><code>${esc(state.settings.hotkey)}</code></p></div></div><div class="check-item" id="obSystem"><span class="check-icon">…</span><div><b>Integración del sistema</b><p class="muted">Comprobando pegado y Wayland…</p></div></div></div><div class="notice"><b>No perderás un dictado por un fallo de red:</b> el WAV queda guardado localmente y se puede reintentar desde Historial.</div><div class="wizard-actions"><button class="secondary" id="obBack">Atrás</button><div class="right"><button class="secondary" id="obFinish">Terminar</button><button class="primary" id="obFinishTest">Terminar y probar dictado</button></div></div>`;
}

function bindOnboarding(force) {
  document.querySelectorAll('[data-ob-profile]').forEach(button => button.onclick = () => {
    onboardingProfile = button.dataset.obProfile;
    renderOnboarding(force);
  });
  document.querySelectorAll('[data-open]').forEach(button => button.onclick = () => window.alex.openExternal(button.dataset.open));
  document.querySelectorAll('.onboarding-modal input[type=password]').forEach(i => { i.value = obDrafts[i.id] || ''; i.oninput = () => { obDrafts[i.id] = i.value; }; });
  if (onboardingStep === 3 && $('#obSystem')) {
    window.alex.diagnose().then(data => {
      const target = $('#obSystem');
      if (!target) return;
      if (!data.hotkeyRegistered) { target.innerHTML = '<span class="check-icon warn">!</span><div><b>Autoriza o cambia el atajo</b><p class="muted">El sistema no ha registrado el atajo. Termina y abre Ajustes.</p></div>'; }
      else if (data.wayland && !data.ydotool?.ready) {
        target.innerHTML = '<span class="check-icon warn">!</span><div><b>KDE/Wayland necesita una preparación única</b><p class="muted">El atajo aparece registrado. Para pegar automáticamente en todas las apps, prepara ydotoold/uinput.</p><button class="secondary" id="obSetupWayland">Preparar ahora</button></div>';
        $('#obSetupWayland').onclick = async () => {
          try { await window.alex.setupWayland(); alert('Se ha abierto una terminal con el asistente. Completa los pasos y después prueba el dictado.'); }
          catch (error) { alert(`No se pudo abrir el asistente: ${error.message}`); }
        };
      } else {
        target.innerHTML = '<span class="check-icon">✓</span><div><b>Atajo registrado</b><p class="muted">Haz un dictado de prueba para comprobar el pegado real. En macOS autoriza Micrófono y Accesibilidad.</p></div>';
      }
    }).catch(() => {});
  }
  if ($('#obTestMic')) $('#obTestMic').onclick = () => testMic($('#obTestMic'));
  if ($('#obBack')) $('#obBack').onclick = () => { stopMicTest(); onboardingStep = Math.max(0, onboardingStep - 1); renderOnboarding(force); };
  if ($('#obNext')) $('#obNext').onclick = async () => {
    if (onboardingStep === 0) {
      // Apply the profile when the wizard finishes, not merely when browsing choices.
      state = await window.alex.state();
      onboardingStep = 1;
      renderOnboarding(force);
      return;
    }
    if (onboardingStep === 1) {
      const requiredKey = onboardingProfile === 'free' ? 'groq' : 'openrouter';
      const values = {
        openrouter: $('#obOpenRouter')?.value.trim() || '',
        groq: $('#obGroq')?.value.trim() || '',
        mistral: $('#obMistral')?.value.trim() || ''
      };
      if (!state.secrets[requiredKey] && !values[requiredKey]) {
        $('#obKeyError').textContent = `Para este perfil necesitas una clave de ${requiredKey === 'groq' ? 'Groq' : 'OpenRouter'}.`;
        return;
      }
      try { for (const [key, value] of Object.entries(values)) if (value) { await window.alex.setSecret(key, value); } } catch (e) { $('#obKeyError').textContent = e.message; return; }
      state = await window.alex.state();
      onboardingStep = 2;
      renderOnboarding(force);
      return;
    }
    if (onboardingStep === 2) {
      stopMicTest();
      await window.alex.saveSettings({ livePreview: Boolean($('#obRealtime')?.checked), insertionMode: 'final-safe', autoPaste: true });
      state = await window.alex.state();
      onboardingStep = 3;
      renderOnboarding(force);
    }
  };
  const finish = async test => {
    await window.alex.saveRouting({ profile: onboardingProfile, chain: [...state.profiles[onboardingProfile].chain] });
    await window.alex.saveSettings({ onboardingComplete: true, checkUpdatesAutomatically: true });
    closeModal();
    await load();
    if (test) { route = 'home'; renderNav(); render(); $('#testPad')?.focus(); toast('Pulsa tu atajo para probar el dictado en este cuadro.'); }
  };
  if ($('#obFinish')) $('#obFinish').onclick = () => finish(false);
  if ($('#obFinishTest')) $('#obFinishTest').onclick = () => finish(true);
}

function labelControls() {
  document.querySelectorAll('input[type=password]').forEach(i => { if (!i.getAttribute('aria-label')) i.setAttribute('aria-label', 'Clave API ' + (i.dataset.key || i.id.replace('ob', ''))); });
  document.querySelectorAll('.field').forEach((field, i) => {
    const input = field.querySelector('input,select,textarea'), label = field.querySelector('label');
    if (input && label) { input.id ||= `field-${route}-${i}`; label.htmlFor = input.id; }
  });
  document.querySelectorAll('[data-up]').forEach(b => b.setAttribute('aria-label', 'Subir prioridad'));
  document.querySelectorAll('[data-down]').forEach(b => b.setAttribute('aria-label', 'Bajar prioridad'));
  document.querySelectorAll('[data-remove]').forEach(b => b.setAttribute('aria-label', 'Quitar ruta'));
  document.querySelectorAll('.modal').forEach(m => { m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true'); m.setAttribute('aria-label', m.querySelector('h2')?.textContent || 'Configuración'); });
}
function stopMicTest() { if (micTestStream) { micTestStream.getTracks().forEach(t => t.stop()); micTestStream = null; } }
async function testMic(button) {
  stopMicTest(); button.disabled = true;
  let context;
  try {
    const id = $('#mic')?.value || state.settings.microphoneId;
    micTestStream = await navigator.mediaDevices.getUserMedia({ audio: id && id !== 'default' ? { deviceId: { exact: id } } : true });
    context = new AudioContext(); const source = context.createMediaStreamSource(micTestStream), analyser = context.createAnalyser();
    source.connect(analyser); const data = new Uint8Array(analyser.fftSize); let peak = 0;
    for (let i = 0; i < 25; i++) { if (!micTestStream) break; analyser.getByteTimeDomainData(data); peak = Math.max(peak, ...data.map(n => Math.abs(n - 128))); button.textContent = `Habla… nivel ${Math.round(peak / 128 * 100)}%`; await new Promise(r => setTimeout(r, 200)); }
    toast(peak > 2 ? 'Se detecta señal de micrófono. No se ha enviado ni guardado audio de esta prueba.' : 'No se detectó señal suficiente. Revisa silencio, permisos o selecciona otro micrófono.');
  } finally { stopMicTest(); await context?.close(); button.disabled = false; button.textContent = 'Probar micrófono (5 s)'; }
}
document.addEventListener('keydown', e => {
  const modal = document.querySelector('.modal'); if (!modal) return;
  if (e.key === 'Escape') { e.preventDefault(); closeModal(); }
  if (e.key === 'Tab') {
    const items = [...modal.querySelectorAll('button:not([disabled]),input:not([disabled]),select,textarea,a[href]')].filter(el => el.offsetParent !== null);
    const first = items[0], last = items.at(-1);
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
  }
});

load();
