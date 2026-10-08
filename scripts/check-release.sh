#!/usr/bin/env bash
set -euo pipefail

# Release gate: any semantic version tag (vMAJOR.MINOR.PATCH with an optional
# -prerelease suffix) is validated by the release workflow. Branch refs and
# every other tag name are refused. Publishing a release stays a manual step
# after the validation run passes.
#
# The C locale keeps the bracket expressions below byte-exact; under other
# collations a range such as [A-Za-z] can admit extra characters.
export LC_ALL=C

if [[ "${GITHUB_REF_TYPE:-}" != tag ]]; then
  echo "Refusing release: GITHUB_REF_TYPE is '${GITHUB_REF_TYPE:-}', expected a tag ref." >&2
  exit 1
fi

if [[ "${GITHUB_REF_NAME:-}" =~ ^v[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]]; then
  echo "Release gate passed for tag ${GITHUB_REF_NAME}."
  echo 'Validation only: a maintainer publishes the release manually after this run.'
else
  echo "Refusing release: '${GITHUB_REF_NAME:-}' is not a semantic version tag (vMAJOR.MINOR.PATCH[-prerelease])." >&2
  exit 1
fi
