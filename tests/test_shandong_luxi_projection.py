"""The Luxi District CSV is a partial official source, not a current city roster."""

import csv
import io
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from scripts.shandong_luxi_official_rows import OLDER, ROW_COUNT


ROOT = Path(__file__).resolve().parents[1]
BUILDER = ROOT / "scripts/build-national-official.py"


class LuxiProjectionTests(unittest.TestCase):
    def test_only_23_older_rows_are_projected_with_local_scope(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "official"
            run = subprocess.run(
                [sys.executable, str(BUILDER), "--output-dir", str(output)],
                cwd=ROOT, capture_output=True, text=True, encoding="utf-8",
            )
            self.assertEqual(run.returncode, 0, run.stdout + run.stderr)
            manifest = json.loads((output / "manifest.v1.json").read_text(encoding="utf-8"))
            source = next(item for item in manifest["sources"] if item["id"] == "sd-hz-luxi-20250627")
            self.assertEqual(source["rowCount"], ROW_COUNT)
            self.assertEqual((source["province"], source["city"]), ("山东省", "菏泽"))
            self.assertEqual((source["publishedAt"], source["asOf"]), ("2025-07-28", None))
            self.assertIn("鲁西新区", source["scope"])
            self.assertIn("2025-06-27 版本", source["scope"])
            self.assertIn("资料截至日未说明", source["scope"])
            self.assertIn("2026-11-10", source["scope"])
            self.assertIn("仅5行", source["scope"])
            province = next(item for item in manifest["provinces"] if item["slug"] == "shandong")
            city = next(item for item in province["cities"] if item["slug"] == "heze")
            self.assertEqual(city["count"], ROW_COUNT)
            index = json.loads((output / city["indexPath"]).read_text(encoding="utf-8"))
            records = index["records"]
            self.assertEqual([row["rowNumber"] for row in records if row["sourceId"] == source["id"]], list(range(1, 24)))
            self.assertEqual(records[0]["name"], "菏泽华升养老服务有限公司")
            self.assertEqual(records[-1]["name"], "菏泽中智养老护理有限公司")
            details = json.loads((output / "shandong/heze/chunk-001.v1.json").read_text(encoding="utf-8"))["records"]
            self.assertEqual(len(details), ROW_COUNT)
            self.assertTrue(all(row["beds"] is None and row["residentCount"] is None
                                and row["staffCount"] is None and row["services"] is None for row in details))
            old_rows = list(csv.DictReader(io.StringIO(OLDER.read_bytes().decode("gb18030"))))
            published = (output / "manifest.v1.json").read_text(encoding="utf-8") + json.dumps(index, ensure_ascii=False) + json.dumps(details, ensure_ascii=False)
            self.assertNotIn(old_rows[0]["统一社会信用代码"], published)
            self.assertNotIn(old_rows[0]["法定代表人"], published)
            self.assertEqual(list(output.rglob("*.csv")), [])


if __name__ == "__main__":
    unittest.main()
