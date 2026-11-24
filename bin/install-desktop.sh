#!/usr/bin/env bash
set -euo pipefail

BIN_DIR="$(cd -P "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -P "$BIN_DIR/.." && pwd)"

APP_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
AUTOSTART_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/autostart"
DESKTOP_NAME="crom-youtube-studio.desktop"
DESKTOP_FILE="$APP_DIR/$DESKTOP_NAME"
AUTOSTART_FILE="$AUTOSTART_DIR/$DESKTOP_NAME"

EXEC_BIN="$REPO_ROOT/bin/crom-studio"
ICON_FILE="$REPO_ROOT/assets/crom-logo.png"

INSTALL_AUTOSTART=0
UNINSTALL=0

usage() {
  cat <<'EOF'
Uso: install-desktop.sh [opções]

Opções:
  --autostart   Também copia o atalho para ~/.config/autostart/
  --uninstall   Remove os atalhos instalados do menu e autostart
  -h, --help    Exibe esta ajuda
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --autostart)
      INSTALL_AUTOSTART=1
      shift
      ;;
    --uninstall)
      UNINSTALL=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Opção desconhecida: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ "$UNINSTALL" -eq 1 ]]; then
  rm -f "$DESKTOP_FILE" "$AUTOSTART_FILE"
  echo "Atalhos removidos ($DESKTOP_FILE, $AUTOSTART_FILE)."
  exit 0
fi

if [[ ! -x "$EXEC_BIN" ]]; then
  chmod +x "$EXEC_BIN"
fi

mkdir -p "$APP_DIR"

cat >"$DESKTOP_FILE" <<EOF
[Desktop Entry]
Version=1.0
Type=Application
Name=Crom YouTube Studio
GenericName=Estúdio Editorial Multi-Canal
Comment=Painel editorial MrJ & Crom com bandeja do sistema e ponte Kdenlive
Exec=${EXEC_BIN} --tray --open
Icon=${ICON_FILE}
Terminal=false
Categories=AudioVideo;Video;
StartupNotify=false
Actions=open-mrj;open-crom;sync-youtube;

[Desktop Action open-mrj]
Name=Abrir Studio — MrJ (@Mrj-crom)
Exec=${EXEC_BIN} --tray --open --canal mrj

[Desktop Action open-crom]
Name=Abrir Studio — Crom (@crom_run)
Exec=${EXEC_BIN} --tray --open --canal crom

[Desktop Action sync-youtube]
Name=Sincronizar Markdown + YouTube RSS
Exec=${EXEC_BIN} --sync-youtube
EOF

chmod +x "$DESKTOP_FILE"
echo "Atalho instalado em: $DESKTOP_FILE"

if [[ "$INSTALL_AUTOSTART" -eq 1 ]]; then
  mkdir -p "$AUTOSTART_DIR"
  cp "$DESKTOP_FILE" "$AUTOSTART_FILE"
  chmod +x "$AUTOSTART_FILE"
  echo "Autostart instalado em: $AUTOSTART_FILE"
fi

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "$APP_DIR" >/dev/null 2>&1 || true
fi
