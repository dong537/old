"""Behavioral tests for the authorized, dated QCC institution-source export."""

from __future__ import annotations

import hashlib
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

from openpyxl import Workbook


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts/build-qcc-institutions.py"
HEADERS = (
    "统一社会信用代码", "地址", "行政区划代码", "机构名称", "地区", "床位数",
    "省份", "城市", "区县", "经度", "纬度",
)
VALID_CODE = "91441900MA4WJE2B8X"


def projection():
    assert SCRIPT.is_file(), "QCC institution projection script is missing"
    spec = importlib.util.spec_from_file_location("build_qcc_institutions", SCRIPT)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def row(**overrides):
    value = dict.fromkeys(HEADERS)
    value.update({
        "统一社会信用代码": VALID_CODE,
        "地址": "广州市海珠区新港路1号",
        "行政区划代码": "440105000000",
        "机构名称": "海珠养老中心",
        "地区": "广东省广州市海珠区",
        "床位数": 37,
        "省份": "河南省",  # Deliberately conflicts with the reliable division/area pair.
        "城市": "郑州市", "区县": "中原区",
        "经度": 113.123, "纬度": 23.123,
    })
    value.update(overrides)
    return value


def fixture(rows, *, headers=HEADERS, locked_rows=None):
    temp = tempfile.TemporaryDirectory()
    source_dir = Path(temp.name)
    path = source_dir / "sample.xlsx"
    book = Workbook()
    sheet = book.active
    sheet.append(list(headers))
    for values in rows:
        sheet.append([values.get(header) for header in headers])
    book.save(path)
    raw = path.read_bytes()
    manifest = {
        "schemaVersion": 1, "filename": path.name,
        "sha256": hashlib.sha256(raw).hexdigest(), "bytes": len(raw),
        "rowCount": len(rows) if locked_rows is None else locked_rows,
    }
    manifest_path = source_dir / "source-manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False), encoding="utf-8")
    return temp, path, manifest_path


def decode(outputs, suffix):
    matches = [json.loads(raw) for name, raw in outputs.items() if name.endswith(suffix)]
    return matches


class QccInstitutionProjectionTests(unittest.TestCase):
    def build_fixture(self, rows, **kwargs):
        module = projection()
        temp, path, manifest = fixture(rows, **kwargs)
        self.addCleanup(temp.cleanup)
        return module, path, manifest

    def test_source_rows_keep_identity_and_separate_enriched_location(self):
        module, path, manifest = self.build_fixture([row(), row()])
        outputs, audit = module.build(path, manifest)
        public_manifest = json.loads(outputs["manifest.v1.json"])
        self.assertEqual(set(public_manifest), {
            "schemaVersion", "snapshotId", "receivedAt", "rowCount", "source", "provinces",
        })
        self.assertEqual(public_manifest["rowCount"], 2)
        self.assertEqual(public_manifest["source"], {
            "title": "企查查养老机构信息表（用户提供）",
            "sha256": json.loads(manifest.read_text(encoding="utf-8"))["sha256"],
            "asOf": None,
        })
        self.assertEqual([p["name"] for p in public_manifest["provinces"]], ["广东省"])
        self.assertEqual([c["name"] for c in public_manifest["provinces"][0]["cities"]], ["广州市"])
        self.assertEqual(public_manifest["provinces"][0]["slug"],
                         "p-" + hashlib.sha256("广东省".encode()).hexdigest()[:12])
        self.assertEqual(public_manifest["provinces"][0]["cities"][0]["slug"],
                         "c-" + hashlib.sha256("广东省|广州市".encode()).hexdigest()[:12])
        indexes = decode(outputs, "index.v1.json")
        self.assertEqual(len(indexes), 1)
        self.assertEqual([r["sourceRow"] for r in indexes[0]["records"]], [2, 3])
        source_sha = json.loads(manifest.read_text(encoding="utf-8"))["sha256"]
        self.assertEqual(indexes[0]["records"][0]["id"], f"qi-{source_sha[:12]}-2")
        self.assertNotEqual(indexes[0]["records"][0]["id"], indexes[0]["records"][1]["id"])
        self.assertEqual(set(indexes[0]["records"][0]), {
            "id", "sourceRow", "name", "region", "address", "beds", "chunk",
        })
        chunks = decode(outputs, "chunk-001.v1.json")
        self.assertEqual(len(chunks), 1)
        self.assertEqual(set(chunks[0]["records"][0]), {
            "id", "sourceRow", "name", "region", "address", "beds", "creditCode", "codeStatus", "sourceFields",
        })
        self.assertEqual(chunks[0]["records"][0]["creditCode"], VALID_CODE)
        self.assertEqual(chunks[0]["records"][0]["sourceFields"], row())
        all_public = b"".join(outputs.values()).decode("utf-8")
        self.assertNotIn("sample.xlsx", all_public)
        self.assertNotIn("sourceFields", json.dumps(indexes, ensure_ascii=False))
        self.assertEqual(audit["enrichedProvinceConflictCount"], 2)

    def test_redaction_policy_changes_snapshot_id_when_source_is_unchanged(self):
        module, path, manifest = self.build_fixture([row()])
        outputs, _ = module.build(path, manifest)
        snapshot = json.loads(outputs["manifest.v1.json"])["snapshotId"]
        source_only_seed = module.json_bytes(json.loads(manifest.read_text(encoding="utf-8")))
        old_snapshot = "v1-" + hashlib.sha256(source_only_seed).hexdigest()[:16]
        self.assertNotEqual(snapshot, old_snapshot)
        self.assertEqual(snapshot, json.loads(module.build(path, manifest)[0]["manifest.v1.json"])["snapshotId"])

    def test_invalid_codes_stay_raw_only_and_zero_beds_are_real(self):
        invalid = VALID_CODE[:-1] + "0"
        module, path, manifest = self.build_fixture([
            row(**{"统一社会信用代码": "000000000000000000", "床位数": 0}),
            row(**{"统一社会信用代码": None, "地址": None}),
            row(**{"统一社会信用代码": invalid}),
            row(**{"统一社会信用代码": "NOT_A_CREDIT_CODE"}),
        ])
        outputs, audit = module.build(path, manifest)
        details = decode(outputs, "chunk-001.v1.json")[0]["records"]
        self.assertEqual([r["codeStatus"] for r in details],
                         ["placeholder", "missing", "invalid", "invalid"])
        self.assertTrue(all(r["creditCode"] is None for r in details))
        self.assertEqual(details[0]["beds"], 0)
        self.assertIsNone(details[1]["address"])
        self.assertEqual([r["sourceFields"]["统一社会信用代码"] for r in details],
                         ["000000000000000000", None, invalid, "NOT_A_CREDIT_CODE"])
        self.assertEqual(audit["codeStatusCounts"], {
            "valid": 0, "missing": 1, "placeholder": 1, "invalid": 2,
        })

    def test_source_fields_keep_non_contact_values_but_redact_contact_address(self):
        raw = row(**{
            "统一社会信用代码": " NOT-A-CODE ",
            "地址": "广州市海珠区新港路1号 电话 020 12345678",
            "省份": "海南省", "城市": "三沙市", "区县": "南沙区",
            "经度": 114.125, "纬度": 22.625,
        })
        module, path, manifest = self.build_fixture([raw])
        outputs, _ = module.build(path, manifest)
        detail = decode(outputs, "chunk-001.v1.json")[0]["records"][0]
        self.assertEqual(set(detail["sourceFields"]), set(HEADERS))
        self.assertEqual(detail["sourceFields"], {**raw, "地址": "[已遮蔽]"})
        self.assertEqual(detail["creditCode"], None)
        self.assertEqual(detail["codeStatus"], "invalid")
        indexes = decode(outputs, "index.v1.json")[0]["records"]
        self.assertEqual(indexes[0]["region"], raw["地区"])
        self.assertEqual(indexes[0]["address"], None)

    def test_source_fields_preserve_primitive_values_without_normalizing(self):
        module = projection()
        for value in ("-", "", None, 0, "0", "  原值  "):
            with self.subTest(value=value):
                raw = row(**{"省份": value})
                detail = module.project_row(2, raw, "a" * 64, 1)[3]
                self.assertEqual(detail["sourceFields"], raw)
        for value in (True, {}, [], float("nan"), float("inf")):
            with self.subTest(value=value):
                with self.assertRaisesRegex(ValueError, "invalid raw field"):
                    module.project_row(2, row(**{"经度": value}), "a" * 64, 1)

    def test_contact_like_addresses_are_redacted_from_normalized_and_raw_fields(self):
        module, path, manifest = self.build_fixture([
            row(**{"地址": "020-12345678"}),
            row(**{"地址": "广州市新港路1号，电话 020 12345678"}),
            row(**{"地址": "广州路1号 13800138000"}),
            row(**{"地址": "联系养老@example.com"}),
            row(**{"地址": "请拨１３８００１３８０００"}),
            row(**{"地址": None}),
        ])
        outputs, audit = module.build(path, manifest)
        indexes = decode(outputs, "index.v1.json")[0]["records"]
        details = decode(outputs, "chunk-001.v1.json")[0]["records"]
        self.assertTrue(all(record["address"] is None for record in indexes + details))
        self.assertEqual(audit["redactedAddressCount"], 5)
        self.assertEqual(audit["missingAddressCount"], 6)
        self.assertEqual([r["sourceFields"]["地址"] for r in details], [
            "[已遮蔽]", "[已遮蔽]", "[已遮蔽]", "[已遮蔽]", "[已遮蔽]", None,
        ])

    def test_empty_and_placeholder_source_addresses_are_preserved(self):
        module = projection()
        for value in (None, "", "-", "0", "  "):
            with self.subTest(value=value):
                detail = module.project_row(2, row(**{"地址": value}), "a" * 64, 1)[3]
                self.assertEqual(detail["sourceFields"]["地址"], value)

    def test_contact_in_supplemental_geography_is_masked_without_changing_region(self):
        module = projection()
        source = row(**{
            "省份": "河南省 联系 13800138000",
            "城市": "联系 hi@example.com",
            "区县": "电话 020-12345678",
        })
        _, _, index, detail, _, _ = module.project_row(2, source, "a" * 64, 1)
        self.assertEqual(index["region"], source["地区"])
        self.assertEqual(detail["sourceFields"], {
            **source, "省份": "[已遮蔽]", "城市": "[已遮蔽]", "区县": "[已遮蔽]",
        })

    def test_numeric_contacts_in_free_text_are_masked_without_masking_numbers(self):
        module = projection()
        for value in (13800138000, 13800138000.0):
            with self.subTest(value=value):
                source = row(**{
                    "地址": value, "省份": value, "城市": value, "区县": value,
                    "统一社会信用代码": value, "床位数": 13800138000,
                    "经度": value, "纬度": value,
                })
                _, _, index, detail, redacted, _ = module.project_row(
                    2, source, "a" * 64, 1)
                self.assertIsNone(index["address"])
                self.assertIsNone(detail["address"])
                self.assertTrue(redacted)
                for field in ("地址", "省份", "城市", "区县"):
                    self.assertEqual(detail["sourceFields"][field], "[已遮蔽]")
                for field in ("统一社会信用代码", "床位数", "经度", "纬度"):
                    self.assertEqual(detail["sourceFields"][field], source[field])
        with self.assertRaisesRegex(ValueError, "invalid address"):
            module.project_row(2, row(**{"地址": 37}), "a" * 64, 1)

    def test_address_identical_to_name_is_not_published_as_a_location(self):
        module, path, manifest = self.build_fixture([
            row(**{"地址": "海珠养老中心"}),
            row(**{"地址": "  海珠养老中心  "}),
            row(**{"地址": "广州市海珠区新港路1号"}),
        ])
        outputs, audit = module.build(path, manifest)
        indexes = decode(outputs, "index.v1.json")[0]["records"]
        details = decode(outputs, "chunk-001.v1.json")[0]["records"]
        self.assertEqual([r["address"] for r in indexes],
                         [None, None, "广州市海珠区新港路1号"])
        self.assertEqual([r["address"] for r in details],
                         [None, None, "广州市海珠区新港路1号"])
        self.assertEqual(audit["addressEqualsNameCount"], 2)
        self.assertEqual(audit["missingAddressCount"], 2)

    def test_lowercase_credit_code_is_normalized_before_checksum(self):
        module, path, manifest = self.build_fixture([
            row(**{"统一社会信用代码": VALID_CODE.lower()}),
        ])
        outputs, audit = module.build(path, manifest)
        detail = decode(outputs, "chunk-001.v1.json")[0]["records"][0]
        self.assertEqual(detail["creditCode"], VALID_CODE)
        self.assertEqual(detail["codeStatus"], "valid")
        self.assertEqual(audit["codeStatusCounts"]["valid"], 1)

    def test_region_must_agree_with_division_code(self):
        module, path, manifest = self.build_fixture([
            row(**{"行政区划代码": "110105000000"}),
        ])
        with self.assertRaisesRegex(ValueError, "region.*division|division.*region"):
            module.build(path, manifest)

    def test_source_hash_header_row_count_and_beds_are_locked(self):
        module, path, manifest = self.build_fixture([row()])
        locked = json.loads(manifest.read_text(encoding="utf-8"))
        locked["sha256"] = "0" * 64
        manifest.write_text(json.dumps(locked), encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "hash"):
            module.build(path, manifest)
        temp, other, other_manifest = fixture([row()], locked_rows=2)
        self.addCleanup(temp.cleanup)
        with self.assertRaisesRegex(ValueError, "row count"):
            module.build(other, other_manifest)
        temp, other, other_manifest = fixture([row()], headers=HEADERS[:-1])
        self.addCleanup(temp.cleanup)
        with self.assertRaisesRegex(ValueError, "headers"):
            module.build(other, other_manifest)
        temp, other, other_manifest = fixture([row(**{"床位数": "-1"})])
        self.addCleanup(temp.cleanup)
        with self.assertRaisesRegex(ValueError, "beds"):
            module.build(other, other_manifest)

    def test_bingtuan_and_special_city_groups_and_chunk_links(self):
        rows = [row(**{
            "行政区划代码": "660100000000", "地区": "新疆生产建设兵团第一师阿拉尔市",
            "机构名称": f"兵团养老中心{i}",
        }) for i in range(102)]
        rows += [row(**{
            "行政区划代码": "139921000000", "地区": "河北省雄安新区容城县",
            "机构名称": "雄安养老院",
        })]
        module, path, manifest = self.build_fixture(rows)
        outputs, _ = module.build(path, manifest)
        public_manifest = json.loads(outputs["manifest.v1.json"])
        groups = [(p["name"], [(c["name"], c["count"], c["indexPath"]) for c in p["cities"]])
                  for p in public_manifest["provinces"]]
        self.assertEqual([(p, [(c, n) for c, n, _ in cs]) for p, cs in groups], [
            ("新疆维吾尔自治区", [("新疆生产建设兵团", 102)]),
            ("河北省", [("雄安新区", 1)]),
        ])
        index_path = groups[0][1][0][2]
        index = json.loads(outputs[index_path])
        self.assertEqual(len(index["records"]), 102)
        self.assertEqual(index["records"][100]["chunk"], "chunk-002.v1.json")
        root = index_path.removesuffix("index.v1.json")
        first = json.loads(outputs[root + "chunk-001.v1.json"])
        second = json.loads(outputs[root + "chunk-002.v1.json"])
        self.assertEqual((len(first["records"]), len(second["records"])), (100, 2))
        self.assertEqual(first["records"][0]["id"], index["records"][0]["id"])
        self.assertEqual(second["records"][1]["id"], index["records"][101]["id"])
        self.assertTrue(all(x["snapshotId"] == public_manifest["snapshotId"]
                            for x in (index, first, second)))

    def test_check_mode_rejects_missing_extra_and_altered_outputs(self):
        module, path, manifest = self.build_fixture([row()])
        outputs, _ = module.build(path, manifest)
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        target = Path(temp.name)
        module.write_outputs(outputs, target, check=False)
        module.write_outputs(outputs, target, check=True)
        (target / "extra.txt").write_text("unexpected", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "file set"):
            module.write_outputs(outputs, target, check=True)
        (target / "extra.txt").unlink()
        (target / "manifest.v1.json").write_text("{}", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "differs"):
            module.write_outputs(outputs, target, check=True)


if __name__ == "__main__":
    unittest.main()
