# Guía de uso

## No conozco los modelos: ¿qué elijo?

Elige Gratis y configura Groq. Si se agota la cuota, el audio se conserva y puedes reintentarlo más tarde; la app no contrata saldo por ti. Elige Premium equilibrado cuando quieras usar tu cuenta y saldo de OpenRouter, y añade Groq como alternativa. No debes configurar todos los modelos ni actualizar el catálogo para empezar.

## Qué significa cada estado

Preparando: se solicita permiso y se abre el micrófono. Escuchando: indicador de grabación, duración y onda. Procesando: WAV guardado; se ejecuta el orden de rutas. Listo: resultado copiado o pegado. Revisa el historial: no se pudo completar el envío; comprueba el audio guardado.

La barra no toma el foco. Mantén el campo destino seleccionado hasta terminar. En terminales que necesitan Ctrl+Shift+V, usa pegar desde el menú o el atajo propio: el autopegado genérico usa Ctrl+V/Cmd+V y no detecta automáticamente todas las terminales. Tampoco se inyecta en escritorios elevados o protegidos.

## ¿Qué hago si falla?

**Micrófono:** Ajustes → Probar micrófono. Desactiva silencio, concede permiso de micrófono y elige el dispositivo. Si un USB elegido desaparece, se intenta el predeterminado; si deniegas permisos no se intenta esquivarlos.

**Clave:** Proveedores → Guardar → Comprobar clave. Confirma autenticación, no saldo ni disponibilidad de todos los modelos. En Linux abre/desbloquea KWallet y reinicia si no permite guardar la clave. No se recurre a texto plano.

**Atajo:** clic en el campo → pulsa combinación → Guardar. Si la nueva está ocupada, la anterior permanece. Autoriza el portal KDE si aparece. Los botones de ratón se asignan al mismo atajo desde el configurador del dispositivo o al comando `alex-dictate --toggle`.

**Pegado Wayland:** Diagnóstico → Preparar autopegado. Se abre un asistente con confirmación y sudo para paquetes/udev; la app no se ejecuta con privilegios. Si pide volver a iniciar sesión, hazlo. El socket privado queda en `$XDG_RUNTIME_DIR/alex-dictate-ydotool.sock`. No se desconectan servicios existentes de otros programas.

**Proveedor caído o lento:** se intenta la siguiente ruta guardada. Las rutas recién fallidas pueden omitirse temporalmente. Reintentar manualmente empieza desde el primer proveedor con clave e ignora esa pausa. Ese reintento copia el texto, pero no lo inserta solo mientras navegas por el historial.

**Cierre inesperado:** al volver a abrir, comprueba Historial. Si hay un PCM parcial válido se convierte a WAV. Guardar audio exporta tu copia. No borres una entrada hasta comprobar su contenido.

## Actualizar

Pulsa el regalo cuando aparezca o Ajustes → Buscar actualización. Lee las novedades; usa Actualizar y reiniciar en formatos compatibles. Durante una captura la instalación queda bloqueada. En macOS sin firma y Windows portable el botón abre la descarga oficial, no una instalación silenciosa.

## Diccionario y snippets

El diccionario proporciona grafías sugeridas al proveedor que admita vocabulario; no fuerza reemplazos inventados. Un snippet sustituye un disparador completo por un texto fijo al terminar: “mi firma” → tu firma. No se ejecutan comandos ni código desde los snippets.
