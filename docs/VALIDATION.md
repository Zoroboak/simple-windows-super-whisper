# Registro de validación 1.2

## Ejecutado localmente antes de publicar

- Sintaxis de todos los JS (incluye preload, AudioWorklet, pruebas y scripts).
- 41 pruebas node:test: recuperación PCM, cancelación conserva audio, retención, estadísticas sin duplicación, fallo de metadatos, validación, cifrado débil, rollback hotkey, tipos de actualización, segmentación sin pérdida, snippets Unicode, respuestas HTTP inválidas, timeout del cuerpo, cadena fija y cooldown, WebSocket simulado, remuestreo 16/44,1/48 kHz, actualizador sin interrumpir dictado. La prueba Linux basic_text se omite en otros SO.
- Interacciones en Chromium con IPC simulado: onboarding completo, orden de rutas y persistencia, cero consultas de catálogo hasta pulsar, conservación de formularios ante novedades, guardar hotkey/idioma, diccionario sin pérdida al añadir, historial y modal de versiones. 8 capturas a 1180×800 y 920×650, sin errores JS observados. El renderer usa el código real; no simula una certificación del backend ni de los permisos de SO.

## Puerta de integración CI

`.github/workflows/build.yml` ejecuta check y tests en Ubuntu 24.04, Windows 2025 y macOS 15; empaqueta instaladores. Linux ejecuta `scripts/electron-smoke.cjs` con una instancia REAL de Electron y micrófono sintético: inicio, asistente, AudioWorklet, PCM16/WAV, falta de credenciales, reintento sin pérdida, rechazo de IPC desde el renderer no autorizado y navegación por ajustes/historial. No usa credenciales ni servicios de pago.

Los resultados de esta puerta se consultan en el workflow del commit exacto, no se dan por válidos por existir el script. Publicar necesita que todos los jobs terminen correctamente. Capturas/logs nativos se adjuntan como electron-qa.

## No verificado en este entorno

No hay micrófono físico ni escritorios KDE/Windows/Mac del usuario. No hay API keys para una transcripción real ni benchmark de español. Las conversaciones WebSocket y fallbacks unitarios usan dobles de prueba. No se ha realizado actualización binaria entre dos versiones públicas reales. El certificado Apple Developer ID no está disponible. Esos límites no se convierten en checks positivos por compilar.
