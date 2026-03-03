#!/bin/bash
set -euo pipefail

LABEL="com.backhouse.controlcenter"
PLIST="/Library/LaunchDaemons/${LABEL}.plist"
APP_ROOT="/opt/backhouse-control-center"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root: sudo $0"
  exit 1
fi

echo "Stopping launchd service..."
launchctl bootout system "$PLIST" >/dev/null 2>&1 || true

echo "Removing files..."
rm -f "$PLIST"
rm -rf "$APP_ROOT"

echo "Done. Backhouse Control Center removed."
