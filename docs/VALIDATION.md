# Validación de la entrega 1.2

## Qué se comprueba

`npm run check` recorre el código JavaScript del producto y las pruebas. `npm test` define 45 pruebas de núcleo: formato WAV, segmentación sin pérdida, PCM recuperable tras reinicio, preservación al cancelar/fallar metadatos, retención de completados, estadísticas sin duplicar, snippets Unicode y sustitución literal, configuración validada, protección de claves y rechazo de basic_text, rollback de atajo, fallback en orden fijo sin consulta al catálogo, cooldown y reintento manual, timeout HTTP incluyendo el cuerpo, realtime con WebSocket simulado, remuestreo 16/44,1/48 kHz, actualizador y protocolo local de recursos permitido.

En Linux se ejecutan las 45; en los otros SO se omite expresamente la comprobación exclusiva de basic_text de Linux. Cero pruebas fallidas es la condición de empaquetado.

## Prueba de aplicación real, sin servicios de pago

`scripts/electron-smoke.cjs` crea un directorio de aplicación y de datos temporales y ejecuta `qa-electron.cjs`, que importa el mismo proceso principal del producto. Utiliza Electron 43.2.0 real, un servidor de audio y pantalla virtuales del runner Linux y el micrófono sintético de Chromium. No tiene claves cloud.

Comprueba arranque y asistente, apertura del AudioWorklet, ventana superpuesta no enfocable, audio PCM16 mono a 16 kHz con amplitud distinta de cero, cierre a WAV, conservación ante falta de credenciales, reintento del mismo audio, rechazo de IPC de captura desde Ajustes y navegación por Inicio/Proveedores/Ajustes/Historial/Diccionario/Snippets/Diagnóstico. Captura pantallas reales con webContents.capturePage. Las pruebas se ejecutan sin adjuntar DevTools a los worklets; el lanzador de pruebas tiene un límite de 90 segundos y no puede quedar esperando el diálogo de salida del producto.

Las banderas de micrófono sintético y no-sandbox están únicamente en el lanzador de CI. No forman parte del arranque ni de los instaladores del producto. qa-electron.cjs no se empaqueta.

## Evidencias de publicación

El workflow `Validate and package` guarda `electron-qa` (capturas, log y smoke-result.json) y los instaladores por sistema. El job de publicación depende de los tres jobs de validación; no publica si falla uno. El código y lockfile de cada release corresponden al commit validado de master. Los resultados vigentes son los del workflow enlazado al commit/tag, no una afirmación permanente basada en la existencia de estas pruebas.

## Límites que no se presentan como comprobados

No se han probado los micrófonos físicos ni los escritorios reales KDE/Windows/macOS de los usuarios. Los paquetes Windows/macOS se compilan en sus respectivos runners, pero la prueba de captura completa se ejecuta en Linux. No hay claves para transcribir audio con servicios cloud ni un benchmark propio de reconocimiento del español. No se ha realizado una actualización binaria entre dos versiones públicas instaladas. Las pruebas de política y mocks del actualizador no sustituyen esa transición. Los paquetes iniciales no disponen de firma comercial Apple/Windows.

El producto contiene mecanismos de recuperación, pero no garantiza audio irrecuperable por avería de disco, falta de espacio o muestras que el sistema operativo no entregó antes de un apagado. Véanse README.md y docs/UPDATES.md para compatibilidad, permisos y actualización por formato.
