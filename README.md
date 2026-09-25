# Alex Dictate 1.1

Dictado de voz **local-first**, multiplataforma y sin suscripción obligatoria para Linux/KDE/Wayland, Windows y macOS.

La referencia funcional es Wispr Flow: un único gesto para empezar, feedback visual mínimo, transcripción en cualquier aplicación, diccionario, snippets e historial. Alex Dictate añade una prioridad deliberada: **el audio debe sobrevivir aunque fallen Internet, el proveedor o la propia aplicación**.

## Qué cambia en 1.1

- Audio canónico en **PCM 16 kHz → WAV**, escrito continuamente antes de cualquier llamada de red.
- Recuperación de `*.pcm.partial` tras un cierre inesperado.
- Segmentación de audios largos buscando un valle de energía/silencio próximo al límite, evitando cortar palabras innecesariamente.
- Perfiles de routing persistentes y una cadena manual `1 → 2 → 3 → ...` que es la única fuente de verdad en el uso diario.
- OpenRouter como capa premium/económica con varios modelos STT.
- Groq directo como fallback gratuito/recomendado.
- Catálogo OpenRouter bajo demanda: solo se consulta cuando el usuario pulsa **Actualizar catálogo**.
- Métricas externas de endpoints separadas del routing real.
- Hotkey transaccional: el anterior no se pierde si el nuevo no puede registrarse.
- Selector de micrófono con fallback automático al predeterminado si desaparece el dispositivo.
- URI/comando externo `alex-dictate://toggle` / `--toggle` para mapear botones de ratón sin hooks privilegiados.
- Estadísticas recalculadas por dictado, evitando inflar fallos por reintentos.
- Realtime Mistral Voxtral como ghost text y modo de escritura en vivo experimental.

## Flujo diario

1. Pulsa el hotkey global.
2. Alex Dictate empieza a escribir PCM local de inmediato.
3. Opcionalmente Mistral muestra ghost text en tiempo real.
4. Pulsa el hotkey otra vez para terminar.
5. El PCM se cierra como WAV local.
6. Se intenta la cadena guardada, en orden.
7. El primer resultado válido se pega en la aplicación que conservaba el foco.
8. Si toda la cadena falla, el WAV queda en Historial para reintentar o descargar.

No se ejecuta ningún benchmark ni comparación de proveedores antes de cada dictado.

## Perfiles incluidos

### Gratis

`Groq Whisper Large v3 Turbo → Groq Whisper Large v3`

Mientras permanezcas dentro del free tier de Groq, el uso puede ser gratuito. Los límites de cuenta cambian con el tiempo y deben verificarse en Groq.

### Premium equilibrado

`OpenRouter MAI-Transcribe 2 → OpenRouter Whisper Large v3 → Groq Turbo → Groq Large`

Pensado para español, code-switching, nombres propios y buen coste/precisión.

### Máxima calidad

`OpenRouter GPT Transcribe → OpenRouter MAI-Transcribe 2 → OpenRouter Qwen3 ASR Flash → OpenRouter Whisper Large v3 → Groq Large`

Prioriza calidad y conserva rutas económicas/gratuitas al final.

La cadena puede reordenarse manualmente y queda persistida.

## OpenRouter: modelo vs proveedor interno

OpenRouter expone STT en `POST /api/v1/audio/transcriptions`. En septiembre de 2026, los controles genéricos de routing por petición como `provider.order`, `provider.only`, `provider.sort`, `allow_fallbacks` o `data_collection` **todavía no se aplican a este endpoint de transcripción**.

Por eso Alex Dictate diferencia:

- **Routing que sí controlamos:** la cadena persistente de rutas de Alex Dictate, por ejemplo `OpenRouter MAI → Groq Turbo → Groq Large`.
- **Routing interno de OpenRouter:** cuando un modelo de OpenRouter tiene varios hosts, OpenRouter selecciona/falla entre ellos internamente.
- **Catálogo de endpoints:** el panel puede consultar `/api/v1/models/:author/:slug/endpoints` bajo demanda para ayudarte a decidir, pero no modifica la cadena por sí solo.

Si OpenRouter habilita en el futuro pinning por proveedor para STT, la capa `catalog.js` permite incorporarlo sin rediseñar la UI.

## Precios de referencia incorporados

Valores informativos de septiembre de 2026; el panel no presupone que sean eternos.

| Ruta | Referencia aproximada |
| --- | ---: |
| OpenRouter Whisper Large v3 Turbo | $0.0108/h |
| OpenRouter Whisper Large v3 | $0.0288/h |
| OpenRouter MAI-Transcribe 2 | $0.10/h |
| OpenRouter Qwen3 ASR Flash | $0.126/h |
| OpenRouter GPT Transcribe | $0.27/h |
| Groq Whisper Large v3 Turbo | $0.04/h (con free tier sujeto a límites) |
| Groq Whisper Large v3 | $0.111/h (con free tier sujeto a límites) |

Fuentes de referencia: documentación y páginas de modelos oficiales de OpenRouter y Groq.

## Realtime

La vista fantasma usa `voxtral-mini-transcribe-realtime-2602` de Mistral.

- **Final seguro (recomendado):** ghost text mientras hablas; una única inserción final al terminar.
- **Escritura en vivo (experimental):** inserta deltas durante la grabación. La versión final revisada se copia al portapapeles para evitar duplicar el texto.

La vista realtime nunca es la única copia del audio. El PCM local sigue siendo la fuente de recuperación.

## Hotkeys y ratón

El hotkey se registra con Electron `globalShortcut`. En Wayland, Electron moderno utiliza el portal XDG GlobalShortcuts cuando está disponible.

Para un botón lateral de ratón recomendamos mapearlo a:

- el hotkey configurado, o
- `alex-dictate://toggle`, o
- ejecutar Alex Dictate con `--toggle`.

Esto evita leer `/dev/input` o exigir privilegios elevados a una herramienta que permanece abierta todo el día.

## KDE / Wayland

Para el hotkey no se necesita X11. Para simular el pegado, Wayland sí restringe la inyección global de teclas.

Alex Dictate intenta:

1. `ydotool`
2. `wtype`
3. si ninguno funciona, conserva el resultado en portapapeles y muestra un aviso.

Script de ayuda:

```bash
./scripts/setup-kde-wayland.sh
```

## Desarrollo

```bash
npm install
npm run check
npm test
npm start
```

## Compilar

```bash
npm run dist:linux
npm run dist:win
npm run dist:mac
```

GitHub Actions ejecuta sintaxis, tests y empaquetado en Ubuntu, Windows y macOS.

## Privacidad

- API keys cifradas con `safeStorage` del sistema operativo.
- Audio local en la carpeta de datos de la aplicación.
- No existe backend propio de Alex Dictate.
- Solo se envía el audio a una ruta cuando esa ruta se intenta.
- OpenRouter permite endpoint regional EU (`eu.openrouter.ai`); si se activa y el modelo no está disponible en la región, la ruta falla y Alex Dictate continúa con el siguiente fallback.
- Los controles ZDR/privacidad específicos del proveedor deben configurarse además en las cuentas/workspaces correspondientes cuando estén disponibles.

## Documentación

- `docs/ARCHITECTURE.md`: arquitectura y garantías.
- `docs/PROVIDERS.md`: cómo añadir/cambiar modelos y proveedores.
- `docs/REQUEST-AUDIT.md`: comparación entre la petición original, el prototipo y v1.1.
