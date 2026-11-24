#!/usr/bin/env bash
set -euo pipefail

# 只操作养老验收站的版本目录和 current 软链接；其他 Nginx 路径不在本脚本范围内。
if [[ $# -lt 3 ]]; then
  echo 'Usage: release-eldercare.sh prepare|apply|activate|rollback|abort RUN_ID-ATTEMPT COMMIT_SHA [UPLOAD_DIR]' >&2
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
release_tree="$release/eldercare"
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

safe_delta_path() {
  local rel="$1"
  [[ "$rel" == ./* && "$rel" != './' && "$rel" != *'//'* && "$rel" != *'/./'* && "$rel" != *'/../'* && "$rel" != *'/.' && "$rel" != *'/..' && "$rel" != */ && "$rel" != *[[:cntrl:]]* ]]
}

case "$mode" in
  prepare)
    if [[ -e "$release" || -L "$release" ]]; then
      echo 'This release already exists; rerun GitHub Actions with a new attempt.' >&2
      exit 2
    fi
    if [[ ! -d "$current_target/eldercare" ]]; then
      echo 'The active release has no static export to use as a baseline.' >&2
      exit 2
    fi
    (umask 022; mkdir -p "$release_tree")
    # Only the candidate may replace a hardlinked file; the active release stays untouched.
    cp -al -- "$current_target/eldercare/." "$release_tree/"
    if [[ -s "$current_target/eldercare.manifest.sha256" ]]; then
      cp -- "$current_target/eldercare.manifest.sha256" "$release/.previous-manifest.sha256"
    else
      echo 'Previous release has no stored manifest; hashing its public tree once.' >&2
      (cd "$current_target/eldercare" && find . -type f -print0 | LC_ALL=C sort -z | xargs -0 sha256sum) > "$release/.previous-manifest.sha256"
    fi
    printf '%s\n' "$current_target" > "$release/.previous-target"
    printf '%s\n' "$release_tree"
    ;;
  apply)
    if [[ -z "$upload_dir" || ! -d "$upload_dir" || ! -f "$upload_dir/changed.paths.nul" || ! -f "$upload_dir/removed.paths.nul" ]]; then
      echo 'The changed and removed path lists are required.' >&2
      exit 2
    fi
    if [[ ! -d "$release_tree" || -L "$release" || ! -f "$release/.previous-target" ]]; then
      echo 'The prepared candidate is missing or unsafe.' >&2
      exit 2
    fi
    if find "$release_tree" -type l -print -quit | grep -q .; then
      echo 'The candidate contains a symlink before delta application.' >&2
      exit 2
    fi
    while IFS= read -r -d '' rel; do
      if ! safe_delta_path "$rel"; then echo 'Unsafe removed path.' >&2; exit 2; fi
      rm -f -- "$release_tree/$rel"
    done < "$upload_dir/removed.paths.nul"
    find "$release_tree" -mindepth 1 -depth -type d -empty -delete
    if [[ -s "$upload_dir/changed.paths.nul" ]]; then
      if [[ ! -s "$upload_dir/changed.tar.gz" ]]; then echo 'Changed archive is missing.' >&2; exit 2; fi
      while IFS= read -r -d '' rel; do
        if ! safe_delta_path "$rel"; then echo 'Unsafe changed path.' >&2; exit 2; fi
      done < "$upload_dir/changed.paths.nul"
      if ! cmp -s <(tr '\0' '\n' < "$upload_dir/changed.paths.nul" | LC_ALL=C sort) <(tar --quoting-style=literal -tzf "$upload_dir/changed.tar.gz" | LC_ALL=C sort); then
        echo 'Archive members do not match the changed path list.' >&2
        exit 2
      fi
      if ! tar --quoting-style=literal -tzvf "$upload_dir/changed.tar.gz" | awk 'substr($0,1,1)!="-" {exit 1}'; then
        echo 'The changed archive contains a non-regular member.' >&2
        exit 2
      fi
      (umask 022; tar --extract --gzip --file="$upload_dir/changed.tar.gz" --directory="$release_tree" --unlink-first --no-same-owner --no-same-permissions)
    elif [[ -e "$upload_dir/changed.tar.gz" ]]; then
      echo 'An archive was supplied for an empty changed path list.' >&2
      exit 2
    fi
    echo 'Applied manifest delta to the isolated candidate.'
    ;;
  activate)
    if [[ -z "$upload_dir" || ! -f "$upload_dir/eldercare.manifest.sha256" ]]; then
      echo 'The full static-file checksum manifest is required.' >&2
      exit 2
    fi
    upload_dir="$(readlink -f -- "$upload_dir")"
    if [[ ! -d "$release_tree" || -L "$release" || ! -f "$release/.previous-target" ]]; then
      echo 'The prepared release is missing or unsafe.' >&2
      exit 2
    fi
    previous="$(cat "$release/.previous-target")"
    if [[ "$previous" != "$current_target" ]]; then
      echo 'The active release changed during transfer; refusing to switch.' >&2
      exit 1
    fi
    if [[ ! -s "$release_tree/index.html" || ! -s "$release_tree/404.html" ]]; then
      echo 'The static export is missing its homepage or 404 page.' >&2
      exit 1
    fi
    if [[ ! -f "$release_tree/release.txt" || "$(tr -d '\r\n' < "$release_tree/release.txt")" != "$commit_sha" ]]; then
      echo 'The release marker does not match the source commit.' >&2
      exit 1
    fi
    if find "$release_tree" -type l -print -quit | grep -q .; then
      echo 'The public static export may not contain symlinks.' >&2
      exit 1
    fi
    expected_count="$(wc -l < "$upload_dir/eldercare.manifest.sha256")"
    actual_count="$(find "$release_tree" -type f -printf . | wc -c)"
    if [[ "$expected_count" -eq 0 || "$expected_count" -ne "$actual_count" ]]; then
      echo 'The synchronized file count does not match the release manifest.' >&2
      exit 1
    fi
    (cd "$release_tree" && sha256sum -c --quiet "$upload_dir/eldercare.manifest.sha256")
    install -m 644 -- "$upload_dir/eldercare.manifest.sha256" "$release/eldercare.manifest.sha256"
    # Once a switch is attempted, keep this version for audit and future rollback chains.
    printf '%s\n' "$commit_sha" > "$release/.activation-attempted"
    switch_to "$release"
    echo "Published $release; previous version: $current_target"
    ;;
  abort)
    if [[ "$current_target" == "$release" || -L "$release" || -e "$release/.activation-attempted" ]]; then
      echo 'Refusing to remove an active or previously activated release.' >&2
      exit 2
    fi
    if [[ -d "$release" ]]; then rm -rf -- "$release"; fi
    echo "Removed unactivated candidate $release"
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
    echo 'Usage: release-eldercare.sh prepare|apply|activate|rollback|abort RUN_ID-ATTEMPT COMMIT_SHA [UPLOAD_DIR]' >&2
    exit 2
    ;;
esac
