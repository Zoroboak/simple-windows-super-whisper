# Arquitectura

## Capas

1. **Electron main**: ciclo de vida, tray, hotkey global, persistencia, proveedores, portapapeles e inyección.
2. **Overlay renderer**: captura MediaRecorder + visualización. No roba foco.
3. **Settings renderer**: configuración, historial, diccionario, snippets, métricas y diagnóstico.
4. **Store local**: escritura atómica de `state.json`; audio inmutable por UUID.
5. **Provider chain**: adaptadores STT ordenados por prioridad.

## Estados y garantías

- Se crea una entrada `recording` antes de capturar.
- Al detener, el buffer se guarda mediante `*.partial → rename`, reduciendo riesgo de archivos truncados.
- Solo después pasa a `queued` y se llama a red.
- Cada proveedor deja un `attempt` con latencia/error.
- Un fallo final deja el archivo y el botón **Reintentar**.
- Al arrancar, `processing`/`recording` interrumpidos se recuperan conservadoramente.

## Linux / KDE / Wayland

Electron 43 usa `org.freedesktop.portal.GlobalShortcuts` para el hotkey. La inyección de teclado es otra cuestión: Wayland impide que una aplicación cualquiera simule teclas globalmente. Para KDE se utiliza `ydotool` como backend opcional de Ctrl+V. Sin él, Alex Dictate escribe al portapapeles y muestra aviso, manteniendo el texto íntegro.

## Seguridad

- Renderer aislado (`contextIsolation=true`, `nodeIntegration=false`).
- API keys solo cruzan IPC al guardarse y después se cifran con `safeStorage`.
- No se exponen secretos al renderer al leer el estado; solo un booleano `key guardada`.
- URLs de proveedores son presets locales, no contenido remoto ejecutable.
