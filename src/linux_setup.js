const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { spawn, spawnSync } = require('child_process');

function exists(command) {
  const result = spawnSync('sh', ['-lc', `command -v ${command}`], { stdio: 'ignore', timeout: 3000 });
  return result.status === 0;
}

function setupScriptPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'scripts', 'setup-kde-wayland.sh')
    : path.join(__dirname, '..', 'scripts', 'setup-kde-wayland.sh');
}

function launchWaylandSetup() {
  if (process.platform !== 'linux') throw new Error('La preparación Wayland solo está disponible en Linux.');
  const script = setupScriptPath();
  if (!fs.existsSync(script)) throw new Error('No se encontró el asistente de configuración KDE/Wayland.');
  try { fs.chmodSync(script, 0o755); } catch (_) {}

  let command = null;
  let args = null;
  if (exists('konsole')) {
    command = 'konsole';
    args = ['--hold', '-e', 'bash', script];
  } else if (exists('x-terminal-emulator')) {
    command = 'x-terminal-emulator';
    args = ['-e', 'bash', script];
  } else if (exists('gnome-terminal')) {
    command = 'gnome-terminal';
    args = ['--', 'bash', script];
  }
  if (!command) throw new Error('No se encontró Konsole ni otro emulador de terminal compatible. Ejecuta manualmente scripts/setup-kde-wayland.sh.');
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { detached: true, stdio: 'ignore' });
    child.once('error', reject);
    child.once('spawn', () => { child.unref(); resolve(true); });
  });
}

module.exports = { launchWaylandSetup, setupScriptPath };
