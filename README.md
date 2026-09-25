# Alex Dictate

Dictado de voz local-first para **Linux (KDE/Wayland incluido), Windows y macOS**. Diseñado como alternativa interna a Wispr Flow: atajo global, overlay, historial, audio recuperable, diccionario, snippets y proveedores con fallback.

## Por qué esta arquitectura

- **Electron 43**: `globalShortcut` utiliza XDG Desktop Portal en Wayland, evitando hacks de X11 para la captura del atajo.
- **Local-first**: cada grabación se escribe primero en disco. Un fallo HTTP no destruye el audio.
- **Fallbacks**: por defecto `Groq Whisper Large v3 Turbo → Groq Whisper Large v3 → OpenAI`.
- **Secretos**: las API keys se cifran con `safeStorage` (Keychain/DPAPI/secret service según SO), no se guardan en claro.
- **Overlay sin foco**: la barra flotante no debe sacar el cursor de la aplicación en la que estás escribiendo.
- **Wayland realista**: el hotkey es nativo vía portal; la simulación de `Ctrl+V` en apps Wayland se realiza con `ydotool`. Si no está disponible, el resultado queda en portapapeles y nunca se pierde.

## Instalar para desarrollo

```bash
npm install
npm start
```

En Kubuntu/KDE Wayland, para autopegado:

```bash
./scripts/setup-kde-wayland.sh
```

Después de añadir el usuario al grupo `input` puede ser necesario cerrar sesión y entrar de nuevo.

## Construir instaladores

```bash
npm run dist:linux
npm run dist:win
npm run dist:mac
```

GitHub Actions compila los tres sistemas automáticamente.

## Configuración recomendada

1. Crea una API key de Groq y pégala en **Proveedores**.
2. Mantén `Groq · Whisper Large v3 Turbo` como prioridad 10.
3. Deja `Groq · Whisper Large v3` como prioridad 20 para audios más difíciles.
4. Opcionalmente añade OpenAI como tercer fallback.
5. Añade términos propios (clientes, marcas, herramientas) en **Diccionario**.

Groq dispone de plan gratuito con límites y su Turbo es muy económico en pago por uso; la aplicación no presupone que el tier gratis sea ilimitado.

## Recuperación de fallos

Estados: `recording → queued → processing → done/failed`. Los archivos de estados `queued`, `processing` recuperado o `failed` se conservan. La limpieza automática solo puede eliminar audio de registros `done` y nunca un dictado fallido.

## Modo de transcripción en vivo

La vista fantasma usa **Mistral Voxtral Mini Transcribe Realtime** con PCM s16le/16 kHz. El proceso principal abre el WebSocket con autenticación y recibe deltas `transcription.text.delta`; el renderer nunca recibe la API key. La grabación final continúa en paralelo y se guarda localmente, por lo que una caída del streaming no puede hacer perder el dictado.

## Privacidad

Los audios se guardan bajo la carpeta de datos de la aplicación del usuario. Solo se envían al proveedor seleccionado cuando se transcriben. No existe servidor propio de Alex Dictate.
