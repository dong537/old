import importlib.util
import io
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch


SCRIPT = (Path(__file__).resolve().parents[1] / "data/private/guangdong-eldercare-source"
          / "research-batch12/west-north-cities/per_row_location_audit.py")
SPEC = importlib.util.spec_from_file_location("west_north_location_audit", SCRIPT)
assert SPEC is not None and SPEC.loader is not None
audit_module = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(audit_module)


class WestNorthLocationAuditTests(unittest.TestCase):
    def test_check_uses_the_archived_version_path(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            versions = root / "versions"
            archived = versions / "v1-fixture"
            archived.mkdir(parents=True)
            (archived / "manifest.json").write_bytes(b"{}")
            manifest = {"version_id": "v1-fixture", "version_path": "versions/v1-fixture"}
            with (patch.object(audit_module, "ROOT", root),
                  patch.object(audit_module, "VERSIONS", versions)):
                audit_module.check_version("versions/v1-fixture", {"manifest.json": b"{}"}, manifest)

    def test_main_writes_immutable_artifacts_under_version_path(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            versions = root / "versions"
            versions.mkdir()
            manifest = {
                "version_id": "v1-fixture",
                "version_path": "versions/v1-fixture",
                "summary": {"row_count": 1},
            }
            output = io.StringIO()
            with (patch.object(audit_module, "ROOT", root),
                  patch.object(audit_module, "VERSIONS", versions),
                  patch.object(audit_module, "build_artifacts", return_value=({"manifest.json": b"{}"}, manifest)),
                  patch.object(sys, "argv", [str(SCRIPT)]),
                  redirect_stdout(output)):
                audit_module.main()

            archived = versions / "v1-fixture" / "manifest.json"
            self.assertEqual(archived.read_bytes(), b"{}")
            self.assertIn("versions/v1-fixture", output.getvalue())


if __name__ == "__main__":
    unittest.main()
