## Alex Dictate 1.2

Nueva configuración guiada para empezar con Groq gratis o conectar saldo de OpenRouter, prueba local de micrófono y cuadro de primer dictado. Cadena de rutas persistente: el catálogo se consulta solo cuando tú lo pides.

Mejoras: AudioWorklet, PCM16 confirmado en disco, recuperación de audio, guardado sin enviar, reintentos sin pegado accidental, formularios sin pérdida ante novedades, protección del llavero y rollback de atajos. Novedades con icono de regalo y descarga/instalación desde la interfaz en formatos compatibles.

### Instalación

Linux/Kubuntu x64: usa .deb (recomendado) o AppImage. Windows x64: Setup.exe; portable como alternativa manual. Mac Apple Silicon: arm64.dmg y arrastrar a Aplicaciones.

En KDE/Wayland autoriza el atajo y usa el asistente de autopegado cuando lo indique. No ejecutes la aplicación como root. Revisa SHA256SUMS.txt para comprobar las descargas.

### Límites conocidos

Los paquetes no tienen certificados comerciales. macOS sin Developer ID y Windows portable actualizan mediante la descarga oficial, no instalación automática en sitio. Para la edición Mac se necesitan permisos de Micrófono/Accesibilidad. Autopegado usa Ctrl+V/Cmd+V en el campo activo; terminales y aplicaciones protegidas pueden necesitar pegado manual. Realtime requiere Mistral y consume aparte del batch final; escritura directa en vivo sigue experimental. OpenRouter no permite elegir hosts internos en su API STT.

Audio e historial se guardan localmente sin cifrado de contenido; claves en el llavero. Pruebas de núcleo y smoke Linux con micrófono sintético no sustituyen pruebas en hardware físico ni una garantía de transcripción cloud. Consulta docs/VALIDATION.md.
