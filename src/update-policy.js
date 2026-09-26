function updatePolicy({ packaged, platform, portable = false, appImage = false, packageType = '', signedMac = false }) {
  if (!packaged) return { canAutoInstall: false, reason: 'Modo desarrollo: las actualizaciones se prueban en la aplicación instalada.' };
  if (platform === 'darwin') return { canAutoInstall: signedMac, reason: signedMac ? '' : 'Esta edición de macOS no tiene firma Developer ID. La actualización se descarga desde la versión oficial.' };
  if (platform === 'win32') return { canAutoInstall: !portable, reason: portable ? 'La edición portable se sustituye manualmente. Instala la edición Setup para actualizar desde la aplicación.' : '' };
  if (platform === 'linux') return { canAutoInstall: appImage || packageType === 'deb', reason: appImage || packageType === 'deb' ? '' : 'Usa el instalador DEB o la AppImage original para actualizar desde la aplicación.' };
  return { canAutoInstall: false, reason: 'Actualización manual para este formato.' };
}
module.exports = { updatePolicy };
