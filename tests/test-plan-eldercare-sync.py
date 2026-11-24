"""End-to-end tests for the release manifest delta planner."""

import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "plan-eldercare-sync.py"
A = "a" * 64
B = "b" * 64
C = "c" * 64


def line(digest: str, path: str) -> str:
    return f"{digest}  {path}\n"


class ManifestDeltaPlannerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.previous = self.root / "previous.sha256"
        self.next = self.root / "next.sha256"
        self.changed = self.root / "changed.paths.nul"
        self.removed = self.root / "removed.paths.nul"
        self.summary = self.root / "summary.json"

    def run_planner(self, previous: str, next_manifest: str) -> subprocess.CompletedProcess[str]:
        self.previous.write_bytes(previous.encode("utf-8"))
        self.next.write_bytes(next_manifest.encode("utf-8"))
        return subprocess.run(
            [sys.executable, str(SCRIPT), "--previous", str(self.previous),
             "--next", str(self.next), "--changed", str(self.changed),
             "--removed", str(self.removed), "--summary", str(self.summary)],
            text=True, capture_output=True, check=False,
        )

    def test_changed_and_removed_files_are_sorted_and_nul_delimited(self) -> None:
        previous = line(A, "./b.html") + line(A, "./d.html") + line(A, "./z.txt")
        current = line(B, "./q.json") + line(A, "./b.html") + line(C, "./d.html") + line(A, "./a.html")
        result = self.run_planner(previous, current)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.changed.read_bytes(), b"./a.html\0./d.html\0./q.json\0")
        self.assertEqual(self.removed.read_bytes(), b"./z.txt\0")
        self.assertEqual(json.loads(self.summary.read_text(encoding="utf-8")), {
            "schemaVersion": 1, "previousCount": 3, "nextCount": 4,
            "changedCount": 3, "removedCount": 1, "unchangedCount": 1,
        })

    def test_unchanged_release_writes_empty_lists(self) -> None:
        manifest = line(A, "./index.html")
        result = self.run_planner(manifest, manifest)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.changed.read_bytes(), b"")
        self.assertEqual(self.removed.read_bytes(), b"")
        self.assertEqual(json.loads(self.summary.read_text(encoding="utf-8"))["unchangedCount"], 1)

    def test_rejects_malformed_or_unsafe_manifest_without_writing_outputs(self) -> None:
        invalid = [
            line(A, "../escape"), line(A, "/absolute"), line(A, "./a/../b"),
            line(A, "./a//b"), line(A, "./"), line(A, "./a\\b"),
            line(A, "./a\x01b"), line(A, "./same") + line(B, "./same"),
            "\\" + line(A, "./escaped"), line("g" * 64, "./bad-hash"),
            f"{A}  ./missing-final-newline",
        ]
        for manifest in invalid:
            with self.subTest(manifest=repr(manifest[:100])):
                result = self.run_planner(line(A, "./index.html"), manifest)
                self.assertNotEqual(result.returncode, 0)
                self.assertFalse(self.changed.exists())
                self.assertFalse(self.removed.exists())
                self.assertFalse(self.summary.exists())

    def test_refuses_output_path_overlapping_an_input(self) -> None:
        self.previous.write_bytes(line(A, "./index.html").encode("utf-8"))
        self.next.write_bytes(line(B, "./index.html").encode("utf-8"))
        result = subprocess.run(
            [sys.executable, str(SCRIPT), "--previous", str(self.previous),
             "--next", str(self.next), "--changed", str(self.next),
             "--removed", str(self.removed), "--summary", str(self.summary)],
            text=True, capture_output=True, check=False,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.next.read_text(encoding="utf-8"), line(B, "./index.html"))


if __name__ == "__main__":
    unittest.main()
