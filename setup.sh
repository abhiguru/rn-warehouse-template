#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"
node -e 'const [major, minor] = process.versions.node.split(".").map(Number); if (major < 22 || (major === 22 && minor < 18)) { console.error("Node.js 22.18+ required"); process.exit(1); }'
npm ci
node scripts/create-env.mjs
echo "Dependencies installed. No Docker credentials were inspected or changed."
echo "Start the companion backend with bash setup.sh --demo. See docs/DEVELOPER_HANDOFF.md."
echo "After configuring a compatible backend: npm run doctor"
echo "For a development build: npm run android (or npm run ios on macOS)."
