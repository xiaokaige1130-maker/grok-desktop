#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
if [[ ! -d node_modules/electron ]]; then
  echo "Installing dependencies…"
  npm install
fi
exec npx electron .
