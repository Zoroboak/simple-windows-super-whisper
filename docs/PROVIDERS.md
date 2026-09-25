# Proveedores y modelos

## Objetivo

Cambiar un modelo debe ser una operación de catálogo, no una reescritura de la aplicación.

Una ruta se define en `src/catalog.js` con:

- `id`
- `name`
- `transport`
- `keyRef`
- `model`
- `baseUrl` si aplica
- `maxSegmentSeconds`
- precio informativo
- etiquetas/notas para UI

Los transportes viven en `src/providers.js`.

## Rutas actuales

### OpenRouter

- `microsoft/mai-transcribe-2`
- `openai/gpt-transcribe`
- `openai/whisper-large-v3`
- `openai/whisper-large-v3-turbo`
- `qwen/qwen3-asr-flash-2026-02-10`
- `qwen/qwen3-asr-0.6b`

### Groq directo

- `whisper-large-v3-turbo`
- `whisper-large-v3`

### OpenAI directo

- `gpt-transcribe`

### Realtime

- Mistral `voxtral-mini-transcribe-realtime-2602`

## Cómo añadir otro modelo OpenRouter

1. Añadir una entrada `transport: 'openrouter-json'` a `ROUTES`.
2. Definir `model`, `keyRef: 'openrouter'`, coste informativo y `maxSegmentSeconds`.
3. Añadirlo a un perfil solo si está suficientemente probado.
4. Ejecutar `npm run check && npm test`.
5. Verificar manualmente español, nombres propios y ruido real antes de cambiar la recomendación por defecto.

## Cómo añadir un proveedor directo

Si usa multipart compatible con OpenAI, basta normalmente con `transport: 'openai-multipart'` y `baseUrl`.

Si su protocolo es distinto, crear un transporte separado dentro de `providers.js` y mantener `transcribeRoute()` como interfaz común.

## Fallback

La cadena ejecuta exactamente el orden almacenado.

Se salta una ruta cuando:

- no existe en catálogo;
- no tiene API key.

Se avanza al siguiente fallback cuando:

- HTTP error;
- 429;
- timeout;
- respuesta vacía;
- error de transporte.

El audio no se elimina al fallar.

## OpenRouter y proveedores internos

OpenRouter puede tener DeepInfra, Groq, Together u otros hosts para un mismo modelo. El endpoint de catálogo permite mostrarlos en el panel.

Sin embargo, en septiembre de 2026 el endpoint STT no aplica los controles genéricos `provider.order`, `provider.only`, `sort`, `allow_fallbacks` o `data_collection` por petición. Por ello esos endpoints se presentan como información de decisión y no como un orden falso configurable.

## Precios

Los costes en `catalog.js` son orientativos para UX. La fuente real debe seguir siendo la respuesta/portal del proveedor. OpenRouter devuelve `usage.cost` cuando está disponible; Alex Dictate lo guarda por intento.

## Privacidad

- OpenRouter global: máxima disponibilidad.
- OpenRouter EU: se usa `eu.openrouter.ai`; una ruta sin endpoint europeo falla limpiamente y pasa al siguiente fallback.
- Groq/Mistral: aplicar ZDR y políticas de cuenta/workspace directamente en sus paneles cuando sean necesarias.
