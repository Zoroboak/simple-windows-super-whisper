# Versiones, distribución y actualizador

## Publicación

`master` es la rama principal. Un cambio de versión se valida mediante PR. Al integrar en master, `.github/workflows/build.yml` ejecuta la matriz completa y solo publica si todas las plataformas pasan. Crea el tag `v<package.version>` sobre el commit validado y adjunta instaladores, `latest*.yml`, blockmaps y SHA256SUMS.txt. Una versión existente no se sobrescribe: se incrementa la versión para cada corrección.

El workflow necesita `contents: write` solamente en el job publish. No requiere claves personales en el código. El lockfile generado y comprometido debe conservarse; la CI usa `npm ci`. Para modificar dependencias se actualizan package.json y package-lock.json juntos.

## Cliente

`src/updater.js` usa electron-updater 6.8.9. `autoDownload=false`, `autoInstallOnAppQuit=false`, `allowPrerelease=false`, `allowDowngrade=false`. La comprobación concurrente se deduplica. Descargar e instalar puede hacerse con una acción; si el usuario inicia un dictado durante la descarga, la instalación se bloquea hasta que termine. No se instalan actualizaciones en segundo plano ni se destruyen formularios al recibir progreso.

Se conserva el directorio userData durante actualizaciones. El instalador no debe borrar el historial. Los paquetes y metadatos se sirven desde el repositorio fijo por HTTPS y electron-updater valida los hashes de descarga. Esto no sustituye un certificado de firma comercial ni protege ante un compromiso del repositorio autorizado.

## Matriz real

- Windows NSIS: actualización dentro de la aplicación, con posible confirmación del sistema. Portable: descarga manual.
- Linux AppImage: soportado si se ejecuta la AppImage original desde un lugar escribible. DEB: soportado sujeto a elevación/polkit. Una carpeta extraída o ejecución de desarrollo no debe anunciar autoactualización.
- macOS: Developer ID requerido por el sistema de actualizaciones. Sin ese certificado la aplicación **no intenta la instalación en sitio** y abre la descarga. El código detecta la firma mediante codesign; no basta con asumir que el sistema es Mac.

Las compilaciones iniciales son sin firma comercial. La publicación no configura ni inventa credenciales Apple. Para firmar, añadir al repositorio los secretos/certificados válidos y el flujo de notarización siguiendo la documentación de Electron; probar una transición real entre dos versiones antes de anunciar actualización nativa de Mac.

## Verificación

Pruebas unitarias de política por plataforma, deduplicación, progreso/estado, instalación bloqueada durante dictado, no instalar al salir, y modo manual en Mac sin firma. Una transición binaria real entre dos versiones publicadas es una prueba adicional distinta; no está certificada por estas pruebas unitarias.

Referencia: https://www.electron.build/docs/features/auto-update/
