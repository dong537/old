#!/usr/bin/env bash
set -euo pipefail

repo="$(cd "$(dirname "$0")/.." && pwd)"
scratch="$(mktemp -d)"
root="$scratch/eldercare"
upload="$scratch/upload"
sha='0123456789abcdef0123456789abcdef01234567'
mkdir -p "$root/releases/old/eldercare" "$upload" "$scratch/export"
printf 'old\n' > "$root/releases/old/eldercare/index.html"
ln -s "$root/releases/old" "$root/current"
printf 'new\n' > "$scratch/export/index.html"
printf 'missing\n' > "$scratch/export/404.html"
printf '%s\n' "$sha" > "$scratch/export/release.txt"
tar -czf "$upload/eldercare.tar.gz" -C "$scratch/export" .
(cd "$upload" && sha256sum eldercare.tar.gz > eldercare.tar.gz.sha256)

ELDERCARE_DEPLOY_ROOT="$root" bash "$repo/deploy/release-eldercare.sh" deploy 123-1 "$sha" "$upload"
[[ "$(readlink -f "$root/current")" == "$root/releases/gha-123-1-$sha" ]]
[[ "$(cat "$root/current/eldercare/release.txt")" == "$sha" ]]
ELDERCARE_DEPLOY_ROOT="$root" bash "$repo/deploy/release-eldercare.sh" rollback 123-1 "$sha"
[[ "$(readlink -f "$root/current")" == "$root/releases/old" ]]

printf 'corrupt\n' >> "$upload/eldercare.tar.gz"
if ELDERCARE_DEPLOY_ROOT="$root" bash "$repo/deploy/release-eldercare.sh" deploy 123-2 "$sha" "$upload"; then
  echo 'A modified archive unexpectedly passed checksum validation.' >&2
  exit 1
fi
[[ "$(readlink -f "$root/current")" == "$root/releases/old" ]]

printf 'wrong-commit\n' > "$scratch/export/release.txt"
tar -czf "$upload/eldercare.tar.gz" -C "$scratch/export" .
(cd "$upload" && sha256sum eldercare.tar.gz > eldercare.tar.gz.sha256)
if ELDERCARE_DEPLOY_ROOT="$root" bash "$repo/deploy/release-eldercare.sh" deploy 123-3 "$sha" "$upload"; then
  echo 'A release with the wrong commit marker was published.' >&2
  exit 1
fi
[[ "$(readlink -f "$root/current")" == "$root/releases/old" ]]
echo 'Release, rollback, checksum and commit-marker checks passed.'
