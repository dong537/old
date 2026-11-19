"""Behavioral checks for the national QCC offline projection."""

from __future__ import annotations

import hashlib
import importlib.util
import json
import re
import tempfile
import unittest
import zipfile
from collections import Counter
from pathlib import Path

from openpyxl import Workbook


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts/build-qcc-national.py"
VALID_CODE = "91441900MA4WJE2B8X"


def projection():
    assert SCRIPT.is_file(), "National QCC projection script is missing"
    spec = importlib.util.spec_from_file_location("build_qcc_national", SCRIPT)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def raw_row(qcc, **overrides):
    row = dict.fromkeys(qcc.EXPECTED_HEADERS)
    row.update({
        "企业名称": "杭州养老服务中心", "所属省份": "浙江省", "所属城市": "杭州市",
        "统一社会信用代码": "-", "登记状态": "存续", "企业(机构)类型": "有限责任公司",
    })
    row.update(overrides)
    return row


def make_xlsx(path, headers, rows, wrong_dimension=False):
    book = Workbook()
    sheet = book.active
    sheet.append(["QCC export disclaimer"])
    sheet.append(list(headers))
    for row in rows:
        sheet.append([row.get(header) for header in headers])
    book.save(path)
    if wrong_dimension:
        with zipfile.ZipFile(path) as archive:
            members = [(item, archive.read(item.filename)) for item in archive.infolist()]
        with zipfile.ZipFile(path, "w") as archive:
            for item, data in members:
                if item.filename == "xl/worksheets/sheet1.xml":
                    data, count = re.subn(rb'<dimension ref="[^"]+"',
                                          b'<dimension ref="A1:A1"', data, count=1)
                    assert count == 1
                archive.writestr(item, data)


def make_manifest(source_dir, names, row_counts):
    files = []
    for number, name in enumerate(names, start=1):
        data = (source_dir / name).read_bytes()
        digest = hashlib.sha256(data).hexdigest()
        files.append({"id": f"source-{number:02d}", "filename": name,
                      "sha256": digest, "rowCount": row_counts[number - 1]})
    manifest = {"schemaVersion": 1, "exportedAt": "2026-11-16",
                "rowCount": sum(row_counts), "sourceFiles": files}
    path = source_dir.parent / "source-manifest.json"
    path.write_text(json.dumps(manifest, ensure_ascii=False), encoding="utf-8")
    return path


class NationalQccProjectionTests(unittest.TestCase):
    def fixture(self, rows, wrong_dimension=False):
        qcc = projection()
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        source_dir = Path(temp.name) / "source"
        source_dir.mkdir()
        path = source_dir / "sample.xlsx"
        make_xlsx(path, qcc.EXPECTED_HEADERS, rows, wrong_dimension)
        manifest = make_manifest(source_dir, [path.name], [len(rows)])
        return qcc, source_dir, manifest

    def test_changed_or_reordered_header_is_rejected(self):
        qcc = projection()
        changed = list(qcc.EXPECTED_HEADERS)
        changed[5] = "企业代码"
        with self.assertRaisesRegex(ValueError, "headers differ"):
            qcc.validate_headers(changed)

    def test_a1_dimension_is_reset_and_source_lock_rejects_drift(self):
        qcc = projection()
        row = raw_row(qcc)
        qcc, source_dir, manifest_path = self.fixture([row], wrong_dimension=True)
        outputs, _ = qcc.build(source_dir, manifest_path, expected_provinces=1,
                               expected_city_groups=1)
        index = json.loads(outputs["p-" + qcc.slug("浙江省") + "/c-" +
                                   qcc.slug("杭州") + "/index.v1.json"])
        self.assertEqual(index["records"][0]["rowNumber"], 3)
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        manifest["sourceFiles"][0]["sha256"] = "0" * 64
        manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "hash mismatch"):
            qcc.build(source_dir, manifest_path, expected_provinces=1,
                      expected_city_groups=1)

    def test_file_set_header_and_row_count_are_locked(self):
        qcc = projection()
        qcc, source_dir, manifest_path = self.fixture([raw_row(qcc)])
        (source_dir / "unexpected.xlsx").write_bytes(b"not a workbook")
        with self.assertRaisesRegex(ValueError, "file set"):
            qcc.build(source_dir, manifest_path, expected_provinces=1,
                      expected_city_groups=1)
        (source_dir / "unexpected.xlsx").unlink()
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        manifest["sourceFiles"][0]["rowCount"] = 2
        manifest["rowCount"] = 2
        manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "row count"):
            qcc.build(source_dir, manifest_path, expected_provinces=1,
                      expected_city_groups=1)
        headers = list(qcc.EXPECTED_HEADERS)
        headers[0] = "错误标题"
        make_xlsx(source_dir / "sample.xlsx", headers, [raw_row(qcc)])
        make_manifest(source_dir, ["sample.xlsx"], [1])
        with self.assertRaisesRegex(ValueError, "headers differ"):
            qcc.build(source_dir, manifest_path, expected_provinces=1,
                      expected_city_groups=1)

    def test_ids_preserve_missing_invalid_and_duplicate_source_rows(self):
        qcc = projection()
        valid = raw_row(qcc, **{"统一社会信用代码": VALID_CODE})
        missing = raw_row(qcc)
        invalid = raw_row(qcc, **{"统一社会信用代码": VALID_CODE[:-1] + "0"})
        first, detail = qcc.project_row(3, valid, "source-a", "a" * 64, 1)
        same_code, _ = qcc.project_row(9, valid, "source-b", "b" * 64, 1)
        missing_a, missing_detail = qcc.project_row(3, missing, "source-a", "a" * 64, 1)
        missing_b, _ = qcc.project_row(3, missing, "source-b", "b" * 64, 1)
        invalid_index, invalid_detail = qcc.project_row(4, invalid, "source-a", "a" * 64, 1)
        self.assertEqual(first["id"], same_code["id"])
        self.assertNotEqual(missing_a["id"], missing_b["id"])
        self.assertNotEqual(missing_a["id"], invalid_index["id"])
        self.assertEqual(detail["codeValidity"], "valid")
        self.assertEqual(missing_detail["codeValidity"], "missing")
        self.assertEqual(invalid_detail["codeValidity"], "invalid_checksum")
        self.assertEqual(invalid_detail["creditCode"], VALID_CODE[:-1] + "0")
        self.assertEqual(missing_a["sourceId"], "source-a")

    def test_approved_fields_and_embedded_contacts_are_redacted(self):
        qcc = projection()
        row = raw_row(qcc, **{
            "企业名称": "养老中心13800138000", "注册地址": "路1号 联系138 0013 8000",
            "经营范围": "联系+86-138-0013-8000", "通信地址": "0086 138 0013 8000",
            "有效手机号": "CONTACT_SECRET_PHONE", "更多电话": "CONTACT_SECRET_OTHER",
            "邮箱": "CONTACT_SECRET_EMAIL", "企业简介": "CONTACT_SECRET_INTRO",
            "官网网址": "CONTACT_SECRET_URL", "注册地址邮编": "CONTACT_SECRET_POST",
            "通信地址邮编": "CONTACT_SECRET_POST2", "曾用名": "邮箱help@example.com",
        })
        redactions = Counter()
        index, detail = qcc.project_row(3, row, "source-a", "a" * 64, 1, redactions)
        self.assertEqual(set(index), {"id", "rowNumber", "name", "province", "city",
                                      "district", "subjectType", "registrationStatus",
                                      "sourceId", "chunk"})
        self.assertEqual(set(detail), (set(index) - {"chunk"}) | {
            "creditCode", "codeValidity", "legalRepresentative", "establishedAt",
            "registeredCapital", "organizationCode", "registrationNo", "taxId",
            "businessTerm", "insuredPersons", "insuredYear", "nationalIndustry",
            "address", "mailingAddress", "businessScope", "formerName",
            "englishName", "companySize", "sourceFields"})
        self.assertEqual(set(detail["sourceFields"]), set(qcc.EXPECTED_HEADERS))
        for field in ("企业名称", "注册地址", "经营范围", "通信地址",
                      "有效手机号", "更多电话", "邮箱", "曾用名"):
            self.assertEqual(detail["sourceFields"][field], "[已遮蔽]")
        self.assertEqual(detail["sourceFields"]["企业简介"], "CONTACT_SECRET_INTRO")
        self.assertEqual(index["name"], "已遮蔽")
        self.assertIsNone(detail["address"])
        self.assertIsNone(detail["businessScope"])
        self.assertIsNone(detail["mailingAddress"])
        self.assertIsNone(detail["formerName"])
        self.assertEqual(redactions, {"name": 1, "address": 1,
                                      "businessScope": 1, "mailingAddress": 1,
                                      "formerName": 1})
        self.assertNotIn("CONTACT_SECRET_PHONE", json.dumps(detail["sourceFields"], ensure_ascii=False))
        self.assertNotIn("CONTACT_SECRET_OTHER", json.dumps(detail["sourceFields"], ensure_ascii=False))
        self.assertNotIn("CONTACT_SECRET_EMAIL", json.dumps(detail["sourceFields"], ensure_ascii=False))
        self.assertNotIn("CONTACT_SECRET", json.dumps(index, ensure_ascii=False))

    def test_source_fields_keep_all_37_keys_but_mask_contact_values(self):
        qcc = projection()
        row = raw_row(qcc, **{
            "有效手机号": "13800138000", "更多电话": "010-12345678",
            "邮箱": "care@example.com", "官网网址": "https://example.com/path",
            "注册地址邮编": "310000", "通信地址邮编": 310001,
            "国标行业门类": "O", "企查查行业小类": "养老服务",
            "参保人数": 0, "注册地址": "", "通信地址": "-",
        })
        index, detail = qcc.project_row(3, row, "source-a", "a" * 64, 1)
        self.assertEqual(set(detail["sourceFields"]), set(qcc.EXPECTED_HEADERS))
        for field in ("有效手机号", "更多电话", "邮箱"):
            self.assertEqual(detail["sourceFields"][field], "[已遮蔽]")
        for field in ("官网网址", "注册地址邮编", "通信地址邮编",
                      "国标行业门类", "企查查行业小类", "参保人数",
                      "注册地址", "通信地址"):
            self.assertEqual(detail["sourceFields"][field], row[field])
        self.assertNotIn("sourceFields", index)

    def test_source_fields_mask_embedded_mobile_email_and_landline(self):
        qcc = projection()
        row = raw_row(qcc, **{
            "注册地址": "路1号 联系 13800138000",
            "通信地址": "路2号 电话 010-12345678",
            "经营范围": "咨询 care@example.com",
            "企业简介": "联系+86 138 0013 8000",
            "统一社会信用代码": VALID_CODE,
        })
        _, detail = qcc.project_row(3, row, "source-a", "a" * 64, 1)
        for field in ("注册地址", "通信地址", "经营范围", "企业简介"):
            self.assertEqual(detail["sourceFields"][field], "[已遮蔽]")
        self.assertIsNone(detail["address"])
        self.assertIsNone(detail["mailingAddress"])
        self.assertIsNone(detail["businessScope"])
        self.assertEqual(detail["sourceFields"]["统一社会信用代码"], VALID_CODE)
        empty = raw_row(qcc, **{"更多电话": "-", "邮箱": ""})
        _, empty_detail = qcc.project_row(3, empty, "source-a", "a" * 64, 1)
        for field in ("有效手机号", "更多电话", "邮箱"):
            self.assertEqual(empty_detail["sourceFields"][field], empty[field])

    def test_unseparated_landline_is_redacted_in_public_fields(self):
        qcc = projection()
        row = raw_row(qcc, **{
            "注册地址": "杭州市某路 联系电话02012345678",
            "通信地址": "杭州市某路（０２０）１２３４５６７８",
            "企业简介": "欢迎致电01087654321咨询",
            "统一社会信用代码": VALID_CODE,
        })
        redactions = Counter()
        _, detail = qcc.project_row(3, row, "source-a", "a" * 64, 1, redactions)
        for field in ("注册地址", "通信地址", "企业简介"):
            self.assertEqual(detail["sourceFields"][field], "[已遮蔽]")
        self.assertIsNone(detail["address"])
        self.assertIsNone(detail["mailingAddress"])
        self.assertEqual(redactions, {"address": 1, "mailingAddress": 1})
        self.assertEqual(detail["sourceFields"]["统一社会信用代码"], VALID_CODE)

    def test_numeric_phone_in_text_fields_is_redacted_or_blocked(self):
        qcc = projection()
        row = raw_row(qcc, **{"所属区县": 13800138000, "注册地址": 13800138000,
                              "通信地址": 13800138000, "经营范围": 13800138000})
        redactions = Counter()
        index, detail = qcc.project_row(3, row, "source-a", "a" * 64, 1, redactions)
        self.assertIsNone(index["district"])
        self.assertIsNone(detail["address"])
        self.assertIsNone(detail["mailingAddress"])
        self.assertIsNone(detail["businessScope"])
        self.assertEqual(redactions, {"district": 1, "address": 1,
                                      "mailingAddress": 1, "businessScope": 1})
        for field in ("所属区县", "注册地址", "通信地址", "经营范围"):
            self.assertEqual(detail["sourceFields"][field], "[已遮蔽]")
        for field in ("企业名称", "所属省份", "所属城市"):
            invalid = raw_row(qcc, **{field: 13800138000})
            with self.assertRaises(ValueError):
                qcc.project_row(3, invalid, "source-a", "a" * 64, 1)

    def test_numeric_identifiers_amounts_and_counts_are_not_contacts(self):
        qcc = projection()
        fields = ("统一社会信用代码", "纳税人识别号", "注册号", "组织机构代码",
                  "注册资本", "参保人数", "参保人数所属年报", "注册地址邮编", "通信地址邮编", "企业规模")
        for value in (13800138000, 13800138000.0):
            with self.subTest(value=value):
                row = raw_row(qcc, **dict.fromkeys(fields, value))
                redactions = Counter()
                _, detail = qcc.project_row(3, row, "source-a", "a" * 64, 1, redactions)
                for field in fields:
                    self.assertEqual(detail["sourceFields"][field], value)
                for field in ("creditCode", "taxId", "registrationNo", "organizationCode",
                              "registeredCapital", "insuredPersons", "insuredYear", "companySize"):
                    self.assertEqual(detail[field], value)
                self.assertEqual(redactions, {})

    def test_invalid_source_value_types_are_rejected(self):
        qcc = projection()
        for invalid in (True, [], {}, float("inf"), float("nan")):
            row = raw_row(qcc, **{"官网网址": invalid})
            with self.assertRaisesRegex(ValueError, "source field"):
                qcc.project_row(3, row, "source-a", "a" * 64, 1)

    def test_city_placeholder_chunk_paths_and_snapshot_are_consistent(self):
        qcc = projection()
        rows = [raw_row(qcc, **{"企业名称": f"企业{n}", "所属城市": "-"})
                for n in range(102)]
        qcc, source_dir, manifest_path = self.fixture(rows)
        outputs, audit = qcc.build(source_dir, manifest_path, expected_provinces=1,
                                   expected_city_groups=1)
        root = f"p-{qcc.slug('浙江省')}/c-{qcc.slug('城市未提供')}/"
        manifest = json.loads(outputs["manifest.v1.json"])
        source_manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        prior_seed = qcc.json_bytes({
            "exportedAt": source_manifest["exportedAt"],
            "sourceFiles": source_manifest["sourceFiles"],
        })
        policy_seed = qcc.json_bytes({
            "exportedAt": source_manifest["exportedAt"],
            "sourceFiles": source_manifest["sourceFiles"],
            "projectionPolicy": "qcc-national-mask-contacts-v3",
        })
        old_policy_seed = qcc.json_bytes({
            "exportedAt": source_manifest["exportedAt"],
            "sourceFiles": source_manifest["sourceFiles"],
            "projectionPolicy": "qcc-national-mask-contacts-v2",
        })
        self.assertNotEqual(manifest["snapshotId"],
                            "v1-" + hashlib.sha256(prior_seed).hexdigest()[:16])
        self.assertNotEqual(manifest["snapshotId"],
                            "v1-" + hashlib.sha256(old_policy_seed).hexdigest()[:16])
        self.assertEqual(manifest["snapshotId"],
                         "v1-" + hashlib.sha256(policy_seed).hexdigest()[:16])
        index = json.loads(outputs[root + "index.v1.json"])
        first = json.loads(outputs[root + "chunk-001.v1.json"])
        second = json.loads(outputs[root + "chunk-002.v1.json"])
        self.assertEqual(manifest["rowCount"], 102)
        self.assertEqual(manifest["provinces"][0]["cities"], [{
            "slug": "c-" + qcc.slug("城市未提供"), "name": "城市未提供",
            "count": 102, "indexPath": root + "index.v1.json"}])
        self.assertEqual(len(index["records"]), 102)
        self.assertEqual(len(first["records"]), 100)
        self.assertEqual(len(second["records"]), 2)
        self.assertEqual(index["records"][100]["chunk"], "chunk-002.v1.json")
        self.assertEqual(index["records"][0]["id"], first["records"][0]["id"])
        self.assertEqual(index["records"][101]["id"], second["records"][1]["id"])
        self.assertTrue(all(x["snapshotId"] == manifest["snapshotId"]
                            for x in (index, first, second)))
        self.assertEqual((index["provinceSlug"], index["citySlug"]),
                         ("p-" + qcc.slug("浙江省"), "c-" + qcc.slug("城市未提供")))
        self.assertEqual(audit["cityMissingCount"], 102)

    def test_check_mode_compares_all_public_and_private_outputs(self):
        qcc = projection()
        qcc, source_dir, manifest_path = self.fixture([raw_row(qcc)])
        outputs, audit = qcc.build(source_dir, manifest_path, expected_provinces=1,
                                   expected_city_groups=1)
        output_dir = source_dir.parent / "public"
        audit_path = source_dir.parent / "audit.json"
        qcc.write_outputs(outputs, output_dir, check=False)
        qcc.write_audit(audit, audit_path, check=False)
        qcc.write_outputs(outputs, output_dir, check=True)
        qcc.write_audit(audit, audit_path, check=True)
        chunk = next(name for name in outputs if name.endswith("chunk-001.v1.json"))
        (output_dir / chunk).write_bytes(b"changed")
        with self.assertRaisesRegex(ValueError, "differs"):
            qcc.write_outputs(outputs, output_dir, check=True)
        audit_path.write_bytes(b"changed")
        with self.assertRaisesRegex(ValueError, "differs"):
            qcc.write_audit(audit, audit_path, check=True)


if __name__ == "__main__":
    unittest.main()
