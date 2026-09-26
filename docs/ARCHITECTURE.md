# Arquitectura 1.2

Electron 43.2.0 / Node 22. Proceso principal con Store, proveedores, IPC autorizado, atajos, actualización e integración de escritorio. Dos renderers sandboxed: configuración y overlay. No se carga código remoto.

## Captura y durabilidad

AudioWorklet procesa PCM16LE mono a 16 kHz con remuestreo con estado; cada fragmento se envía por IPC invoke y recibe confirmación de escritura. Escrituras síncronas pequeñas al archivo PCM, fsync aproximadamente cada 2 segundos, memoria acotada a 32 fragmentos pendientes. Esta elección evita acumular audio en RAM, pero un disco bloqueado puede retrasar el main: se aborta conservando lo recuperable. 30 minutos máximo por captura (~57,6 MB PCM).

La finalización confirma todos los fragmentos, produce WAV atómico y guarda los metadatos **antes de borrar el PCM**. Estado JSON escrito a temporal, fsync, copia .bak y rename. Recuperación de parciales y WAV huérfanos por UUID. Cancelar equivale a guardar sin enviar; Eliminar es una acción explícita con confirmación de la UI. Los fallidos nunca se limpian por antigüedad.

Estados: idle → starting → recording → stopping → processing → idle. No se permite grabar y reintentar el historial simultáneamente. Fallos del micrófono, almacenamiento, renderer y proveedor son distintos. Un pegado fallido no invalida una transcripción correcta. El historial puede reintentarse sin pegar automáticamente en la ventana de configuración.

## Proveedores

La cadena guardada se clona al iniciar el procesamiento. No cambia por editar ajustes a mitad del envío. Timeouts cubren cabeceras **y cuerpo**; HTTP no redirige claves a destinos alternativos. JSON y texto se validan. Segmentación con corte de baja energía y máximo estricto, sin perder muestras; puede dividir palabras si no hay silencios. Errores dejan registro por ruta y pausa temporal; reintento manual ignora la pausa.

Realtime Mistral es una vía opcional independiente: PCM ya escrito → WebSocket con Authorization por conexión. Se guardan inicialmente hasta 10 segundos pendientes de session.created; la cola se limita. Se espera el cierre del protocolo hasta 4 segundos al terminar; si falla, se conserva el audio para batch. No hay reconexión ilimitada ni garantía de corrección por voz del texto provisional.

## Seguridad y escritorio

- IPC validado por webContents y frame principal; ajustes y operaciones de captura tienen permisos diferentes.
- renderers sandboxed, contextIsolation, sin Node; nuevas ventanas y navegación remota denegadas.
- CSP script self; estilos inline permitidos para atributos de la interfaz; texto externo escapado.
- safeStorage: rechaza backend Linux basic_text; llavero desbloqueado necesario.
- audio/transcripciones NO cifrados por la app; directorio privado y archivos 0600 nuevos.
- atajo transaccional: nuevo registro → persistencia → retirar antiguo; rollback si falla.
- KDE: GlobalShortcuts portal; pegado opcional ydotoold con socket por usuario. El instalador solicita permisos y grupo específico para uinput, no grupo input general.
- Sin garantía de recuperar el foco de un campo ajeno: se pega en el destino activo. Live insertion experimental no modifica destructivamente texto previo.

## Actualizaciones

El actualizador tiene política por formato/firma, cola deduplicada y bloqueo de instalación si hay operación activa. El estado de actualización no re-renderiza formularios en edición. Ver UPDATES.md y VALIDATION.md.
