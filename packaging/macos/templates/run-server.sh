#!/bin/bash
set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export NODE_ENV="${NODE_ENV:-production}"
export PORT="${PORT:-3000}"
export BHP_OPEN_BROWSER="${BHP_OPEN_BROWSER:-0}"

if [[ -z "${FFMPEG_PATH:-}" ]] && command -v ffmpeg >/dev/null 2>&1; then
  export FFMPEG_PATH="$(command -v ffmpeg)"
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

exec node index.js
