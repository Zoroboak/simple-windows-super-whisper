#!/usr/bin/env bash
set -euo pipefail

info(){ printf '\n[Alex Dictate] %s\n' "$*"; }
warn(){ printf '\n[Alex Dictate] AVISO: %s\n' "$*" >&2; }

if [[ "${XDG_SESSION_TYPE:-}" != "wayland" ]]; then
  warn "La sesión actual no parece Wayland. El script seguirá, pero ydotool solo es necesario para el autopegado global en Wayland."
fi

info "Instalando backend de pegado Wayland…"
sudo apt-get update
sudo apt-get install -y ydotool

if ! command -v ydotoold >/dev/null 2>&1; then
  warn "El paquete instalado no incluye ydotoold. Instala una versión de ydotool >= 1.0 y vuelve a ejecutar el script."
  exit 1
fi

info "Preparando /dev/uinput con acceso de sesión (uaccess)…"
sudo modprobe uinput || true
sudo tee /etc/udev/rules.d/70-alex-dictate-uinput.rules >/dev/null <<'RULE'
KERNEL=="uinput", MODE="0660", GROUP="input", TAG+="uaccess", OPTIONS+="static_node=uinput"
RULE
sudo udevadm control --reload-rules
sudo udevadm trigger --name-match=uinput || sudo udevadm trigger || true

# En algunas configuraciones KDE/logind TAG+=uaccess basta. Si no, el grupo input es el fallback.
if [[ ! -w /dev/uinput ]]; then
  if getent group input >/dev/null 2>&1 && ! id -nG "$USER" | tr ' ' '\n' | grep -qx input; then
    warn "/dev/uinput todavía no es escribible. Añadiendo $USER al grupo input como fallback."
    sudo usermod -aG input "$USER"
    NEED_RELOGIN=1
  fi
fi

info "Configurando ydotoold como servicio del usuario…"
mkdir -p "$HOME/.config/systemd/user"
cat > "$HOME/.config/systemd/user/alex-dictate-ydotoold.service" <<'SERVICE'
[Unit]
Description=ydotoold for Alex Dictate
After=graphical-session.target
PartOf=graphical-session.target

[Service]
Type=simple
ExecStart=/usr/bin/ydotoold -p /tmp/.ydotool_socket -P 0600
Restart=on-failure
RestartSec=2

[Install]
WantedBy=default.target
SERVICE

systemctl --user daemon-reload
systemctl --user enable --now alex-dictate-ydotoold.service || true
sleep 1

if systemctl --user is-active --quiet alex-dictate-ydotoold.service; then
  info "ydotoold está activo."
else
  warn "ydotoold no está activo todavía. Comprueba: systemctl --user status alex-dictate-ydotoold.service"
fi

if [[ -w /dev/uinput ]]; then
  info "/dev/uinput es escribible por el usuario actual."
else
  warn "/dev/uinput aún no es escribible. ${NEED_RELOGIN:+Cierra sesión y vuelve a entrar para aplicar el grupo input.}"
fi

if command -v ydotool >/dev/null 2>&1 && systemctl --user is-active --quiet alex-dictate-ydotoold.service && [[ -w /dev/uinput ]]; then
  info "KDE/Wayland listo para autopegado con ydotool."
else
  warn "Configuración parcial. Alex Dictate seguirá conservando el texto en portapapeles aunque el autopegado no esté disponible."
fi

cat <<'MSG'

El atajo global de Alex Dictate NO depende de ydotool: Electron usa XDG GlobalShortcuts Portal.
Para botones extra del ratón, mapea el botón al hotkey de Alex Dictate o a alex-dictate://toggle desde tu software/mapeador.
MSG
