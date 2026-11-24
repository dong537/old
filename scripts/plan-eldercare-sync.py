"""Plan the files to transfer between two verified static release manifests.

Both inputs use the GNU sha256sum format produced by the release workflow. The
NUL-delimited outputs can be consumed by tar --null -T and a guarded remover.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import re


MANIFEST_LINE = re.compile(r"([0-9a-f]{64})  (\./.+)")


def validate_path(path: str) -> None:
    if not path.startswith("./"):
        raise ValueError(f"Manifest path is not relative to the export root: {path!r}")
    if chr(92) in path or any(ord(char) < 32 or ord(char) == 127 for char in path):
        raise ValueError(f"Manifest path contains an unsafe character: {path!r}")
    if any(part in {"", ".", ".."} for part in path[2:].split("/")):
        raise ValueError(f"Manifest path has an unsafe segment: {path!r}")


def read_manifest(path: Path) -> dict[str, str]:
    raw = path.read_bytes()
    if not raw or not raw.endswith(b"\n") or b"\r" in raw:
        raise ValueError(f"Manifest must be nonempty, LF-terminated and free of CR: {path}")
    content = raw.decode("utf-8")
    entries: dict[str, str] = {}
    for number, line in enumerate(content.split("\n")[:-1], start=1):
        match = MANIFEST_LINE.fullmatch(line)
        if match is None:
            raise ValueError(f"Invalid or escaped sha256sum line in {path}:{number}")
        digest, relative_path = match.groups()
        validate_path(relative_path)
        if relative_path in entries:
            raise ValueError(f"Duplicate manifest path in {path}:{number}: {relative_path!r}")
        entries[relative_path] = digest
    return entries


def write_paths(path: Path, paths: list[str]) -> None:
    path.write_bytes(b"".join(item.encode("utf-8") + b"\0" for item in paths))


def plan(previous_path: Path, next_path: Path, changed_path: Path,
         removed_path: Path, summary_path: Path) -> dict[str, int]:
    paths = [previous_path, next_path, changed_path, removed_path, summary_path]
    if len({path.resolve() for path in paths}) != len(paths):
        raise ValueError("Manifest inputs and delta outputs must have distinct paths")
    if any(path.exists() or path.is_symlink() for path in paths[2:]):
        raise ValueError("Delta output already exists; use fresh output paths")

    previous = read_manifest(previous_path)
    current = read_manifest(next_path)
    sort_key = lambda item: item.encode("utf-8")
    changed = sorted((name for name, digest in current.items()
                      if previous.get(name) != digest), key=sort_key)
    removed = sorted((name for name in previous if name not in current), key=sort_key)
    summary = {
        "schemaVersion": 1,
        "previousCount": len(previous),
        "nextCount": len(current),
        "changedCount": len(changed),
        "removedCount": len(removed),
        "unchangedCount": len(current) - len(changed),
    }
    write_paths(changed_path, changed)
    write_paths(removed_path, removed)
    summary_path.write_text(json.dumps(summary, sort_keys=True) + "\n", encoding="utf-8")
    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("previous", "next", "changed", "removed", "summary"):
        parser.add_argument("--" + name, type=Path, required=True)
    args = parser.parse_args()
    try:
        summary = plan(args.previous, args.next, args.changed, args.removed, args.summary)
    except (OSError, UnicodeError, ValueError) as error:
        parser.error(str(error))
    print(json.dumps(summary, sort_keys=True))


if __name__ == "__main__":
    main()
