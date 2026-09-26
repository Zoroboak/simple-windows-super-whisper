# Alex Dictate · 1.2

Dicta en tus aplicaciones con un atajo. Aplicación de escritorio para **Kubuntu/KDE, Windows y macOS**, con configuración guiada, audio recuperable, proveedores elegidos por ti y novedades desde la interfaz.

## Instalar (sin programar)

Abre **[la última versión publicada](https://github.com/Zoroboak/simple-windows-super-whisper/releases/latest)** y descarga tu instalador:

| Sistema | Archivo recomendado | Primer arranque |
|---|---|---|
| Kubuntu/Ubuntu x64 | `.deb` | Ábrelo con Discover o el instalador de paquetes. Inicia Alex Dictate desde el menú. |
| Linux x64 portable | `.AppImage` | Propiedades → Permisos → permitir ejecutar. Guarda la AppImage en una carpeta permanente. |
| Windows x64 | `Setup.exe` | Ejecuta el instalador. La edición portable no se actualiza en sitio. |
| macOS Apple Silicon | `arm64.dmg` | Arrastra Alex Dictate a Aplicaciones y autoriza Micrófono/Accesibilidad. |

Esta distribución no incluye certificados comerciales de firma. Windows/macOS pueden solicitar confirmación o bloquear inicialmente una aplicación desconocida. Descarga solo de este repositorio; no desactives las protecciones globales del equipo. En Mac usa la excepción individual de Privacidad y seguridad tras comprobar el origen. Los artefactos actuales de Mac son **Apple Silicon**, no una compilación Intel.

### Tus primeros pasos

1. **Gratis** en el asistente para empezar con una clave de Groq, o **Premium equilibrado** si ya usas saldo de OpenRouter. Los enlaces para crear las claves están dentro de la aplicación.
2. Prueba el micrófono durante 5 segundos. La prueba es local: no sube ni guarda audio. Elige idioma/micrófono en Ajustes cuando sea necesario.
3. Prueba el dictado en el cuadro de Inicio. El atajo predeterminado es `Ctrl + Shift + Espacio` en Linux/Windows y `Cmd + Shift + Espacio` en Mac. Pulsar una vez inicia; otra termina.
4. En **KDE/Wayland**, autoriza el atajo cuando KDE lo solicite. Si falta el pegado, pulsa **Preparar ahora**: el asistente abre una terminal para instalar/configurar ydotoold con tu consentimiento. Puede requerir cerrar sesión una vez.

Habla manteniendo el cursor en el campo de destino. Alex Dictate pega en el **campo activo al terminar**: no garantiza encontrar o restaurar un campo si cambias de aplicación, escritorio o documento durante el dictado. Tampoco elude campos protegidos ni permisos elevados.

## Qué configuración elegir

**Gratis:** Groq Whisper Turbo → Groq Whisper Large. Solo es gratuito dentro de la cuota de tu cuenta. Ambas rutas comparten proveedor y pueden compartir límites; no son redundancia independiente ante una caída de Groq.

**Premium equilibrado:** OpenRouter MAI-Transcribe 2 → OpenRouter Whisper Large → Groq Turbo → Groq Large. El uso premium consume saldo. Es una configuración propuesta, no una garantía de ser la más precisa para todas las voces.

**Precisión prioritaria / Personalizado:** otras rutas STT del catálogo y los proveedores directos. Mistral batch y OpenAI directo son opcionales. Los precios estáticos son orientativos de septiembre de 2026 y pueden cambiar.

En **Proveedores**, añade, sube, baja o quita rutas y pulsa **Guardar cadena**. El orden se conserva. **Nunca se comparan proveedores ni se hacen benchmarks antes de un dictado.** El catálogo solo se consulta al pulsar **Actualizar catálogo**. Las estadísticas locales proceden de tus intentos, no de pruebas adicionales de pago.

OpenRouter STT no aplica `provider.order/only/ignore`: la prioridad que decides es entre rutas/modelos o APIs directas, no entre hosts internos de un mismo modelo. Los endpoints internos se muestran solo como referencia.

## Texto en directo

Activa Mistral en Ajustes tras guardar su clave. El audio se conserva localmente y, por separado, se transmite para mostrar texto provisional en la barra. Tiene consumo **adicional** al proveedor de la transcripción final. Sin Mistral, el dictado normal sigue funcionando.

**Final seguro** es el modo recomendado: previsualización opcional y un pegado final. **Escritura en vivo** es experimental: inserta fragmentos provisionales y deja el resultado completo en el portapapeles; no intenta borrar o reescribir de forma destructiva lo ya insertado. No equivale a un IME nativo con letras fantasma dentro de cualquier aplicación.

## Audio que puedes recuperar

La captura escribe PCM16 mono en disco y confirma cada fragmento. Al terminar produce WAV y después llama a la cadena STT. Si activas realtime, sus fragmentos se envían después de la escritura local, durante la captura.

Un fallo de red conserva el audio en Historial. Puedes **Reintentar**, **Copiar texto**, **Guardar audio** o **Eliminar** con confirmación. Reintentar desde Historial no pega inesperadamente en otra aplicación. **Guardar sin enviar**, desde la bandeja, conserva el audio en vez de destruirlo.

Se recuperan capturas interrumpidas y metadatos dañados cuando quedan archivos válidos. El límite actual por captura es 30 minutos. Los fallidos/pendientes/cancelados no se borran automáticamente; los completados tienen retención configurable. No es una garantía contra avería del disco, falta de espacio, fallos del sistema o muestras no recibidas antes de un apagado.

## Privacidad y seguridad

Sin servidor de Alex Dictate ni telemetría externa de uso. Las claves se cifran con el llavero del sistema; Linux rechaza `basic_text`. KWallet debe estar disponible y desbloqueado. Los **audios y transcripciones locales no están cifrados** por la aplicación; usa cifrado de disco si lo necesitas. Los proveedores cloud reciben el audio y aplican sus propias políticas. Actualizaciones, comprobación manual de claves y catálogo consultan sus servicios correspondientes.

Los renderers están aislados, no tienen Node y el proceso principal valida quién puede usar cada operación IPC. No se registra todo el teclado ni se necesita ejecutar la app como root. El asistente Linux concede, cuando hace falta, acceso específico a uinput; no añade al usuario al grupo general `input`.

## Actualizaciones y mantenimiento

En Ajustes puedes comprobar novedades. El icono de regalo aparece cuando hay una versión disponible. La instalación requiere una acción tuya, no se ejecuta al salir ni mientras estás grabando/procesando. Se consulta GitHub al iniciar y cada seis horas solo si la opción está activada y no hay dictado activo.

NSIS/DEB/AppImage tienen soporte de actualización desde la interfaz, sujeto a permisos del SO. Windows portable y la edición **macOS sin Developer ID** abren la descarga oficial. Para habilitar actualización nativa en Mac, el mantenedor debe firmar y notarizar futuras compilaciones. Ver [UPDATES](docs/UPDATES.md).

## Desarrollo y pruebas

Node 22. Instala dependencias con `npm ci` cuando esté presente el lockfile (o `npm install` para la copia fuente sin lock). Después:

```bash
npm run check
npm test
npm start
# En Linux con un servidor gráfico o Xvfb:
npm run test:electron
# Instaladores del sistema actual:
npm run dist
```

CI valida sintaxis, pruebas del núcleo y empaqueta Linux/Windows/macOS. En Linux además abre Electron de verdad con micrófono sintético, verifica PCM/WAV, IPC y recuperación ante falta de clave. Esto no sustituye pruebas de micrófonos físicos ni permisos/pegado en KDE/macOS/Windows reales. Documentación: [guía](docs/USER-GUIDE.md), [arquitectura](docs/ARCHITECTURE.md), [proveedores](docs/PROVIDERS.md), [auditoría del encargo](docs/REQUEST-AUDIT.md), [validación](docs/VALIDATION.md).
