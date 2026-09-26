# Auditoría del encargo y alcance real

| Necesidad | Entrega 1.2 | Verificación o límite |
|---|---|---|
| Instalar sin programar | DEB/AppImage, NSIS/portable, DMG/ZIP | Compilaciones CI; permisos reales dependen del equipo. Mac actual arm64. |
| Primera configuración sencilla | Asistente 4 pasos, Gratis por defecto, enlaces de claves, micrófono/prueba de dictado | Recorrido Chromium con IPC simulado; smoke Electron Linux separado. |
| Orden manual de proveedores | Guardar cadena/perfiles; ninguna comparación por dictado | Test confirma solo llamadas STT en el orden guardado. |
| Proveedores dentro de OpenRouter | Catálogo manual informativo | API STT no permite fijar order/only de hosts internos. |
| Tiempo real | Overlay Mistral opcional + batch completo | Protocolo unitario simulado; cuenta y audio reales pendientes. No realtime OpenRouter. |
| Letras fantasma dentro de cualquier app | Overlay independiente sin foco | No es IME/inserción semitransparente dentro del campo nativo. |
| Escribir en vivo | Experimental, explícito | No puede corregir con seguridad texto ya insertado. |
| Voz a texto fiable español | Idioma es por defecto; catálogo multilingüe | No se inventa un ranking de WER ni prueba de calidad de tu voz. |
| Conservar audio | PCM continuo, fsync, WAV, recuperación, historial | Fallos de red/captura y recuperación cubiertos; no fallo físico de disco. |
| Hotkey y ratón | Captura UI/registro transaccional, URI/--toggle para mapper | No hook arbitrario de botón del ratón; portal necesita aprobación del usuario. |
| KDE | Asistente ydotoold, socket privado, diagnóstico | No probado en equipo KDE físico desde este entorno. |
| Actualizar con un botón | Consulta/novedades/descarga/reinicio con protección | Mac sin Developer ID y Windows portable usan descarga manual; no transición real entre dos releases certificada. |
| Software sólido | Pruebas, validación de IPC, lockfile, CI y documentación | No se garantiza ausencia de errores ni compatibilidad universal. |

Diferencia frente a 1.1: AudioWorklet con remuestreo continuo, escritura confirmada, cancelación no destructiva, formularios que no pierden cambios, reintentos sin autopegado accidental, control de llavero débil, guardado transaccional de atajos, timeout de cuerpo HTTP, asistente inicial, actualizador seguro e instaladores publicados desde CI.
