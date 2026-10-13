#!/usr/bin/env bash
set -euo pipefail

cd "$(cd -- "$(dirname -- "$0")" && pwd -P)"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js was not found on PATH. Install it, then run this again."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "Installing dependencies first..."
  npm install
fi

if [ ! -f "dist/index.js" ]; then
  echo "Building the engine first..."
  npm run build
fi

exec node scripts/damage.mjs "$@"
