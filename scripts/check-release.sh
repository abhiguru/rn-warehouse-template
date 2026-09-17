#!/usr/bin/env bash
set -euo pipefail

# Only this reviewed source-demo tag is eligible. Historical tags keep their
# original workflows, and production or branch contexts use the production gate.
if [[ "${GITHUB_REF_TYPE:-}" == tag && "${GITHUB_REF_NAME:-}" == v0.2.2-demo ]]; then
  echo 'v0.2.2-demo source-only prerelease gate passed.'
  echo 'Physical hardware, iOS, production operations, and native binaries remain outside this release.'
else
  echo 'Refusing release: expected tag v0.2.2-demo.' >&2
  exit 1
fi
