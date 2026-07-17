#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BIN_DIR="${XDG_BIN_HOME:-$HOME/.local/bin}"
APP_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
ICON_BASE="${XDG_DATA_HOME:-$HOME/.local/share}/icons/hicolor"
mkdir -p "$BIN_DIR" "$APP_DIR"

# launcher
cat > "$BIN_DIR/grok-desktop" <<EOF
#!/usr/bin/env bash
set -euo pipefail
exec "$ROOT/scripts/run.sh" "\$@"
EOF
chmod +x "$BIN_DIR/grok-desktop"
chmod +x "$ROOT/scripts/run.sh"

# Grok official-style icon (from assets, sourced from Grok Image Studio branding)
ICON_SRC_256="$ROOT/assets/icon-256.png"
ICON_SRC_FULL="$ROOT/assets/icon.png"
if [[ ! -f "$ICON_SRC_256" && -f "$ICON_SRC_FULL" ]]; then
  ICON_SRC_256="$ICON_SRC_FULL"
fi

for s in 64 128 256 512; do
  d="$ICON_BASE/${s}x${s}/apps"
  mkdir -p "$d"
  src="$ROOT/assets/icon-${s}.png"
  if [[ -f "$src" ]]; then
    cp -f "$src" "$d/grok-desktop.png"
  elif [[ -f "$ICON_SRC_FULL" ]] && command -v convert >/dev/null 2>&1; then
    convert "$ICON_SRC_FULL" -resize "${s}x${s}" "$d/grok-desktop.png"
  elif [[ -f "$ICON_SRC_256" ]]; then
    cp -f "$ICON_SRC_256" "$d/grok-desktop.png"
  fi
done

# Prefer theme name so desktop environment resolves multi-size icons
ICON_LINE="Icon=grok-desktop"
if [[ -f "$ICON_BASE/256x256/apps/grok-desktop.png" ]]; then
  # absolute path as fallback for picky shells
  ICON_LINE="Icon=$ICON_BASE/256x256/apps/grok-desktop.png"
fi

# Electron on Linux often uses package.json "name" as WM_CLASS
WM_CLASS="grok-desktop"

cat > "$APP_DIR/grok-desktop.desktop" <<EOF
[Desktop Entry]
Name=Grok Desktop
Name[zh_CN]=Grok 桌面版
Comment=Grok Build standalone desktop
Comment[zh_CN]=Grok Build 独立桌面端
Exec=$BIN_DIR/grok-desktop
TryExec=$BIN_DIR/grok-desktop
$ICON_LINE
Terminal=false
Type=Application
Categories=Development;Utility;
StartupNotify=true
StartupWMClass=$WM_CLASS
EOF

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "$APP_DIR" 2>/dev/null || true
fi
if command -v gtk-update-icon-cache >/dev/null 2>&1; then
  gtk-update-icon-cache -f "$ICON_BASE" 2>/dev/null || true
fi

echo "Installed:"
echo "  $BIN_DIR/grok-desktop"
echo "  $APP_DIR/grok-desktop.desktop"
echo "  icons → $ICON_BASE/*/apps/grok-desktop.png"
echo "Run: grok-desktop"
