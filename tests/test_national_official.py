"""Behavior checks for the frozen official source projection."""

import hashlib
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from lxml import html
from scripts.dazhou_county_official_rows import SOURCES as DAZHOU_COUNTY_SOURCES
from scripts.hunan_official_rows import CITY_COUNTS
from scripts.hubei_official_rows import CITY_COUNTS as HUBEI_CITY_COUNTS
from scripts.shijiazhuang_official_rows import PDF_PATH, extract_shijiazhuang_tables


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts/build-national-official.py"
SOURCE_DIR = ROOT / "data/private/national-official-source/raw"
SOURCE_MANIFEST = ROOT / "data/raw/national-official-source-manifest.json"


class NationalOfficialProjectionTests(unittest.TestCase):
    def run_builder(self, output, *, source_dir=SOURCE_DIR, source_manifest=SOURCE_MANIFEST, check=False):
        command = [sys.executable, str(SCRIPT), "--source-dir", str(source_dir),
                   "--source-manifest", str(source_manifest), "--output-dir", str(output)]
        if check:
            command.append("--check")
        return subprocess.run(command, cwd=ROOT, capture_output=True, text=True, encoding="utf-8")

    def changed_source(self, root, source_id, mutate):
        source_dir = root / "raw"
        source_dir.mkdir()
        manifest = json.loads(SOURCE_MANIFEST.read_text(encoding="utf-8"))
        for source in manifest["sources"]:
            original = SOURCE_DIR / source["filename"]
            target = source_dir / source["filename"]
            if source["id"] == source_id:
                raw = mutate(original.read_bytes())
                target.write_bytes(raw)
                source["bytes"] = len(raw)
                source["sha256"] = hashlib.sha256(raw).hexdigest()
            else:
                shutil.copyfile(original, target)
        shutil.copyfile(SOURCE_DIR / "beijing-stars-20260210.html",
                        source_dir / "beijing-stars-20260210.html")
        shutil.copyfile(SOURCE_DIR / "gaoping-202502-page.html",
                        source_dir / "gaoping-202502-page.html")
        shutil.copyfile(SOURCE_DIR / "dazhou-catalog-20260814.html",
                        source_dir / "dazhou-catalog-20260814.html")
        shutil.copyfile(SOURCE_DIR / "anhui-shucheng-catalog-20261117.html",
                        source_dir / "anhui-shucheng-catalog-20261117.html")
        for county in DAZHOU_COUNTY_SOURCES.values():
            shutil.copyfile(county.catalog, source_dir / county.catalog.name)
        shutil.copyfile(SOURCE_DIR / "panzhihua-43f1109ec4c04fde854889873395d4cd-catalog-20261117.html",
                        source_dir / "panzhihua-43f1109ec4c04fde854889873395d4cd-catalog-20261117.html")
        for filename in ("shandong-luxi-catalog-20261117.html", "shandong-luxi-20261110.csv",
                         "shandong-taian-catalog-20261117.html", "shandong-taian-20260801.csv",
                         "shandong-jinan-catalog-20261117.html", "shandong-jinan-202607211315.csv",
                         "shandong-weifang-catalog-20261117.html", "shandong-weifang-20250703.csv",
                         "tianjin-open-license-20261117.html",
                         "zhejiang-provincial-yljg-catalog-detail-20261117.json",
                         "zhejiang-provincial-yljg-dataset-detail-20261117.json",
                         "zhejiang-provincial-yljg-preview-20261117.json",
                         "wenzhou-care-homes-6724-metadata-20261117.html",
                         "wenzhou-care-homes-6724-license-20261117.html"):
            shutil.copyfile(SOURCE_DIR / filename, source_dir / filename)
        source_manifest = root / "source-manifest.json"
        source_manifest.write_text(json.dumps(manifest, ensure_ascii=False), encoding="utf-8")
        return source_dir, source_manifest

    def test_shucheng_complete_preview_adds_twelve_attributed_rows_without_personal_fields(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "public"
            run = self.run_builder(output)
            self.assertEqual(run.returncode, 0, run.stdout + run.stderr)
            manifest = json.loads((output / "manifest.v1.json").read_text(encoding="utf-8"))
            source = next(item for item in manifest["sources"] if item["id"] == "ah-sc-20261014")
            self.assertEqual((source["province"], source["city"], source["rowCount"]),
                             ("安徽省", "六安", 12))
            self.assertEqual((source["publishedAt"], source["asOf"]), ("2026-06-04", None))
            self.assertIn("仅舒城县", source["scope"])
            self.assertIn("完整匿名预览12条", source["scope"])
            self.assertIn("2026-10-14", source["scope"])
            province = next(item for item in manifest["provinces"] if item["slug"] == "anhui")
            self.assertEqual([(city["slug"], city["name"], city["count"])
                              for city in province["cities"]], [("luan", "六安", 12)])
            city = province["cities"][0]
            index = json.loads((output / city["indexPath"]).read_text(encoding="utf-8"))
            self.assertEqual([row["rowNumber"] for row in index["records"]], list(range(1, 13)))
            self.assertEqual(index["records"][0]["name"], "舒城县九久夕阳红养老服务有限公司")
            self.assertEqual(index["records"][5]["name"], "舒城县万福老年公寓")
            self.assertEqual(index["records"][-1]["name"], "舒城县尚德养老护理院")
            chunk = json.loads((output / "anhui" / "luan" / "chunk-001.v1.json").read_text(encoding="utf-8"))
            self.assertTrue(all(row["address"] and row["beds"] is None
                                and row["residentCount"] is None and row["staffCount"] is None
                                and row["services"] is None for row in chunk["records"]))
            public = json.dumps(manifest, ensure_ascii=False) + json.dumps(index, ensure_ascii=False) + json.dumps(chunk, ensure_ascii=False)
            for private_value in ("朱**", "138****2767", "FDDBR", "LXDH"):
                self.assertNotIn(private_value, public)

    def test_rejects_shucheng_preview_or_catalog_drift_before_writing(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            manifest = json.loads(SOURCE_MANIFEST.read_text(encoding="utf-8"))
            source = next(item for item in manifest["sources"] if item["id"] == "ah-sc-20261014")
            source["rowCount"] -= 1
            changed_manifest = root / "source-manifest.json"
            changed_manifest.write_text(json.dumps(manifest, ensure_ascii=False), encoding="utf-8")
            output = root / "public"
            run = self.run_builder(output, source_manifest=changed_manifest)
            self.assertNotEqual(run.returncode, 0)
            self.assertIn("Shucheng source lock differs", run.stderr)
            self.assertFalse(output.exists())

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source_dir = root / "raw"
            source_dir.mkdir()
            manifest = json.loads(SOURCE_MANIFEST.read_text(encoding="utf-8"))
            for source in manifest["sources"]:
                shutil.copyfile(SOURCE_DIR / source["filename"], source_dir / source["filename"])
            for filename in ("beijing-stars-20260210.html", "gaoping-202502-page.html",
                             "dazhou-catalog-20260814.html", "anhui-shucheng-catalog-20261117.html"):
                shutil.copyfile(SOURCE_DIR / filename, source_dir / filename)
            for county in DAZHOU_COUNTY_SOURCES.values():
                shutil.copyfile(county.catalog, source_dir / county.catalog.name)
            for filename in ("panzhihua-43f1109ec4c04fde854889873395d4cd-catalog-20261117.html",
                             "shandong-luxi-catalog-20261117.html", "shandong-luxi-20261110.csv",
                             "shandong-taian-catalog-20261117.html", "shandong-taian-20260801.csv",
                             "shandong-jinan-catalog-20261117.html", "shandong-jinan-202607211315.csv",
                             "shandong-weifang-catalog-20261117.html", "shandong-weifang-20250703.csv",
                             "tianjin-open-license-20261117.html",
                             "zhejiang-provincial-yljg-catalog-detail-20261117.json",
                             "zhejiang-provincial-yljg-dataset-detail-20261117.json",
                             "zhejiang-provincial-yljg-preview-20261117.json"):
                shutil.copyfile(SOURCE_DIR / filename, source_dir / filename)
            catalog = source_dir / "anhui-shucheng-catalog-20261117.html"
            catalog.write_bytes(catalog.read_bytes() + b"changed")
            output = root / "public"
            run = self.run_builder(output, source_dir=source_dir)
            self.assertNotEqual(run.returncode, 0)
            self.assertIn("Shucheng catalog size or SHA-256 changed", run.stderr)
            self.assertFalse(output.exists())

    def test_tianjin_preview_adds_twenty_attributed_rows_only(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "public"
            run = self.run_builder(output)
            self.assertEqual(run.returncode, 0, run.stdout + run.stderr)
            manifest = json.loads((output / "manifest.v1.json").read_text(encoding="utf-8"))
            source = next(item for item in manifest["sources"] if item["id"] == "tj-nankai-20220411")
            self.assertEqual((source["province"], source["city"], source["rowCount"]),
                             ("天津市", "天津", 20))
            self.assertEqual((source["publishedAt"], source["asOf"]), ("2022-04-02", None))
            self.assertEqual(source["title"], "南开区养老机构")
            self.assertIn("天津市信息资源统一开放平台", source["scope"])
            self.assertIn("仅南开区", source["scope"])
            self.assertIn("匿名预览仅20条", source["scope"])
            self.assertIn("来源第N条按冻结预览顺序，不等于原表序号", source["scope"])
            province = next(item for item in manifest["provinces"] if item["slug"] == "tianjin")
            self.assertEqual((province["count"], province["cities"][0]["slug"],
                              province["cities"][0]["count"]), (20, "tianjin", 20))
            index = json.loads((output / province["cities"][0]["indexPath"]).read_text(encoding="utf-8"))
            detail = json.loads((output / "tianjin/tianjin/chunk-001.v1.json").read_text(encoding="utf-8"))
            self.assertEqual(len(index["records"]), 20)
            self.assertEqual(len(detail["records"]), 20)
            self.assertEqual([item["rowNumber"] for item in detail["records"]], list(range(1, 21)))
            self.assertEqual(detail["records"][1]["id"], "tj-nankai-20220411-0002")
            self.assertEqual(index["records"][0]["name"], "天津市南开区福源养老院")
            self.assertEqual(index["records"][-1]["name"], "天津市南开区康泰养老院")
            self.assertTrue(all(item["beds"] is None and item["residentCount"] is None
                                and item["staffCount"] is None and item["services"] is None
                                for item in detail["records"]))
            raw = (SOURCE_DIR / "tianjin-nankai-preview-20261117.html").read_text(encoding="utf-8")
            start = raw.index("var data ={") + len("var data =")
            payload, _ = json.JSONDecoder().raw_decode(raw[start:])
            phones = [row[1] for row in payload["list"] if row[1]]
            public_text = json.dumps(manifest, ensure_ascii=False) + json.dumps(index, ensure_ascii=False) + json.dumps(detail, ensure_ascii=False)
            self.assertTrue(all(phone not in public_text for phone in phones))

    def test_wenzhou_historical_source_projects_196_minimal_rows(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "public"
            run = self.run_builder(output)
            self.assertEqual(run.returncode, 0, run.stdout + run.stderr)
            manifest = json.loads((output / "manifest.v1.json").read_text(encoding="utf-8"))
            source = next(item for item in manifest["sources"] if item["id"] == "zj-wz-20220826")
            self.assertEqual((source["province"], source["city"], source["rowCount"]),
                             ("浙江省", "温州", 196))
            self.assertEqual((source["publishedAt"], source["asOf"]), ("2021-11-09", None))
            for term in ("温州市公共数据开放平台", "2026-11-17下载", "11个区县", "历史", "备案", "下线删除"):
                self.assertIn(term, source["scope"])
            province = next(item for item in manifest["provinces"] if item["slug"] == "zhejiang")
            city = next(item for item in province["cities"] if item["slug"] == "wenzhou")
            self.assertEqual(city["count"], 196)
            index = json.loads((output / city["indexPath"]).read_text(encoding="utf-8"))
            rows = [row for row in index["records"] if row["sourceId"] == source["id"]]
            self.assertEqual(len(rows), 196)
            self.assertEqual([row["rowNumber"] for row in rows], list(range(2, 198)))
            self.assertEqual((rows[0]["name"], rows[0]["beds"]), ("乐清市颐养老年公寓", 100))
            self.assertEqual((rows[-1]["name"], rows[-1]["beds"]), ("瑞安市场桥乐如养老院", 119))
            details = []
            for chunk_name in {row["chunk"] for row in rows}:
                chunk = json.loads((output / "zhejiang" / "wenzhou" / chunk_name).read_text(encoding="utf-8"))
                details.extend(chunk["records"])
            self.assertEqual(len(details), 196)
            self.assertTrue(all(set(row) == {"id", "sourceId", "rowNumber", "name", "address",
                                              "beds", "residentCount", "staffCount", "services"}
                                and row["address"] is None and row["residentCount"] is None
                                and row["staffCount"] is None and row["services"] is None for row in details))
            self.assertEqual(sum(row["beds"] for row in rows), 17786)

    def test_rejects_wenzhou_source_manifest_or_provenance_drift(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            manifest = json.loads(SOURCE_MANIFEST.read_text(encoding="utf-8"))
            source = next(item for item in manifest["sources"] if item["id"] == "zj-wz-20220826")
            source["rowCount"] -= 1
            changed_manifest = root / "source-manifest.json"
            changed_manifest.write_text(json.dumps(manifest, ensure_ascii=False), encoding="utf-8")
            output = root / "public"
            run = self.run_builder(output, source_manifest=changed_manifest)
            self.assertNotEqual(run.returncode, 0)
            self.assertIn("Wenzhou 6724 source lock differs", run.stderr)
            self.assertFalse(output.exists())

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source_dir, source_manifest = self.changed_source(root, "zj-wz-20220826", lambda raw: raw)
            metadata = source_dir / "wenzhou-care-homes-6724-metadata-20261117.html"
            metadata.write_bytes(metadata.read_bytes() + b"changed")
            output = root / "public"
            run = self.run_builder(output, source_dir=source_dir, source_manifest=source_manifest)
            self.assertNotEqual(run.returncode, 0)
            self.assertIn("Wenzhou 6724 metadata size or SHA-256 changed", run.stderr)
            self.assertFalse(output.exists())

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source_dir, source_manifest = self.changed_source(root, "zj-wz-20220826", lambda raw: raw)
            license_file = source_dir / "wenzhou-care-homes-6724-license-20261117.html"
            license_file.write_bytes(license_file.read_bytes() + b"changed")
            output = root / "public"
            run = self.run_builder(output, source_dir=source_dir, source_manifest=source_manifest)
            self.assertNotEqual(run.returncode, 0)
            self.assertIn("Wenzhou 6724 license size or SHA-256 changed", run.stderr)
            self.assertFalse(output.exists())

    def test_zhejiang_projects_only_identifiable_rows_with_original_ordinals(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "public"
            run = self.run_builder(output)
            self.assertEqual(run.returncode, 0, run.stdout + run.stderr)
            manifest = json.loads((output / "manifest.v1.json").read_text(encoding="utf-8"))
            source = next(item for item in manifest["sources"] if item["id"] == "zj-prov-20260902")
            self.assertEqual((source["province"], source["city"], source["rowCount"]), ("浙江省", None, 674))
            self.assertEqual((source["publishedAt"], source["asOf"]), (None, None))
            self.assertIn("仅含宁波、台州、杭州、衢州、绍兴五市", source["scope"])
            self.assertIn("浙江省数据开放平台", source["scope"])
            self.assertIn("2026-11-17下载", source["scope"])
            self.assertIn("数据开放授权许可使用协议约束", source["scope"])
            province = next(item for item in manifest["provinces"] if item["slug"] == "zhejiang")
            self.assertEqual({city["name"]: city["count"] for city in province["cities"]
                              if city["slug"] != "wenzhou"},
                             {"台州市": 108, "宁波市": 260, "衢州市": 52, "绍兴市": 37, "杭州市": 217})
            indexed = []
            for city in province["cities"]:
                data = json.loads((output / city["indexPath"]).read_text(encoding="utf-8"))
                indexed.extend(row for row in data["records"] if row["sourceId"] == source["id"])
            self.assertEqual(len(indexed), 674)
            self.assertEqual(indexed[0]["id"], "zj-prov-20260902-0001")
            self.assertEqual(indexed[-1]["id"], "zj-prov-20260902-1147")
            self.assertEqual(len({row["rowNumber"] for row in indexed}), 674)
            self.assertEqual(sum(row["address"] is None for row in indexed), 49)
            self.assertEqual(sum(row["beds"] is None for row in indexed), 0)
            self.assertTrue(all(row["name"] != "养老机构" for row in indexed))

    def test_taian_historical_file_adds_ninety_three_attributed_rows(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "public"
            run = self.run_builder(output)
            self.assertEqual(run.returncode, 0, run.stdout + run.stderr)
            manifest = json.loads((output / "manifest.v1.json").read_text(encoding="utf-8"))
            source = next(item for item in manifest["sources"] if item["id"] == "sd-taian-20250724")
            self.assertEqual((source["province"], source["city"], source["rowCount"]),
                             ("山东省", "泰安", 93))
            self.assertIn("2025-07-24 版本", source["scope"])
            self.assertIn("2026-08-01 版本仅10行", source["scope"])
            shandong = next(item for item in manifest["provinces"] if item["slug"] == "shandong")
            taian = next(item for item in shandong["cities"] if item["slug"] == "taian")
            self.assertEqual(taian["count"], 93)
            index = json.loads((output / taian["indexPath"]).read_text(encoding="utf-8"))
            self.assertEqual(len(index["records"]), 93)
            self.assertEqual(index["records"][0]["name"], "山东和圣园康养医疗有限公司")
            self.assertEqual(index["records"][-1]["name"], "新泰市放城镇敬老院")
            self.assertEqual({item["rowNumber"] for item in index["records"]}, set(range(1, 94)))
            self.assertTrue(all(item["beds"] is None for item in index["records"]))

    def test_jinan_historical_file_adds_135_attributed_rows(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "public"
            run = self.run_builder(output)
            self.assertEqual(run.returncode, 0, run.stdout + run.stderr)
            manifest = json.loads((output / "manifest.v1.json").read_text(encoding="utf-8"))
            source = next(item for item in manifest["sources"] if item["id"] == "sd-jinan-20250721")
            self.assertEqual((source["province"], source["city"], source["rowCount"]),
                             ("山东省", "济南", 135))
            self.assertEqual((source["publishedAt"], source["asOf"]), ("2023-08-21", None))
            self.assertIn("2023年08月至2024年05月", source["scope"])
            self.assertIn("2026-07-21版本仅20行", source["scope"])
            self.assertIn("不能据此推断其余机构停业", source["scope"])
            province = next(item for item in manifest["provinces"] if item["slug"] == "shandong")
            city = next(item for item in province["cities"] if item["slug"] == "jinan")
            self.assertEqual(city["count"], 135)
            index = json.loads((output / city["indexPath"]).read_text(encoding="utf-8"))
            self.assertEqual(len(index["records"]), 135)
            self.assertEqual(index["records"][0]["name"], "济南市社会福利院")
            self.assertEqual(index["records"][-1]["name"], "济阳县孙耿街道敬老院")
            self.assertEqual([item["rowNumber"] for item in index["records"]], list(range(1, 136)))
            self.assertTrue(all(item["address"] and isinstance(item["beds"], int)
                                for item in index["records"]))

    def test_weifang_2025_statistics_add_187_narrow_source_rows(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "public"
            run = self.run_builder(output)
            self.assertEqual(run.returncode, 0, run.stdout + run.stderr)
            manifest = json.loads((output / "manifest.v1.json").read_text(encoding="utf-8"))
            matches = [item for item in manifest["sources"] if item["id"] == "sd-weifang-20261110"]
            self.assertEqual(len(matches), 1)
            source = matches[0]
            self.assertEqual((source["province"], source["city"], source["rowCount"]),
                             ("山东省", "潍坊", 187))
            self.assertEqual((source["publishedAt"], source["asOf"]), ("2026-08-11", "2025-04-10"))
            self.assertIn("2025-04-10逐行统计时间", source["scope"])
            self.assertIn("不证明当前在营", source["scope"])
            city = next(city for province in manifest["provinces"] if province["slug"] == "shandong"
                        for city in province["cities"] if city["slug"] == "weifang")
            self.assertEqual(city["count"], 187)
            index = json.loads((output / city["indexPath"]).read_text(encoding="utf-8"))
            details = []
            for chunk_name in {record["chunk"] for record in index["records"]}:
                chunk = json.loads((output / "shandong" / "weifang" / chunk_name).read_text(encoding="utf-8"))
                details.extend(chunk["records"])
            self.assertEqual(len(index["records"]), 187)
            self.assertEqual(len(details), 187)
            self.assertEqual({row["rowNumber"] for row in index["records"]}, set(range(1, 188)))
            self.assertEqual(index["records"][0]["name"], "潍坊市潍城区康华老年会所")
            self.assertEqual(index["records"][-1]["name"], "潍坊峡山生态经济开发区绿康源养老康复中心")
            self.assertEqual(sum(row["beds"] for row in details), 31748)
            self.assertTrue(all(row["residentCount"] is None and row["staffCount"] is None
                                and row["services"] is None for row in details))

    def test_panzhihua_preview_adds_twenty_one_bed_threshold_rows(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "public"
            run = self.run_builder(output)
            self.assertEqual(run.returncode, 0, run.stdout + run.stderr)
            manifest = json.loads((output / "manifest.v1.json").read_text(encoding="utf-8"))
            source = next(item for item in manifest["sources"] if item["id"] == "sc-pzh-20260901")
            self.assertEqual((source["province"], source["city"], source["rowCount"]),
                             ("四川省", "攀枝花", 21))
            self.assertIn("床位数100张以上", source["scope"])
            self.assertIn("不代表全市全量或当前在营", source["scope"])
            sichuan = next(item for item in manifest["provinces"] if item["slug"] == "sichuan")
            city = next(item for item in sichuan["cities"] if item["slug"] == "panzhihua")
            self.assertEqual(city["count"], 21)
            index = json.loads((output / city["indexPath"]).read_text(encoding="utf-8"))
            detail = json.loads((output / "sichuan/panzhihua/chunk-001.v1.json").read_text(encoding="utf-8"))
            self.assertEqual(index["records"][0]["name"], "攀枝花市社会福利院")
            self.assertEqual(detail["records"][-1]["name"], "盐边县永兴镇敬老院")
            self.assertEqual((detail["records"][0]["beds"], detail["records"][-1]["beds"]), (170, 200))
            self.assertTrue(all(item["address"] is None and item["beds"] >= 100 for item in detail["records"]))

    def test_four_dazhou_county_previews_add_eighty_three_attributed_rows(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "public"
            run = self.run_builder(output)
            self.assertEqual(run.returncode, 0, run.stdout + run.stderr)
            manifest = json.loads((output / "manifest.v1.json").read_text(encoding="utf-8"))
            county_counts = {source.source_id: source.row_count for source in DAZHOU_COUNTY_SOURCES.values()}
            self.assertEqual({item["id"]: item["rowCount"] for item in manifest["sources"]
                              if item["id"] in county_counts}, county_counts)
            city = next(city for province in manifest["provinces"] if province["slug"] == "sichuan"
                        for city in province["cities"] if city["slug"] == "dazhou")
            self.assertEqual(city["count"], 113)
            index = json.loads((output / city["indexPath"]).read_text(encoding="utf-8"))
            self.assertEqual(len(index["records"]), 113)
            self.assertEqual({record["chunk"] for record in index["records"]},
                             {"chunk-001.v1.json", "chunk-002.v1.json"})
            for source in DAZHOU_COUNTY_SOURCES.values():
                published_source = next(item for item in manifest["sources"] if item["id"] == source.source_id)
                self.assertEqual((published_source["city"], published_source["publishedAt"],
                                  published_source["asOf"]), ("达州", source.published_at, None))
                self.assertIn("仅达州市" + source.county, published_source["scope"])
                self.assertIn("来源第N条按冻结预览位次", published_source["scope"])
                records = [row for row in index["records"] if row["sourceId"] == source.source_id]
                self.assertEqual(len(records), source.row_count)
                self.assertEqual({row["rowNumber"] for row in records}, set(range(1, source.row_count + 1)))
                self.assertTrue(all(row["name"] and row["address"] and row["beds"] is None for row in records))
            self.assertEqual(index["records"][-1]["id"], "sc-dz-kaijiang-20260722-0014")

    def test_real_sources_project_public_rows_without_contact_fields(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "public"
            run = self.run_builder(output)
            self.assertEqual(run.returncode, 0, run.stdout + run.stderr)
            manifest = json.loads((output / "manifest.v1.json").read_text(encoding="utf-8"))
            self.assertEqual(manifest["schemaVersion"], 1)
            self.assertEqual(manifest["rowCount"], 7719)
            self.assertEqual({source["id"]: source["rowCount"] for source in manifest["sources"]},
                             {"cq-mzj-20251222": 1725, "js-zjg-20261029": 20,
                              "fj-mzt-undated": 944, "hn-mzt-20260112": 1768,
                              "js-nj-20260310": 278, "hb-qj-20260615": 747,
                              "he-sjz-20260320": 268, "bj-mzj-20260210": 459,
                              "sc-ncgp-20250220": 36, "sc-dz-20260814": 30,
                              "sc-dz-xuanhan-20260722": 27, "sc-dz-wanyuan-20260722": 21,
                              "sc-dz-dazhu-20260722": 21, "sc-dz-kaijiang-20260722": 14,
                              "sc-pzh-20260901": 21,
                              "sd-hz-luxi-20250627": 23, "sd-taian-20250724": 93,
                              "sd-weifang-20261110": 187, "sd-jinan-20250721": 135,
                              "tj-nankai-20220411": 20,
                               "zj-prov-20260902": 674, "ah-sc-20261014": 12,
                               "zj-wz-20220826": 196})
            self.assertEqual({province["slug"] for province in manifest["provinces"]},
                             {"chongqing", "jiangsu", "fujian", "hunan", "hubei", "hebei", "beijing", "sichuan", "shandong", "tianjin", "zhejiang", "anhui"})
            fujian = next(source for source in manifest["sources"] if source["id"] == "fj-mzt-undated")
            self.assertIsNone(fujian["publishedAt"])
            self.assertIsNone(fujian["asOf"])
            self.assertIsNone(fujian["city"])
            fujian_region = next(province for province in manifest["provinces"] if province["slug"] == "fujian")
            self.assertEqual(fujian_region["cities"][0]["name"], "全省")
            hunan = next(source for source in manifest["sources"] if source["id"] == "hn-mzt-20260112")
            self.assertIsNone(hunan["city"])
            self.assertEqual((hunan["publishedAt"], hunan["asOf"]), ("2026-01-12", "2026-01-09"))
            hunan_region = next(province for province in manifest["provinces"] if province["slug"] == "hunan")
            self.assertEqual({city["name"]: city["count"] for city in hunan_region["cities"]}, CITY_COUNTS)
            self.assertEqual(len(hunan_region["cities"]), 14)
            jiangsu = next(province for province in manifest["provinces"] if province["slug"] == "jiangsu")
            self.assertEqual(jiangsu["count"], 298)
            self.assertEqual({city["name"]: city["count"] for city in jiangsu["cities"]}, {"苏州": 20, "南京": 278})
            nanjing = next(source for source in manifest["sources"] if source["id"] == "js-nj-20260310")
            self.assertEqual((nanjing["city"], nanjing["publishedAt"], nanjing["asOf"]),
                             ("南京", "2026-03-10", "2026年2月底"))
            hubei = next(source for source in manifest["sources"] if source["id"] == "hb-qj-20260615")
            self.assertEqual((hubei["province"], hubei["city"], hubei["publishedAt"], hubei["asOf"]),
                             ("湖北省", None, "2026-06-15", "2026年5月底"))
            self.assertIn("武汉都市圈", hubei["scope"])
            self.assertIn("不代表当前", hubei["scope"])
            hubei_region = next(province for province in manifest["provinces"] if province["slug"] == "hubei")
            self.assertEqual({city["name"]: city["count"] for city in hubei_region["cities"]}, HUBEI_CITY_COUNTS)
            self.assertEqual(len(hubei_region["cities"]), 9)
            shijiazhuang = next(source for source in manifest["sources"] if source["id"] == "he-sjz-20260320")
            self.assertEqual((shijiazhuang["province"], shijiazhuang["city"],
                              shijiazhuang["publishedAt"], shijiazhuang["asOf"]),
                             ("河北省", "石家庄", "2026-03-20", None))
            self.assertIn("265 个编号", shijiazhuang["scope"])
            self.assertIn("268 条", shijiazhuang["scope"])
            self.assertIn("2026-03-30", shijiazhuang["scope"])
            hebei_region = next(province for province in manifest["provinces"] if province["slug"] == "hebei")
            self.assertEqual(hebei_region["count"], 268)
            self.assertEqual([(city["slug"], city["name"], city["count"]) for city in hebei_region["cities"]],
                             [("shijiazhuang", "石家庄", 268)])
            beijing = next(source for source in manifest["sources"] if source["id"] == "bj-mzj-20260210")
            self.assertEqual((beijing["province"], beijing["city"], beijing["publishedAt"], beijing["asOf"]),
                             ("北京市", "北京", "2026-02-10", "2025-12-31"))
            self.assertIn("仅覆盖", beijing["scope"])
            self.assertIn("星级", beijing["scope"])
            beijing_region = next(province for province in manifest["provinces"] if province["slug"] == "beijing")
            self.assertEqual(beijing_region["count"], 459)
            self.assertEqual([(city["slug"], city["name"], city["count"]) for city in beijing_region["cities"]],
                             [("beijing", "北京", 459)])
            gaoping = next(source for source in manifest["sources"] if source["id"] == "sc-ncgp-20250220")
            self.assertEqual((gaoping["province"], gaoping["city"], gaoping["publishedAt"], gaoping["asOf"]),
                             ("四川省", "南充", "2025-02-20", None))
            self.assertIn("高坪区", gaoping["scope"])
            self.assertIn("不代表南充市", gaoping["scope"])
            sichuan_region = next(province for province in manifest["provinces"] if province["slug"] == "sichuan")
            self.assertEqual(sichuan_region["count"], 170)
            self.assertEqual([(city["slug"], city["name"], city["count"]) for city in sichuan_region["cities"]],
                             [("nanchong", "南充", 36), ("dazhou", "达州", 113),
                              ("panzhihua", "攀枝花", 21)])
            shandong_region = next(province for province in manifest["provinces"] if province["slug"] == "shandong")
            self.assertEqual(shandong_region["count"], 438)
            self.assertEqual([(city["slug"], city["name"], city["count"]) for city in shandong_region["cities"]],
                             [("heze", "菏泽", 23), ("taian", "泰安", 93), ("weifang", "潍坊", 187),
                              ("jinan", "济南", 135)])
            dazhou = next(source for source in manifest["sources"] if source["id"] == "sc-dz-20260814")
            self.assertEqual((dazhou["province"], dazhou["city"], dazhou["publishedAt"], dazhou["asOf"]),
                             ("四川省", "达州", "2024-01-10", None))
            self.assertIn("匿名预览仅30条", dazhou["scope"])

            indexed = []
            detailed = []
            for province in manifest["provinces"]:
                for city in province["cities"]:
                    index = json.loads((output / city["indexPath"]).read_text(encoding="utf-8"))
                    self.assertEqual(index["snapshotId"], manifest["snapshotId"])
                    self.assertEqual(index["provinceSlug"], province["slug"])
                    self.assertEqual(index["citySlug"], city["slug"])
                    self.assertEqual(len(index["records"]), city["count"])
                    indexed.extend(index["records"])
                    for chunk_name in {record["chunk"] for record in index["records"]}:
                        chunk = json.loads((output / province["slug"] / city["slug"] / chunk_name)
                                           .read_text(encoding="utf-8"))
                        self.assertEqual(chunk["snapshotId"], manifest["snapshotId"])
                        self.assertLessEqual(len(chunk["records"]), 100)
                        detailed.extend(chunk["records"])

            self.assertEqual(len(indexed), 7719)
            self.assertEqual(len(detailed), 7719)
            self.assertEqual(len({record["id"] for record in detailed}), 7719)
            self.assertEqual(len(list(output.rglob("*.json"))), 147)
            self.assertEqual(set(indexed[0]), {"id", "sourceId", "rowNumber", "name",
                                              "address", "beds", "chunk"})
            self.assertEqual(set(detailed[0]), {"id", "sourceId", "rowNumber", "name",
                                               "address", "beds", "residentCount",
                                               "staffCount", "services"})
            self.assertNotIn("phone", json.dumps(manifest) + json.dumps(indexed) + json.dumps(detailed))
            self.assertNotIn("0512-58111516", json.dumps(detailed))
            self.assertNotIn("15206200290", json.dumps(detailed))
            self.assertEqual(indexed[0]["name"], "重庆佳阖健康养老服务有限公司巴南分公司")
            self.assertEqual({record["rowNumber"] for record in indexed if record["sourceId"] == "hn-mzt-20260112"},
                             set(range(1, 1769)))
            by_id = {record["id"]: record for record in detailed}
            self.assertEqual(by_id["cq-mzj-20251222-0863"]["name"], "峨溶镇特困人员供养服务中心")
            self.assertEqual(by_id["cq-mzj-20251222-1725"]["name"], "兴云养老云福院")
            self.assertEqual(by_id["cq-mzj-20251222-0360"]["residentCount"], 440)
            self.assertEqual(by_id["cq-mzj-20251222-0294"]["beds"], 150)
            self.assertEqual(by_id["js-zjg-20261029-0011"]["name"], "张家港市康馨老年公寓有限公司")
            self.assertEqual(by_id["js-zjg-20261029-0020"]["name"], "张家港市桥头养老院有限公司")
            self.assertEqual(by_id["fj-mzt-undated-0001"]["name"], "安溪县龙门镇敬老院")
            self.assertEqual(by_id["fj-mzt-undated-0944"]["name"], "仙游县西苑乡敬老院")
            self.assertEqual(by_id["hn-mzt-20260112-0001"]["name"], "长沙阿默木槿健康养老服务有限公司")
            self.assertEqual(by_id["hn-mzt-20260112-0884"]["name"], "湘阴县樟树镇敬老院")
            self.assertEqual(by_id["hn-mzt-20260112-1768"]["name"], "龙山县农车镇敬老院")
            self.assertIsNone(by_id["hn-mzt-20260112-1234"]["address"])
            self.assertEqual(by_id["hn-mzt-20260112-0512"]["beds"], 0)
            self.assertEqual(by_id["js-nj-20260310-0001"]["name"], "南京市点将台社会福利院")
            self.assertEqual(by_id["js-nj-20260310-0139"]["name"], "南京常春藤养老服务有限公司下庙店")
            self.assertEqual(by_id["js-nj-20260310-0278"]["name"], "南京悦象养老院")
            self.assertEqual(by_id["hb-qj-20260615-0001"]["name"], "武汉市社会福利院")
            self.assertEqual(by_id["hb-qj-20260615-0374"]["name"], "湖北怡园村养老产业有限公司")
            self.assertEqual(by_id["hb-qj-20260615-0747"]["name"], "鄂州市中医医院医养结合中心")
            self.assertTrue(all(by_id[f"hb-qj-20260615-{row:04d}"]["beds"] is None
                                for row in range(1, 748)))
            self.assertEqual(by_id["he-sjz-20260320-0001"]["name"], "石家庄市养老院（一区）")
            self.assertEqual(by_id["he-sjz-20260320-0002"]["name"], "石家庄市养老院（ 二 区）")
            self.assertEqual(by_id["he-sjz-20260320-0155"]["name"], "井陉县中心敬老院（养护院区）")
            self.assertEqual(by_id["he-sjz-20260320-0155"]["address"], "井陉县微水镇微水村翠微街18号")
            self.assertEqual(by_id["he-sjz-20260320-0268"]["name"], "新乐市第一老年公寓")
            self.assertEqual(by_id["he-sjz-20260320-0268"]["address"], "新乐市长寿街道伏羲大街18号")
            self.assertTrue(all(by_id[f"he-sjz-20260320-{row:04d}"]["beds"] is None
                                for row in range(1, 269)))
            self.assertEqual(by_id["bj-mzj-20260210-0001"]["name"], "北京市第一社会福利院")
            self.assertEqual(by_id["bj-mzj-20260210-0229"]["name"], "北京市西城区广内善果养老照料中心")
            self.assertEqual(by_id["bj-mzj-20260210-0459"]["name"], "北京市平谷区古槐之家老年公寓")
            self.assertTrue(all(by_id[f"bj-mzj-20260210-{row:04d}"]["address"] is None
                                and by_id[f"bj-mzj-20260210-{row:04d}"]["beds"] is None
                                and by_id[f"bj-mzj-20260210-{row:04d}"]["services"] is None
                                for row in range(1, 460)))
            self.assertEqual(by_id["sc-ncgp-20250220-0001"]["name"], "南充市高坪区鹤鸣山老年养护健康管理有限公司（中央厨房）")
            self.assertEqual(by_id["sc-ncgp-20250220-0018"]["name"], "四川孝心壹号养老服务有限公司")
            self.assertEqual(by_id["sc-ncgp-20250220-0036"]["name"], "南充沐之爱养老服务有限公司")
            self.assertTrue(all(by_id[f"sc-ncgp-20250220-{row:04d}"][field] is None
                                for row in range(1, 37)
                                for field in ("address", "beds", "residentCount", "staffCount", "services")))
            self.assertEqual(by_id["sc-dz-20260814-0001"]["name"], "达州德源养老服务有限公司")
            self.assertEqual(by_id["sc-dz-20260814-0015"]["name"], "达州市通川区磐石敬老院")
            self.assertEqual(by_id["sc-dz-20260814-0030"]["name"], "达州市达川区赵家镇敬老院")
            self.assertEqual(by_id["sc-dz-20260814-0001"]["beds"], 200)
            self.assertIsNone(by_id["sc-dz-20260814-0020"]["beds"])
            self.assertTrue(all(by_id[f"sc-dz-20260814-{row:04d}"][field] is None
                                for row in range(1, 31)
                                for field in ("residentCount", "staffCount", "services")))
            self.assertTrue(all(by_id[f"fj-mzt-undated-{row:04d}"]["beds"] is None
                                for row in range(1, 945)))
            self.assertEqual(sum(record["beds"] is None for record in detailed), 2702)
            self.assertEqual(sum(record["address"] is None for record in detailed), 764)
            self.assertEqual(sum(record["beds"] == 0 for record in detailed), 6)
            self.assertTrue(all(by_id[f"js-zjg-20261029-{row:04d}"]["services"] is None
                                for row in range(1, 21)))
            published = json.dumps(manifest, ensure_ascii=False) + json.dumps(indexed, ensure_ascii=False) + json.dumps(detailed, ensure_ascii=False)
            self.assertNotIn("frfzrxm", published)
            self.assertNotIn("025-69518399", published)
            self.assertNotIn("58498208", published)
            hubei_html = html.fromstring((SOURCE_DIR / "hubei-wuhancircle-202605.html").read_bytes().decode("utf-8"))
            hubei_first = hubei_html.xpath("//table//tr")[2].xpath("./th|./td")
            private_contact = [" ".join(" ".join(cell.itertext()).split()) for cell in hubei_first[4:]]
            self.assertTrue(all(contact and contact not in published for contact in private_contact))
            pdf_tables = extract_shijiazhuang_tables(PDF_PATH.read_bytes())
            private_pdf_phones = [row[1] for page_number, table in enumerate(pdf_tables[7:])
                                  for row in (table[1:] if page_number == 0 else table)]
            self.assertEqual(len(private_pdf_phones), 268)
            self.assertTrue(all(phone and phone not in published for phone in private_pdf_phones))
            self.assertEqual(self.run_builder(output, check=True).returncode, 0)

    def test_check_detects_modified_output_without_rewriting_it(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "public"
            self.assertEqual(self.run_builder(output).returncode, 0)
            target = output / "manifest.v1.json"
            target.write_bytes(target.read_bytes() + b" ")
            before = target.read_bytes()
            run = self.run_builder(output, check=True)
            self.assertNotEqual(run.returncode, 0)
            self.assertIn("public projection differs", run.stderr)
            self.assertEqual(target.read_bytes(), before)

    def test_rejects_html_hash_drift_before_writing(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source_dir = root / "raw"
            source_dir.mkdir()
            for original in SOURCE_DIR.glob("*.html"):
                shutil.copyfile(original, source_dir / original.name)
            changed = source_dir / "chongqing-20251222.html"
            changed.write_bytes(changed.read_bytes() + b"changed")
            output = root / "public"
            run = self.run_builder(output, source_dir=source_dir)
            self.assertNotEqual(run.returncode, 0)
            self.assertIn("SHA-256 changed", run.stderr)
            self.assertFalse(output.exists())

    def test_rejects_changed_headers_and_missing_rows_even_with_updated_hash(self):
        def changed_header(raw):
            document = html.fromstring(raw.decode("utf-8"))
            document.xpath("//table//tr")[0].xpath("./th|./td")[0].text = "编号"
            return html.tostring(document, encoding="utf-8")

        def missing_row(raw):
            document = html.fromstring(raw.decode("utf-8"))
            last = document.xpath("//table//tr")[-1]
            last.getparent().remove(last)
            return html.tostring(document, encoding="utf-8")

        def broken_serial(raw):
            document = html.fromstring(raw.decode("utf-8"))
            document.xpath("//table//tr")[1].xpath("./th|./td")[0].text = "2"
            return html.tostring(document, encoding="utf-8")

        def broken_beds(raw):
            document = html.fromstring(raw.decode("utf-8"))
            document.xpath("//table//tr")[1].xpath("./th|./td")[5].text = "unknown"
            return html.tostring(document, encoding="utf-8")

        for mutate, expected in [(changed_header, "headers changed"), (missing_row, "expected 1725 rows"),
                                 (broken_serial, "source serial is 2"), (broken_beds, "invalid beds")]:
            with self.subTest(expected=expected), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                source_dir, manifest = self.changed_source(root, "cq-mzj-20251222", mutate)
                output = root / "public"
                run = self.run_builder(output, source_dir=source_dir, source_manifest=manifest)
                self.assertNotEqual(run.returncode, 0)
                self.assertIn(expected, run.stderr)
                self.assertFalse(output.exists())

    def test_rejects_contact_added_to_published_field(self):
        def with_contact(raw):
            document = html.fromstring(raw.decode("utf-8"))
            name = document.xpath("//table//tr")[1].xpath("./th|./td")[1]
            name.text = "张家港市社会福利服务中心 13800138000"
            return html.tostring(document, encoding="utf-8")

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source_dir, manifest = self.changed_source(root, "js-zjg-20261029", with_contact)
            output = root / "public"
            run = self.run_builder(output, source_dir=source_dir, source_manifest=manifest)
            self.assertNotEqual(run.returncode, 0)
            self.assertIn("contact data in name", run.stderr)
            self.assertFalse(output.exists())

    def test_rejects_hubei_source_lock_drift(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            manifest = json.loads(SOURCE_MANIFEST.read_text(encoding="utf-8"))
            hubei = next(source for source in manifest["sources"] if source["id"] == "hb-qj-20260615")
            hubei["rowCount"] -= 1
            changed_manifest = root / "source-manifest.json"
            changed_manifest.write_text(json.dumps(manifest, ensure_ascii=False), encoding="utf-8")
            output = root / "public"
            run = self.run_builder(output, source_manifest=changed_manifest)
            self.assertNotEqual(run.returncode, 0)
            self.assertIn("Hubei source lock differs", run.stderr)
            self.assertFalse(output.exists())

    def test_rejects_shijiazhuang_pdf_lock_drift(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            manifest = json.loads(SOURCE_MANIFEST.read_text(encoding="utf-8"))
            source = next(item for item in manifest["sources"] if item["id"] == "he-sjz-20260320")
            source["rowCount"] -= 1
            changed_manifest = root / "source-manifest.json"
            changed_manifest.write_text(json.dumps(manifest, ensure_ascii=False), encoding="utf-8")
            output = root / "public"
            run = self.run_builder(output, source_manifest=changed_manifest)
            self.assertNotEqual(run.returncode, 0)
            self.assertIn("Shijiazhuang source lock differs", run.stderr)
            self.assertFalse(output.exists())

    def test_rejects_gaoping_workbook_lock_or_companion_page_drift(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            manifest = json.loads(SOURCE_MANIFEST.read_text(encoding="utf-8"))
            source = next(item for item in manifest["sources"] if item["id"] == "sc-ncgp-20250220")
            source["rowCount"] -= 1
            changed_manifest = root / "source-manifest.json"
            changed_manifest.write_text(json.dumps(manifest, ensure_ascii=False), encoding="utf-8")
            output = root / "public"
            run = self.run_builder(output, source_manifest=changed_manifest)
            self.assertNotEqual(run.returncode, 0)
            self.assertIn("Gaoping source lock differs", run.stderr)
            self.assertFalse(output.exists())

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source_dir = root / "raw"
            source_dir.mkdir()
            manifest = json.loads(SOURCE_MANIFEST.read_text(encoding="utf-8"))
            for source in manifest["sources"]:
                shutil.copyfile(SOURCE_DIR / source["filename"], source_dir / source["filename"])
            shutil.copyfile(SOURCE_DIR / "beijing-stars-20260210.html",
                            source_dir / "beijing-stars-20260210.html")
            companion = source_dir / "gaoping-202502-page.html"
            companion.write_bytes((SOURCE_DIR / companion.name).read_bytes() + b"changed")
            output = root / "public"
            run = self.run_builder(output, source_dir=source_dir)
            self.assertNotEqual(run.returncode, 0)
            self.assertIn("Gaoping source page size or SHA-256 changed", run.stderr)
            self.assertFalse(output.exists())

    def test_rejects_beijing_document_lock_or_companion_page_drift(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            manifest = json.loads(SOURCE_MANIFEST.read_text(encoding="utf-8"))
            source = next(item for item in manifest["sources"] if item["id"] == "bj-mzj-20260210")
            source["rowCount"] -= 1
            changed_manifest = root / "source-manifest.json"
            changed_manifest.write_text(json.dumps(manifest, ensure_ascii=False), encoding="utf-8")
            output = root / "public"
            run = self.run_builder(output, source_manifest=changed_manifest)
            self.assertNotEqual(run.returncode, 0)
            self.assertIn("Beijing source lock differs", run.stderr)
            self.assertFalse(output.exists())

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source_dir = root / "raw"
            source_dir.mkdir()
            manifest = json.loads(SOURCE_MANIFEST.read_text(encoding="utf-8"))
            for source in manifest["sources"]:
                shutil.copyfile(SOURCE_DIR / source["filename"], source_dir / source["filename"])
            shutil.copyfile(SOURCE_DIR / "gaoping-202502-page.html",
                            source_dir / "gaoping-202502-page.html")
            companion = source_dir / "beijing-stars-20260210.html"
            companion.write_bytes((SOURCE_DIR / companion.name).read_bytes() + b"changed")
            output = root / "public"
            run = self.run_builder(output, source_dir=source_dir)
            self.assertNotEqual(run.returncode, 0)
            self.assertIn("Beijing page size or SHA-256 changed", run.stderr)
            self.assertFalse(output.exists())

    def test_fujian_source_rejects_placeholder_or_missing_row(self):
        def changed_placeholder(raw):
            document = html.fromstring(raw.decode("utf-8"))
            document.xpath("//table")[0].xpath(".//tr")[1].xpath("./th|./td")[0].text = "已更新"
            return html.tostring(document, encoding="utf-8")

        def missing_row(raw):
            document = html.fromstring(raw.decode("utf-8"))
            last = document.xpath("//table")[0].xpath(".//tr")[-1]
            last.getparent().remove(last)
            return html.tostring(document, encoding="utf-8")

        for mutate, expected in [(changed_placeholder, "placeholder"),
                                 (missing_row, "expected 944 rows")]:
            with self.subTest(expected=expected), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                source_dir, manifest = self.changed_source(root, "fj-mzt-undated", mutate)
                output = root / "public"
                run = self.run_builder(output, source_dir=source_dir, source_manifest=manifest)
                self.assertNotEqual(run.returncode, 0)
                self.assertIn(expected, run.stderr)
                self.assertFalse(output.exists())


if __name__ == "__main__":
    unittest.main()
