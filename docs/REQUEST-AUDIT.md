# Auditoría respecto a la petición original

## Prototipo original Windows

El repositorio inicial resolvía el caso mínimo:

- Python/PyQt5
- `Ctrl+Space`
- PyAudio
- Whisper API de OpenAI
- copia/pegado
- waveform

Limitaciones principales:

- Windows-only
- audio temporal borrado tras procesar
- sin historial recuperable
- sin fallbacks
- una sola API
- hotkey no diseñado para Wayland
- sin panel real de configuración
- sin realtime incremental

## Alex Dictate 1.0

Añadió:

- Electron multiplataforma
- KDE/Wayland
- Groq/OpenAI
- Mistral realtime
- historial
- diccionario/snippets
- cifrado de claves
- audio recuperable
- CI multiplataforma

Problemas detectados durante la revisión 1.1:

- el audio parcial dependía todavía de fragmentos MediaRecorder/WebM;
- el hotkey se configuraba escribiendo texto;
- cambiar el hotkey podía desregistrar el anterior antes de saber si el nuevo funcionaba;
- el routing se modelaba con prioridades/checkboxes, menos claro que una cadena explícita;
- estadísticas de fallos podían inflarse por reintentos;
- el panel no separaba claramente OpenRouter del proveedor interno de OpenRouter;
- no había fallback de micrófono;
- el overlay prometía `Esc` aunque no siempre podía recibir teclado al no tomar foco.

## Alex Dictate 1.1

### Pedido: Windows + Linux + macOS

Cumplido con Electron y CI en tres SO.

### Pedido: principal en KDE/Wayland

Hotkey vía GlobalShortcuts portal; pegado por ydotool/wtype con fallback a clipboard.

### Pedido: no perder audio

PCM escrito continuamente, cierre WAV antes de red, recuperación de parciales, historial y descarga.

### Pedido: proveedor gratis

Groq Turbo/Large como perfil Gratis.

### Pedido: proveedor premium / alternativas

OpenRouter con MAI, GPT Transcribe, Whisper y Qwen; OpenAI directo permanece como ruta independiente opcional.

### Pedido: fallbacks configurables

Cadena persistente ordenable manualmente. No hay benchmarking por uso.

### Pedido: providers de OpenRouter

El panel consulta los endpoints disponibles bajo demanda. Debido a la limitación actual del endpoint STT de OpenRouter, esos endpoints no se presentan falsamente como pinning aplicable.

### Pedido: realtime visible

Mistral Voxtral muestra ghost text; modo de escritura incremental disponible como experimental.

### Pedido: hotkey robusto

Captura visual, registro transaccional, single-instance y URI/comando externo.

### Pedido: botón de ratón

Se integra de forma segura vía mapping a hotkey/URI en lugar de hooks privilegiados de dispositivo.

### Pedido: interfaz tipo Flow

Overlay mínimo + Hub local con Inicio, Historial, Diccionario, Snippets, Proveedores, Ajustes y Diagnóstico. Se replica el patrón de productividad, no la identidad visual propietaria.

## Pendiente deliberado

- No se firma/notariza automáticamente macOS/Windows sin certificados del propietario.
- El modo live typing no puede garantizar corrección retroactiva si un proveedor realtime revisa una hipótesis ya insertada; por eso no es el valor por defecto.
- Pinning interno de proveedor OpenRouter STT queda a la espera de soporte oficial real del endpoint.
