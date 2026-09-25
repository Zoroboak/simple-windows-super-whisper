const { clipboard } = require('electron');
const { spawn } = require('child_process');
const os = require('os');

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { windowsHide: true, ...opts });
    let err = '';
    p.stderr?.on('data', d => err += d.toString());
    p.on('error', reject);
    p.on('close', code => code === 0 ? resolve() : reject(new Error(`${cmd} terminó con ${code}: ${err.trim()}`)));
  });
}

async function pasteText(text) {
  clipboard.writeText(text);
  const platform = process.platform;
  if (platform === 'win32') {
    const script = '$wshell = New-Object -ComObject wscript.shell; Start-Sleep -Milliseconds 70; $wshell.SendKeys("^v")';
    await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script]);
    return { method: 'powershell-sendkeys' };
  }
  if (platform === 'darwin') {
    await run('osascript', ['-e', 'delay 0.07', '-e', 'tell application "System Events" to keystroke "v" using command down']);
    return { method: 'osascript' };
  }

  const wayland = Boolean(process.env.WAYLAND_DISPLAY);
  if (wayland) {
    try {
      await run('ydotool', ['key', '29:1', '47:1', '47:0', '29:0']);
      return { method: 'ydotool' };
    } catch (e) {
      return { method: 'clipboard-only', warning: `Texto copiado, pero el pegado automático en Wayland necesita ydotool configurado: ${e.message}` };
    }
  }
  try {
    await run('xdotool', ['key', '--clearmodifiers', 'ctrl+v']);
    return { method: 'xdotool' };
  } catch (e) {
    return { method: 'clipboard-only', warning: `Texto copiado; no se pudo simular Ctrl+V: ${e.message}` };
  }
}

async function diagnoseInjection() {
  const platform = process.platform;
  return {
    platform,
    wayland: Boolean(process.env.WAYLAND_DISPLAY),
    x11: Boolean(process.env.DISPLAY),
    desktop: process.env.XDG_CURRENT_DESKTOP || '',
    sessionType: process.env.XDG_SESSION_TYPE || '',
    recommendation: platform === 'linux' && process.env.WAYLAND_DISPLAY
      ? 'Instala y habilita ydotool para pegado automático en apps Wayland nativas. El hotkey sí usa el portal XDG de Electron.'
      : 'La inyección utiliza las herramientas nativas del sistema.'
  };
}

module.exports = { pasteText, diagnoseInjection };
