# Arquitectura de Alex Dictate 1.1

## Principios

1. **El audio local manda.** La red nunca es la única copia de una grabación.
2. **La cadena es determinista.** No se benchmarkea antes de cada uso.
3. **El overlay no roba el foco.** El texto vuelve a la aplicación original.
4. **Wayland se trata como primera clase.** Hotkey y pegado son problemas distintos.
5. **Las claves no llegan al renderer.** Solo se expone si una clave está o no guardada.

## Capas

### Electron main

`src/main.js`

- ciclo de vida
- single instance
- protocolo `alex-dictate://`
- tray
- registro transaccional de hotkey
- cancelación temporal
- WebSocket realtime
- routing/fallback
- inyección final

### Audio

`src/audio.js`

- WAV PCM16 mono
- recuperación de `.pcm.partial`
- parsing WAV
- segmentación por silencio/energía

El renderer genera PCM s16le. El main lo escribe en bloques. Al detener:

`UUID.pcm.partial → UUID.wav → queued → processing → done/failed`

Un crash en `recording` puede recuperar PCM. Un crash en `processing` conserva el WAV y lo vuelve a `queued`.

### Routing

`src/catalog.js` contiene el catálogo local de rutas y perfiles.

`src/providers.js` contiene transportes:

- `openrouter-json`
- `openai-multipart`

La cadena persistida en `state.routing.chain` es la fuente de verdad. Una ruta sin credencial se marca `skipped` y se pasa a la siguiente sin contabilizarlo como caída del proveedor.

### OpenRouter

La consulta manual del catálogo utiliza:

`GET /api/v1/models/:author/:slug/endpoints`

Se guarda una instantánea en `state.routing.catalog`. Nunca se refresca automáticamente durante un dictado.

Para STT, OpenRouter actualmente realiza su propio routing interno. Alex Dictate no finge controlar `provider.only/order` mientras esos controles no sean aplicados por `/audio/transcriptions`.

### Store

`src/store.js`

Estado JSON atómico mediante `state.json.tmp → state.json`.

Se mantiene JSON deliberadamente porque es una aplicación local de un único proceso y evita una dependencia SQLite nativa para tres sistemas. Si el historial escala a decenas de miles de entradas, el contrato del store permite sustituirlo por SQLite sin cambiar renderer/proveedores.

Las estadísticas se recalculan desde historial para evitar dobles conteos por reintentos.

### Overlay

`renderer/overlay.*`

- ventana transparente
- `focusable=false`
- waveform
- ghost text de dos líneas
- timer
- no contiene secretos

### Settings renderer

`renderer/app.js`

- Inicio
- Historial
- Diccionario
- Snippets
- Proveedores
- Ajustes
- Diagnóstico

## Hotkey transaccional

Al cambiar de hotkey:

1. se intenta registrar la nueva combinación sin desregistrar primero la anterior;
2. solo cuando la nueva funciona se elimina la antigua;
3. si falla, la antigua sigue operativa.

Esto evita quedarse sin acceso global por una combinación ocupada o un problema del portal Wayland.

## Micrófono

El `deviceId` se guarda en settings. Al empezar:

1. se intenta el dispositivo exacto;
2. si ya no existe, se abre `default`;
3. el overlay informa del fallback.

Esto cubre USB, dock y Bluetooth desconectados entre sesiones.

## Segmentación

OpenRouter tiene un upstream timeout corto para STT. Las rutas OpenRouter se segmentan alrededor de 42 s.

El corte no es fijo: se busca un valle de RMS en una ventana próxima al límite para reducir la probabilidad de partir una palabra. Groq directo usa segmentos mucho mayores.

## Inserción

### Final seguro

1. overlay realtime opcional
2. transcripción final
3. clipboard
4. pegado una sola vez

### Live experimental

Los deltas realtime se agrupan brevemente y se pegan incrementalmente. Al terminar, la transcripción final se copia al portapapeles en lugar de duplicarla.

## Wayland

El hotkey se delega al portal XDG de Electron. Para pegar:

`ydotool → wtype → clipboard-only`

No se leen dispositivos de `/dev/input`.
