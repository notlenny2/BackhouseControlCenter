#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

APP_ID="com.backhouse.controlcenter"
APP_LABEL="com.backhouse.controlcenter"
APP_ROOT="/opt/backhouse-control-center"
PKG_NAME="BackhouseControlCenter-arm64.pkg"

OUT_DIR="$SCRIPT_DIR/out"
ROOT_DIR="$OUT_DIR/root"
PKG_SCRIPTS_DIR="$OUT_DIR/scripts"
PKG_PATH="$OUT_DIR/$PKG_NAME"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This packaging script must run on macOS."
  exit 1
fi

if [[ "$(uname -m)" != "arm64" ]]; then
  echo "Warning: expected Apple Silicon (arm64). Current arch: $(uname -m)"
fi

for cmd in npm pkgbuild rsync; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing required command: $cmd"
    exit 1
  fi
done

VERSION="${1:-$(date +%Y.%m.%d.%H%M)}"

echo "==> Preparing macOS package build"
echo "    Version: $VERSION"
echo "    Repo:    $REPO_ROOT"

rm -rf "$OUT_DIR"
mkdir -p "$ROOT_DIR$APP_ROOT/server" "$ROOT_DIR/Library/LaunchDaemons" "$PKG_SCRIPTS_DIR"

if [[ "${SKIP_BUILD:-0}" != "1" ]]; then
  echo "==> Installing/building client"
  (cd "$REPO_ROOT/client" && npm ci && npm run build)
else
  if [[ ! -d "$REPO_ROOT/client/dist" ]]; then
    echo "SKIP_BUILD=1 but client/dist is missing."
    exit 1
  fi
fi

echo "==> Syncing server files"
rsync -a \
  --exclude node_modules \
  --exclude media \
  --exclude audio \
  --exclude public \
  "$REPO_ROOT/server/" "$ROOT_DIR$APP_ROOT/server/"

echo "==> Installing production server dependencies"
(cd "$ROOT_DIR$APP_ROOT/server" && npm ci --omit=dev)

echo "==> Copying built client into server/public"
mkdir -p "$ROOT_DIR$APP_ROOT/server/public"
rsync -a "$REPO_ROOT/client/dist/" "$ROOT_DIR$APP_ROOT/server/public/"

echo "==> Installing macOS service files"
cp "$SCRIPT_DIR/templates/run-server.sh" "$ROOT_DIR$APP_ROOT/server/run-server.sh"
cp "$SCRIPT_DIR/templates/uninstall.sh" "$ROOT_DIR$APP_ROOT/uninstall.sh"
cp "$SCRIPT_DIR/templates/$APP_LABEL.plist" "$ROOT_DIR/Library/LaunchDaemons/$APP_LABEL.plist"
chmod +x "$ROOT_DIR$APP_ROOT/server/run-server.sh" "$ROOT_DIR$APP_ROOT/uninstall.sh"

cp "$SCRIPT_DIR/scripts/preinstall" "$PKG_SCRIPTS_DIR/preinstall"
cp "$SCRIPT_DIR/scripts/postinstall" "$PKG_SCRIPTS_DIR/postinstall"
chmod +x "$PKG_SCRIPTS_DIR/preinstall" "$PKG_SCRIPTS_DIR/postinstall"

echo "==> Building pkg"
pkgbuild \
  --root "$ROOT_DIR" \
  --scripts "$PKG_SCRIPTS_DIR" \
  --identifier "$APP_ID" \
  --version "$VERSION" \
  --install-location "/" \
  "$PKG_PATH"

echo ""
echo "Package built:"
echo "  $PKG_PATH"
echo ""
echo "Install on target Mac:"
echo "  sudo installer -pkg \"$PKG_PATH\" -target /"
echo ""
