#!/usr/bin/env bash
set -euo pipefail

# 只操作养老验收站的版本目录和 current 软链接；其他 Nginx 路径不在本脚本范围内。
if [[ $# -lt 3 ]]; then
  echo 'Usage: release-eldercare.sh deploy|rollback RUN_ID-ATTEMPT COMMIT_SHA [UPLOAD_DIR]' >&2
  exit 2
fi
mode="$1"
run_key="$2"
commit_sha="$3"
upload_dir=''
if [[ $# -ge 4 ]]; then upload_dir="$4"; fi
root=/var/www/eldercare
if [[ -v ELDERCARE_DEPLOY_ROOT ]]; then root="$ELDERCARE_DEPLOY_ROOT"; fi

if [[ ! "$run_key" =~ ^[0-9]+-[0-9]+$ || ! "$commit_sha" =~ ^[0-9a-f]{40}$ ]]; then
  echo 'Expected a numeric GitHub run ID/attempt and a 40-character commit SHA.' >&2
  exit 2
fi
if [[ "$root" != /* || "$root" == / || ! -d "$root/releases" ]]; then
  echo 'The eldercare release root is missing or unsafe.' >&2
  exit 2
fi

# 与其他通过本脚本执行的发布/回滚互斥；部署账号须能写此目录。
exec 9> "$root/.release.lock"
flock -x 9

release="$root/releases/gha-$run_key-$commit_sha"
current="$root/current"
if [[ ! -L "$current" ]]; then
  echo 'The current release must be a symlink; refusing to replace a directory.' >&2
  exit 2
fi

current_target="$(readlink -f "$current")"
case "$current_target" in
  "$root"/releases/*) ;;
  *) echo 'The current release points outside the eldercare releases directory.' >&2; exit 2 ;;
esac

switch_to() {
  local destination="$1"
  local next_link="$root/.current-gha-$run_key-$commit_sha"
  if [[ -e "$next_link" || -L "$next_link" ]]; then
    echo 'A temporary release link already exists; refusing to overwrite it.' >&2
    exit 2
  fi
  ln -s "$destination" "$next_link"
  mv -Tf "$next_link" "$current"
}

case "$mode" in
  deploy)
    if [[ -z "$upload_dir" || ! -f "$upload_dir/eldercare.tar.gz" || ! -f "$upload_dir/eldercare.tar.gz.sha256" ]]; then
      echo 'The uploaded release archive and checksum are required.' >&2
      exit 2
    fi
    if [[ -e "$release" || -L "$release" ]]; then
      echo 'This release already exists; rerun GitHub Actions with a new attempt.' >&2
      exit 2
    fi
    (cd "$upload_dir" && sha256sum -c eldercare.tar.gz.sha256)
    mkdir -p "$release/eldercare"
    tar -xzf "$upload_dir/eldercare.tar.gz" -C "$release/eldercare" --no-same-owner
    if [[ ! -s "$release/eldercare/index.html" || ! -s "$release/eldercare/404.html" ]]; then
      echo 'The static export is missing its homepage or 404 page.' >&2
      exit 1
    fi
    if [[ "$(tr -d '\r\n' < "$release/eldercare/release.txt")" != "$commit_sha" ]]; then
      echo 'The release marker does not match the source commit.' >&2
      exit 1
    fi
    if find "$release/eldercare" -type l -print -quit | grep -q .; then
      echo 'The public static export may not contain symlinks.' >&2
      exit 1
    fi
    if [[ "$(readlink -f "$current")" != "$current_target" ]]; then
      echo 'The active release changed during preparation; refusing to overwrite it.' >&2
      exit 1
    fi
    printf '%s\n' "$current_target" > "$release/.previous-target"
    switch_to "$release"
    echo "Published $release; previous version: $current_target"
    ;;
  rollback)
    if [[ "$current_target" != "$release" ]]; then
      echo 'This release is not active; no rollback is needed.'
      exit 0
    fi
    if [[ ! -f "$release/.previous-target" ]]; then
      echo 'The active release has no previous-version record.' >&2
      exit 2
    fi
    previous="$(cat "$release/.previous-target")"
    case "$previous" in
      "$root"/releases/*) ;;
      *) echo 'The previous release is outside the eldercare releases directory.' >&2; exit 2 ;;
    esac
    if [[ ! -d "$previous/eldercare" ]]; then
      echo 'The previous release is unavailable.' >&2
      exit 2
    fi
    if [[ "$(readlink -f "$current")" != "$release" ]]; then
      echo 'Another release became active; refusing to roll it back.' >&2
      exit 2
    fi
    switch_to "$previous"
    echo "Rolled back to $previous"
    ;;
  *)
    echo 'Usage: release-eldercare.sh deploy|rollback RUN_ID-ATTEMPT COMMIT_SHA [UPLOAD_DIR]' >&2
    exit 2
    ;;
esac
