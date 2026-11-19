"""Exact-name candidate links between a QCC source sheet and public official rows."""

from __future__ import annotations

import hashlib
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts/build-qcc-institution-links.py"


def links_module():
    assert SCRIPT.is_file(), "institution links generator is missing"
    spec = importlib.util.spec_from_file_location("qcc_institution_links", SCRIPT)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def short_sha(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:12]


def write_json(path: Path, data: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")


class Fixture:
    def __init__(self, root: Path):
        self.ref = root / "reference"
        self.official = root / "official"
        self.guangdong = root / "guangdong.json"
        self.output = root / "output"
        self.ref_sha = "a" * 64
        self.gd_p = "p-" + short_sha("广东省")
        self.gd_c = "c-" + short_sha("广东省|广州市")
        self.cq_p = "p-" + short_sha("重庆市")
        self.cq_c = "c-" + short_sha("重庆市|重庆市")
        self.reference_manifest = {
            "schemaVersion": 1, "snapshotId": "v1-reference", "receivedAt": "2026-11-17",
            "rowCount": 3, "source": {"title": "企查查养老机构信息表", "sha256": self.ref_sha, "asOf": None},
            "provinces": [
                {"slug": self.gd_p, "name": "广东省", "count": 2, "cities": [
                    {"slug": self.gd_c, "name": "广州市", "count": 2,
                     "indexPath": self.gd_p + "/" + self.gd_c + "/index.v1.json"}]},
                {"slug": self.cq_p, "name": "重庆市", "count": 1, "cities": [
                    {"slug": self.cq_c, "name": "重庆市", "count": 1,
                     "indexPath": self.cq_p + "/" + self.cq_c + "/index.v1.json"}]},
            ],
        }
        write_json(self.ref / "manifest.v1.json", self.reference_manifest)
        for p, c, records in (
            (self.gd_p, self.gd_c, [(2, "广东同名养老中心"), (3, "广东不同名养老中心")]),
            (self.cq_p, self.cq_c, [(4, "重庆同名养老中心")]),
        ):
            write_json(self.ref / p / c / "index.v1.json", {
                "schemaVersion": 1, "snapshotId": "v1-reference",
                "provinceSlug": p, "citySlug": c,
                "records": [
                    {"id": "qi-" + self.ref_sha[:12] + "-" + str(n), "sourceRow": n,
                     "name": name, "region": "广东省广州市" if p == self.gd_p else "重庆市",
                     "address": None, "beds": 0, "chunk": "chunk-001.v1.json"}
                    for n, name in records
                ],
            })
        self.official_manifest = {
            "schemaVersion": 1, "snapshotId": "v1-official", "archivedAt": "2026-11-17",
            "rowCount": 2, "sources": [{"id": "cq-source", "province": "重庆市", "city": "重庆",
                                       "scope": "重庆", "title": "重庆官方养老表", "url": "https://example.cn",
                                       "publishedAt": None, "asOf": None, "sha256": "b" * 64, "rowCount": 2}],
            "provinces": [{"slug": "chongqing", "name": "重庆市", "count": 2,
                           "cities": [{"slug": "chongqing", "name": "重庆", "count": 2,
                                       "indexPath": "chongqing/chongqing/index.v1.json"}]}],
        }
        write_json(self.official / "manifest.v1.json", self.official_manifest)
        write_json(self.official / "chongqing/chongqing/index.v1.json", {
            "schemaVersion": 1, "snapshotId": "v1-official",
            "provinceSlug": "chongqing", "citySlug": "chongqing",
            "records": [
                {"id": "cq-source-1", "sourceId": "cq-source", "rowNumber": 1,
                 "name": "重庆同名养老中心", "address": None, "beds": None,
                 "chunk": "chunk-001.v1.json"},
                {"id": "cq-source-2", "sourceId": "cq-source", "rowNumber": 2,
                 "name": "重庆同名养老中心", "address": None, "beds": None,
                 "chunk": "chunk-001.v1.json"},
            ],
        })
        self.guangdong_data = {
            "schemaVersion": 1, "snapshotId": "v1-guangdong", "archivedAt": "2026-11-17",
            "records": [
                {"id": "gd-src-1", "city": "广州", "name": "广东同名养老中心",
                 "evidenceType": "官方名录", "sourceUrl": "https://example.cn/gd",
                 "sourcePublishedAt": None, "sourceAsOf": None, "sourceStatusNote": None},
                {"id": "gd-src-2", "city": "广州", "name": "重庆同名养老中心",
                 "evidenceType": "官方名录", "sourceUrl": "https://example.cn/gd",
                 "sourcePublishedAt": None, "sourceAsOf": None, "sourceStatusNote": None},
            ],
        }
        write_json(self.guangdong, self.guangdong_data)


class InstitutionLinksTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.fixture = Fixture(Path(self.temp.name))
        self.module = links_module()

    def tearDown(self):
        self.temp.cleanup()

    def test_exact_province_name_link_keeps_all_official_rows(self):
        f = self.fixture
        outputs = self.module.build(f.ref, f.official, f.guangdong)
        manifest = json.loads(outputs["manifest.v1.json"])
        self.assertEqual((manifest["linkedReferenceCount"], manifest["matchCount"], manifest["regionCount"]),
                         (2, 3, 2))
        gd = json.loads(outputs[f.gd_p + "/" + f.gd_c + "/links.v1.json"])
        cq = json.loads(outputs[f.cq_p + "/" + f.cq_c + "/links.v1.json"])
        self.assertEqual([x["referenceId"] for x in gd["links"]], ["qi-" + f.ref_sha[:12] + "-2"])
        self.assertEqual([x["kind"] for x in gd["links"][0]["matches"]], ["guangdongOfficial"])
        self.assertEqual([x["id"] for x in cq["links"][0]["matches"]], ["cq-source-1", "cq-source-2"])
        self.assertTrue(all(x["kind"] == "nationalOfficial" for x in cq["links"][0]["matches"]))
        self.assertEqual(len(outputs), 3)

    def test_unmatched_region_still_has_an_empty_file(self):
        f = self.fixture
        f.guangdong_data["records"][0]["name"] = "另一个名称"
        write_json(f.guangdong, f.guangdong_data)
        outputs = self.module.build(f.ref, f.official, f.guangdong)
        gd = json.loads(outputs[f.gd_p + "/" + f.gd_c + "/links.v1.json"])
        self.assertEqual(gd["links"], [])
        self.assertEqual(json.loads(outputs["manifest.v1.json"])["linkedReferenceCount"], 1)

    def test_bad_source_snapshot_or_missing_index_fails(self):
        f = self.fixture
        index = f.ref / f.gd_p / f.gd_c / "index.v1.json"
        data = json.loads(index.read_text(encoding="utf-8"))
        data["snapshotId"] = "another"
        write_json(index, data)
        with self.assertRaisesRegex(ValueError, "snapshot|快照"):
            self.module.build(f.ref, f.official, f.guangdong)
        data["snapshotId"] = "v1-reference"
        write_json(index, data)
        (f.official / "chongqing/chongqing/index.v1.json").unlink()
        with self.assertRaisesRegex(ValueError, "missing|缺失"):
            self.module.build(f.ref, f.official, f.guangdong)

    def test_check_rejects_tampered_or_extra_output(self):
        f = self.fixture
        outputs = self.module.build(f.ref, f.official, f.guangdong)
        self.module.write_outputs(outputs, f.output, check=False)
        self.module.write_outputs(outputs, f.output, check=True)
        link = f.output / f.gd_p / f.gd_c / "links.v1.json"
        link.write_text('{"bad":true}', encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "differs|不一致"):
            self.module.write_outputs(outputs, f.output, check=True)
        self.module.write_outputs(outputs, f.output, check=False)
        extra = f.output / "unexpected.json"
        extra.write_text("{}", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "set|文件"):
            self.module.write_outputs(outputs, f.output, check=True)


if __name__ == "__main__":
    unittest.main()
