#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"
node -e 'const [major, minor] = process.versions.node.split(".").map(Number); if (major < 22 || (major === 22 && minor < 18)) { console.error("Node.js 22.18+ required"); process.exit(1); }'
npm ci
if [[ ! -e .env ]]; then cp .env.example .env; fi
echo "Dependencies installed. No Docker credentials were inspected or changed."
echo "Read docs/READINESS.md: the companion backend is not yet complete."
echo "After configuring a compatible backend: npm run check:backend"
echo "For a development build: npm run android (or npm run ios on macOS)."
