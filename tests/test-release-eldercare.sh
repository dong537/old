#!/usr/bin/env bash
set -euo pipefail
export LC_ALL=C

repo="$(cd "$(dirname "$0")/.." && pwd)"
script="$repo/deploy/release-eldercare.sh"
scratch="$(mktemp -d)"
root="$scratch/eldercare"
upload="$scratch/upload"
source="$scratch/export"
sha='0123456789abcdef0123456789abcdef01234567'
old_sha='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'

fail() { echo "$*" >&2; exit 1; }
release() { ELDERCARE_DEPLOY_ROOT="$root" bash "$script" "$@"; }
same_inode() { [[ "$(stat -c '%d:%i' "$1")" == "$(stat -c '%d:%i' "$2")" ]]; }
manifest() {
  (cd "$1" && find . -type f -print0 | sort -z | xargs -0 sha256sum) \
    > "$upload/eldercare.manifest.sha256"
}
sync_files() { (umask 022; rsync -r --checksum --delete --stats "$source/" "$1/" > "$2"); }

mkdir -p "$root/releases/old/eldercare" "$upload" "$source"
old="$root/releases/old/eldercare"
printf 'old homepage\n' > "$old/index.html"
printf 'not found\n' > "$old/404.html"
printf 'unchanged\n' > "$old/keep.txt"
printf 'OLD!\n' > "$old/change.txt"
printf 'remove me\n' > "$old/deleted.txt"
printf 'same bytes\n' > "$old/mtime-only.txt"
printf '%s\n' "$old_sha" > "$old/release.txt"
touch -d '2020-01-01 00:00:00 UTC' "$old/mtime-only.txt"
ln -s "$root/releases/old" "$root/current"

printf 'new homepage\n' > "$source/index.html"
printf 'not found\n' > "$source/404.html"
printf 'unchanged\n' > "$source/keep.txt"
printf 'NEW!\n' > "$source/change.txt"
printf 'new file\n' > "$source/added.txt"
mkdir -p "$source/added-dir"
printf 'nested new file\n' > "$source/added-dir/new.txt"
printf 'same bytes\n' > "$source/mtime-only.txt"
printf '%s\n' "$sha" > "$source/release.txt"
touch -d '2026-11-24 00:00:00 UTC' "$source/mtime-only.txt"
[[ "$(wc -c < "$old/change.txt")" -eq "$(wc -c < "$source/change.txt")" ]]
manifest "$source"
umask 077

# 候选由当前版本硬链接克隆；只有内容变化才经网络传输。
candidate="$(release prepare 123-1 "$sha")"
[[ "$candidate" == "$root/releases/gha-123-1-$sha/eldercare" ]] || fail 'prepare returned an unexpected path'
[[ "$(stat -c '%a' "$(dirname "$candidate")")" == 755 ]] || fail 'candidate release directory is not traversable by the web server'
[[ "$(stat -c '%a' "$candidate")" == 755 ]] || fail 'candidate export directory is not traversable by the web server'
[[ "$(readlink -f "$root/current")" == "$root/releases/old" ]]
same_inode "$old/keep.txt" "$candidate/keep.txt" || fail 'prepare did not hardlink unchanged content'
sync_files "$candidate" "$scratch/first-rsync.stats"
same_inode "$old/keep.txt" "$candidate/keep.txt" || fail 'unchanged content was transferred'
same_inode "$old/mtime-only.txt" "$candidate/mtime-only.txt" || fail 'mtime-only content was transferred'
! same_inode "$old/change.txt" "$candidate/change.txt" || fail 'changed content modified the old release inode'
[[ "$(cat "$old/change.txt")" == 'OLD!' && "$(cat "$candidate/change.txt")" == 'NEW!' ]]
[[ -f "$candidate/added.txt" && ! -e "$candidate/deleted.txt" && -f "$old/deleted.txt" ]]
[[ "$(stat -c '%a' "$candidate/added.txt")" == 644 ]] || fail 'new public file is not readable by the web server'
[[ "$(stat -c '%a' "$candidate/added-dir")" == 755 ]] || fail 'new public directory is not traversable by the web server'

release activate 123-1 "$sha" "$upload"
[[ "$(readlink -f "$root/current")" == "$root/releases/gha-123-1-$sha" ]]
[[ "$(cat "$root/current/eldercare/release.txt")" == "$sha" ]]

# 内容完全相同时为零传输；未激活候选可清理，激活版本不可 abort。
same_candidate="$(release prepare 123-2 "$sha")"
sync_files "$same_candidate" "$scratch/same-rsync.stats"
grep -Eq '^Number of (regular )?files transferred: 0$' "$scratch/same-rsync.stats" \
  || fail 'identical release unexpectedly transferred files'
same_inode "$root/current/eldercare/keep.txt" "$same_candidate/keep.txt"
release abort 123-2 "$sha"
[[ ! -e "$root/releases/gha-123-2-$sha" ]]
if release abort 123-1 "$sha"; then fail 'abort removed an active release'; fi
[[ "$(readlink -f "$root/current")" == "$root/releases/gha-123-1-$sha" ]]

release rollback 123-1 "$sha"
[[ "$(readlink -f "$root/current")" == "$root/releases/old" ]]
[[ "$(cat "$old/change.txt")" == 'OLD!' ]]
if release abort 123-1 "$sha"; then fail 'abort removed a previously activated release'; fi
[[ -d "$root/releases/gha-123-1-$sha/eldercare" ]]
[[ "$(readlink -f "$root/current")" == "$root/releases/old" ]]

# 传输后的篡改不得发布，旧版不能受硬链接副作用影响。
bad="$(release prepare 123-3 "$sha")"
sync_files "$bad" "$scratch/bad-rsync.stats"
printf 'tampered\n' >> "$bad/added.txt"
if release activate 123-3 "$sha" "$upload"; then fail 'corrupt candidate passed manifest validation'; fi
[[ "$(readlink -f "$root/current")" == "$root/releases/old" ]]
[[ "$(cat "$old/change.txt")" == 'OLD!' ]]
release abort 123-3 "$sha"

# 即使清单与文件一致，错误的 commit marker 也不能发布。
wrong="$(release prepare 123-4 "$sha")"
sync_files "$wrong" "$scratch/wrong-rsync.stats"
printf '%s\n' "$old_sha" > "$wrong/release.txt"
manifest "$wrong"
if release activate 123-4 "$sha" "$upload"; then fail 'wrong commit marker was published'; fi
[[ "$(readlink -f "$root/current")" == "$root/releases/old" ]]
release abort 123-4 "$sha"
manifest "$source"

# 公共目录不允许 symlink。
linked="$(release prepare 123-5 "$sha")"
sync_files "$linked" "$scratch/link-rsync.stats"
ln -s /etc/passwd "$linked/unsafe-link"
if release activate 123-5 "$sha" "$upload"; then fail 'public symlink was published'; fi
[[ "$(readlink -f "$root/current")" == "$root/releases/old" ]]
release abort 123-5 "$sha"

# 首页或 404 不完整时不得切换。
missing="$(release prepare 123-6 "$sha")"
sync_files "$missing" "$scratch/missing-rsync.stats"
rm "$missing/404.html"
if release activate 123-6 "$sha" "$upload"; then fail 'missing 404 page was published'; fi
[[ "$(readlink -f "$root/current")" == "$root/releases/old" ]]
release abort 123-6 "$sha"

echo 'Incremental release, integrity, deletion and rollback checks passed.'
