#!/usr/bin/env bash
set -euo pipefail
# Run as the desktop user. Only package/udev operations use sudo.
[[ $EUID -ne 0 ]] || { echo 'Ejecuta este asistente como tu usuario, sin sudo delante.'; exit 1; }
command -v apt-get >/dev/null || { echo 'Este asistente está preparado para Kubuntu/Ubuntu con apt.'; exit 1; }
: "${XDG_RUNTIME_DIR:?No hay sesión de usuario activa. Abre el asistente desde KDE.}"
printf '\nAlex Dictate: preparación del pegado en KDE/Wayland\n'
echo 'Se instalará ydotool y un servicio de usuario. Poder usar uinput permite simular entrada en tu sesión.'
read -r -p '¿Continuar? [s/N] ' answer
[[ "$answer" =~ ^[sSyY]$ ]] || exit 0
sudo apt-get update
sudo apt-get install -y ydotool
if ! command -v ydotoold >/dev/null; then
  # Some Ubuntu versions split the daemon into a separate package.
  if apt-cache show ydotoold >/dev/null 2>&1; then sudo apt-get install -y ydotoold; fi
fi
DAEMON=$(command -v ydotoold || true)
[[ -n "$DAEMON" ]] || { echo 'Falta ydotoold (ydotool >=1.0). El dictado seguirá disponible con pegado manual.'; exit 1; }
sudo modprobe uinput
sudo groupadd -f alex-dictate-uinput
# Dedicated group: do not grant access to all raw keyboard devices via group input.
sudo tee /etc/udev/rules.d/70-alex-dictate-uinput.rules >/dev/null <<'RULE'
KERNEL=="uinput", MODE="0660", GROUP="alex-dictate-uinput", TAG+="uaccess", OPTIONS+="static_node=uinput"
RULE
sudo udevadm control --reload-rules
sudo udevadm trigger --name-match=uinput
relogin=0
if [[ ! -w /dev/uinput ]]; then
  sudo usermod -aG alex-dictate-uinput "$USER"
  relogin=1
fi
mkdir -p "$HOME/.config/systemd/user"
cat > "$HOME/.config/systemd/user/alex-dictate-ydotoold.service" <<SERVICE
[Unit]
Description=Private ydotool socket for Alex Dictate
After=graphical-session.target
PartOf=graphical-session.target
[Service]
Type=simple
ExecStart=$DAEMON --socket-path=%t/alex-dictate-ydotool.sock --socket-perm=0600
Restart=on-failure
RestartSec=5
[Install]
WantedBy=default.target
SERVICE
systemctl --user daemon-reload
systemctl --user enable --now alex-dictate-ydotoold.service || true
sleep 1
if systemctl --user is-active --quiet alex-dictate-ydotoold.service && [[ -S "$XDG_RUNTIME_DIR/alex-dictate-ydotool.sock" ]]; then
  echo 'Servicio y socket privado disponibles. Vuelve a Alex Dictate y prueba el pegado.'
else
  echo 'La configuración necesita revisión o volver a iniciar sesión.'
  echo 'Diagnóstico: systemctl --user status alex-dictate-ydotoold.service'
fi
if [[ $relogin == 1 ]]; then echo 'Cierra sesión y entra de nuevo para aplicar el permiso específico de uinput.'; fi
printf '\nNo se ha concedido acceso al grupo input. El atajo del teclado usa el portal de KDE por separado.\n'
