const { clipboard } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { windowsHide: true, ...opts });
    let out = '', err = '';
    p.stdout?.on('data', d => out += d.toString());
    p.stderr?.on('data', d => err += d.toString());
    p.on('error', reject);
    p.on('close', code => code === 0 ? resolve(out.trim()) : reject(new Error(`${cmd} terminó con ${code}: ${err.trim()}`)));
  });
}

async function commandExists(cmd) {
  const probe = process.platform === 'win32' ? ['where.exe', [cmd]] : ['sh', ['-lc', `command -v ${cmd}`]];
  try { await run(probe[0], probe[1]); return true; } catch (_) { return false; }
}

async function processRunning(name) {
  if (process.platform !== 'linux') return false;
  try { await run('pgrep', ['-x', name]); return true; } catch (_) { return false; }
}

function uinputStatus() {
  if (process.platform !== 'linux') return { exists: false, writable: false };
  const exists = fs.existsSync('/dev/uinput');
  let writable = false;
  if (exists) { try { fs.accessSync('/dev/uinput', fs.constants.W_OK); writable = true; } catch (_) {} }
  return { exists, writable };
}

async function pasteText(text) {
  clipboard.writeText(String(text ?? ''));
  const platform = process.platform;
  if (platform === 'win32') {
    const script = '$wshell = New-Object -ComObject wscript.shell; Start-Sleep -Milliseconds 55; $wshell.SendKeys("^v")';
    await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script]);
    return { method: 'powershell-sendkeys' };
  }
  if (platform === 'darwin') {
    await run('osascript', ['-e', 'delay 0.055', '-e', 'tell application "System Events" to keystroke "v" using command down']);
    return { method: 'osascript' };
  }

  const wayland = Boolean(process.env.WAYLAND_DISPLAY);
  if (wayland) {
    try {
      await run('ydotool', ['key', '29:1', '47:1', '47:0', '29:0']);
      return { method: 'ydotool' };
    } catch (_) {
      try {
        await run('wtype', ['-M', 'ctrl', '-k', 'v', '-m', 'ctrl']);
        return { method: 'wtype' };
      } catch (_) {
        return { method: 'clipboard-only', warning: 'Texto copiado. Para pegado automático en Wayland configura ydotool/ydotoold (preferido) o instala wtype.' };
      }
    }
  }
  try {
    await run('xdotool', ['key', '--clearmodifiers', 'ctrl+v']);
    return { method: 'xdotool' };
  } catch (_) {
    return { method: 'clipboard-only', warning: 'Texto copiado; no se pudo simular Ctrl+V en X11.' };
  }
}

async function diagnoseInjection() {
  const platform = process.platform;
  const wayland = Boolean(process.env.WAYLAND_DISPLAY);
  const tools = {};
  let ydotool = null;
  if (platform === 'linux') {
    tools.ydotool = await commandExists('ydotool');
    tools.ydotoold = await commandExists('ydotoold');
    tools.wtype = await commandExists('wtype');
    tools.xdotool = await commandExists('xdotool');
    const ui = uinputStatus();
    ydotool = {
      installed: tools.ydotool,
      daemonInstalled: tools.ydotoold,
      daemonRunning: tools.ydotoold ? await processRunning('ydotoold') : false,
      uinputExists: ui.exists,
      uinputWritable: ui.writable,
      ready: Boolean(tools.ydotool && tools.ydotoold && ui.exists && ui.writable && await processRunning('ydotoold'))
    };
  }
  return {
    platform,
    wayland,
    x11: Boolean(process.env.DISPLAY),
    desktop: process.env.XDG_CURRENT_DESKTOP || '',
    sessionType: process.env.XDG_SESSION_TYPE || '',
    tools,
    ydotool,
    recommendation: platform === 'linux' && wayland
      ? (ydotool?.ready
        ? 'KDE/Wayland listo: hotkey vía XDG GlobalShortcuts y pegado vía ydotoold.'
        : 'El hotkey usa XDG GlobalShortcuts. Para pegado automático ejecuta scripts/setup-kde-wayland.sh; si ydotool no queda listo, wtype/portapapeles siguen disponibles.')
      : 'La inyección utiliza automatización nativa del sistema.'
  };
}

module.exports = { pasteText, diagnoseInjection, commandExists, processRunning, uinputStatus };
