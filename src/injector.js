const { clipboard } = require('electron');
const { spawn } = require('child_process');

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { windowsHide: true, ...opts });
    let err = '';
    p.stderr?.on('data', d => err += d.toString());
    p.on('error', reject);
    p.on('close', code => code === 0 ? resolve() : reject(new Error(`${cmd} terminó con ${code}: ${err.trim()}`)));
  });
}

async function commandExists(cmd) {
  const probe = process.platform === 'win32' ? ['where.exe', [cmd]] : ['sh', ['-lc', `command -v ${cmd}`]];
  try { await run(probe[0], probe[1]); return true; } catch (_) { return false; }
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
    } catch (first) {
      try {
        await run('wtype', ['-M', 'ctrl', '-k', 'v', '-m', 'ctrl']);
        return { method: 'wtype' };
      } catch (second) {
        return { method: 'clipboard-only', warning: 'Texto copiado. Para pegado automático en Wayland instala/configura ydotool (preferido) o wtype.' };
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
  if (platform === 'linux') {
    tools.ydotool = await commandExists('ydotool');
    tools.wtype = await commandExists('wtype');
    tools.xdotool = await commandExists('xdotool');
  }
  return {
    platform,
    wayland,
    x11: Boolean(process.env.DISPLAY),
    desktop: process.env.XDG_CURRENT_DESKTOP || '',
    sessionType: process.env.XDG_SESSION_TYPE || '',
    tools,
    recommendation: platform === 'linux' && wayland
      ? 'Hotkey mediante XDG GlobalShortcuts. Para pegar: ydotool preferido; wtype como fallback; si ninguno está disponible se conserva el texto en el portapapeles.'
      : 'La inyección utiliza automatización nativa del sistema.'
  };
}

module.exports = { pasteText, diagnoseInjection, commandExists };
