#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
echo "Deprecated alias: the app fetches its public anon key at bootstrap. No key copying is needed."
exec node "$ROOT/scripts/check-backend.mjs"
