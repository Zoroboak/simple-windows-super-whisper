#!/usr/bin/env bash
set -euo pipefail
if ! command -v ydotool >/dev/null 2>&1; then
  echo "Instalando ydotool (requiere sudo)…"
  sudo apt-get update
  sudo apt-get install -y ydotool
fi
if getent group input >/dev/null 2>&1; then
  sudo usermod -aG input "$USER"
fi
cat <<'MSG'
Alex Dictate: preparación KDE/Wayland completada.
Si el pegado automático todavía no funciona, cierra sesión y vuelve a entrar para aplicar el grupo 'input'.
El atajo global NO depende de ydotool: Electron usa XDG GlobalShortcuts Portal.
MSG
