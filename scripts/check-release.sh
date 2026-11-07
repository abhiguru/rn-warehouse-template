#!/usr/bin/env bash
set -euo pipefail

# Release gate: any semantic version tag (vMAJOR.MINOR.PATCH with an optional
# -prerelease suffix) is validated by the release workflow. Branch refs and
# every other tag name are refused. Publishing a release stays a manual step
# after the validation run passes.
#
# The tag must also name the version the build carries: app.json `expo.version`, without the leading v and the
# -prerelease suffix. A facility compares that version with its minimum (docs/API_CONTRACT.md in the backend), so a
# release tagged v0.7.0 whose app.json still says 0.6.0 would be refused or accepted wrongly. RELEASE_APP_CONFIG
# names another file (the tests use it).
#
# The C locale keeps the bracket expressions below byte-exact; under other
# collations a range such as [A-Za-z] can admit extra characters.
export LC_ALL=C

if [[ "${GITHUB_REF_TYPE:-}" != tag ]]; then
  echo "Refusing release: GITHUB_REF_TYPE is '${GITHUB_REF_TYPE:-}', expected a tag ref." >&2
  exit 1
fi

if [[ ! "${GITHUB_REF_NAME:-}" =~ ^v[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]]; then
  echo "Refusing release: '${GITHUB_REF_NAME:-}' is not a semantic version tag (vMAJOR.MINOR.PATCH[-prerelease])." >&2
  exit 1
fi

tag_version="${GITHUB_REF_NAME#v}"
tag_version="${tag_version%%-*}"
config="${RELEASE_APP_CONFIG:-app.json}"
app_version="$(node -e "process.stdout.write(String(JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8')).expo?.version ?? ''))" "$config")" || {
  echo "Refusing release: cannot read expo.version from ${config}." >&2
  exit 1
}
if [[ "$app_version" != "$tag_version" ]]; then
  echo "Refusing release: tag ${GITHUB_REF_NAME} is version ${tag_version}, but ${config} (expo.version) says '${app_version}'. Bump the version (app.json, package.json, android.versionCode) in the release commit, or tag the version the build carries." >&2
  exit 1
fi

echo "Release gate passed for tag ${GITHUB_REF_NAME}."
echo 'Validation only: a maintainer publishes the release manually after this run.'
