"""Behavioral checks for the reviewed QCC public projection."""

import importlib.util
import hashlib
import json
import unittest
from collections import Counter
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts/build-qcc-public.py"


def projection():
    assert SCRIPT.is_file(), "QCC public projection script is missing"
    spec = importlib.util.spec_from_file_location("build_qcc_public", SCRIPT)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_misdeclared_a1_dimension_still_reads_every_real_row_and_header():
    qcc = projection()
    headers, rows = qcc.read_source()
    assert len(headers) == 37
    assert headers[0] == "企业名称"
    assert headers[-1] == "经营范围"
    assert len(rows) == 6777
    assert rows[0][0] == 3
    assert rows[-1][0] == 6779
    assert len({row["所属城市"] for _, row in rows}) == 21


def test_source_hash_mismatch_is_rejected():
    qcc = projection()
    with pytest.raises(ValueError, match="hash mismatch"):
        qcc.read_source(expected_sha256="0" * 64)


def test_changed_or_reordered_header_is_rejected():
    qcc = projection()
    changed = list(qcc.EXPECTED_HEADERS)
    changed[5] = "企业代码"
    with pytest.raises(ValueError, match="headers differ"):
        qcc.validate_headers(changed)


def test_public_record_preserves_approved_raw_values_and_nulls_missing():
    qcc = projection()
    raw = dict.fromkeys(qcc.EXPECTED_HEADERS)
    raw.update({
        "企业名称": "测试养老服务中心", "登记状态": "注销（2026-11-10）",
        "法定代表人": "张三", "注册资本": "-", "成立日期": "2020-01-02",
        "统一社会信用代码": "-", "注册地址": "广州市测试路1号",
        "所属城市": "广州市", "所属区县": "-", "企业(机构)类型": "事业单位",
        "参保人数": "0", "国标行业大类": "社会工作", "企业规模": "XS(微型)",
        "有效手机号": "CONTACT_SECRET_PHONE", "更多电话": "CONTACT_SECRET_OTHER",
        "邮箱": "CONTACT_SECRET_EMAIL", "企业简介": "CONTACT_SECRET_INTRO",
    })
    index, detail = qcc.project_row(3, raw, chunk=1)
    assert set(index) == {
        "id", "rowNumber", "name", "city", "district", "subjectType",
        "registrationStatus", "chunk",
    }
    assert set(detail) == {
        "id", "rowNumber", "name", "city", "district", "subjectType",
        "registrationStatus", "creditCode", "codeValidity", "legalRepresentative",
        "establishedAt", "registeredCapital", "organizationCode", "registrationNo",
        "taxId", "businessTerm", "insuredPersons", "insuredYear", "nationalIndustry",
        "address", "mailingAddress", "businessScope", "formerName", "englishName",
        "companySize", "sourceFields",
    }
    expected_source = dict(raw)
    for contact in ("有效手机号", "更多电话", "邮箱"):
        expected_source[contact] = "[已遮蔽]"
    assert detail["sourceFields"] == expected_source
    assert index["city"] == "广州"
    assert index["chunk"] == "chunk-001.v1.json"
    assert index["district"] is None
    assert detail["creditCode"] is None
    assert detail["codeValidity"] == "missing"
    assert detail["registeredCapital"] is None
    assert detail["insuredPersons"] == "0"
    assert detail["nationalIndustry"] == "社会工作"
    assert detail["companySize"] == "XS(微型)"
    assert detail["registrationStatus"] == "注销（2026-11-10）"
    assert "CONTACT_SECRET_PHONE" not in json.dumps(detail["sourceFields"], ensure_ascii=False)
    assert "CONTACT_SECRET_OTHER" not in json.dumps(detail["sourceFields"], ensure_ascii=False)
    assert "CONTACT_SECRET_EMAIL" not in json.dumps(detail["sourceFields"], ensure_ascii=False)
    assert detail["sourceFields"]["企业简介"] == "CONTACT_SECRET_INTRO"
    assert "CONTACT_SECRET" not in json.dumps(index, ensure_ascii=False)


def test_source_fields_preserve_37_columns_but_redact_contacts():
    qcc = projection()
    raw = dict.fromkeys(qcc.EXPECTED_HEADERS)
    raw.update({
        "企业名称": "养老中心", "统一社会信用代码": "-", "所属城市": "广州市",
        "有效手机号": "13800138000", "更多电话": "020-12345678",
        "邮箱": "care@example.com", "官网网址": "https://example.com/path",
        "注册地址邮编": "510000", "通信地址邮编": 510001,
        "国标行业门类": "O", "企查查行业小类": "养老服务",
        "参保人数": 0, "注册地址": "", "通信地址": "-",
    })
    index, detail = qcc.project_row(3, raw, chunk=1)
    assert set(detail["sourceFields"]) == set(qcc.EXPECTED_HEADERS)
    expected_source = dict(raw)
    for contact in ("有效手机号", "更多电话", "邮箱"):
        expected_source[contact] = "[已遮蔽]"
    assert detail["sourceFields"] == expected_source
    assert "sourceFields" not in index


def test_credit_code_validation_marks_invalid_without_dropping_raw_code():
    qcc = projection()
    valid = "91441900MA4WJE2B8X"
    assert qcc.code_validity(valid) == "valid"
    assert qcc.code_validity(valid[:-1] + "0") == "invalid_checksum"
    assert qcc.code_validity("not a code") == "invalid_format"
    assert qcc.code_validity(None) == "missing"
    raw = dict.fromkeys(qcc.EXPECTED_HEADERS)
    raw.update({"企业名称": "测试", "所属城市": "东莞市", "统一社会信用代码": valid[:-1] + "0"})
    index, detail = qcc.project_row(9, raw, chunk=1)
    assert detail["creditCode"] == valid[:-1] + "0"
    assert detail["codeValidity"] == "invalid_checksum"
    assert index["id"] == detail["id"]


def test_embedded_contact_values_are_removed_from_approved_text_fields():
    qcc = projection()
    raw = dict.fromkeys(qcc.EXPECTED_HEADERS)
    raw.update({
        "企业名称": "测试养老中心", "所属城市": "广州市",
        "注册地址": "广州路1号 联系手机13800138000",
        "经营范围": "养老服务；邮箱example@example.com",
        "企业简介": "客服热线020-12345678",
    })
    redactions = Counter()
    index, detail = qcc.project_row(10, raw, chunk=1, redactions=redactions)
    assert index["name"] == "测试养老中心"
    assert detail["address"] is None
    assert detail["businessScope"] is None
    assert detail["sourceFields"]["注册地址"] == "[已遮蔽]"
    assert detail["sourceFields"]["经营范围"] == "[已遮蔽]"
    assert detail["sourceFields"]["企业简介"] == "[已遮蔽]"
    assert redactions == {"address": 1, "businessScope": 1}


def test_numeric_contact_in_free_text_is_redacted_without_hiding_capital_or_codes():
    qcc = projection()
    raw = dict.fromkeys(qcc.EXPECTED_HEADERS)
    raw.update({
        "企业名称": "测试养老中心", "所属城市": "广州市",
        "注册地址": 13800138000, "注册资本": 13800138000,
        "组织机构代码": "13800138000",
    })
    _, detail = qcc.project_row(3, raw, chunk=1)
    assert detail["address"] is None
    assert detail["sourceFields"]["注册地址"] == "[已遮蔽]"
    assert detail["registeredCapital"] == 13800138000
    assert detail["sourceFields"]["注册资本"] == 13800138000
    assert detail["sourceFields"]["组织机构代码"] == "13800138000"


def test_unseparated_landline_in_free_text_is_masked():
    qcc = projection()
    raw = dict.fromkeys(qcc.EXPECTED_HEADERS)
    raw.update({"企业名称": "测试养老中心", "所属城市": "广州市",
                "注册地址": "广州路1号 电话02012345678"})
    _, detail = qcc.project_row(3, raw, chunk=1)
    assert detail["address"] is None
    assert detail["sourceFields"]["注册地址"] == "[已遮蔽]"


def test_candidate_links_keep_both_same_city_same_name_subjects_only():
    qcc = projection()
    sources = [
        {"id": "official-1", "city": "茂名", "name": "高州市福康养老服务中心"},
        {"id": "official-2", "city": "广州", "name": "高州市福康养老服务中心"},
    ]
    subjects = [
        {"id": "subject-a", "city": "茂名", "name": "高州市福康养老服务中心"},
        {"id": "subject-b", "city": "茂名", "name": "高州市福康养老服务中心"},
        {"id": "subject-c", "city": "湛江", "name": "高州市福康养老服务中心"},
    ]
    assert qcc.link_candidates(sources, subjects) == [
        {"sourceRecordId": "official-1", "subjectIds": ["subject-a", "subject-b"]},
    ]


def test_full_projection_has_exact_counts_order_chunks_and_source_fields():
    qcc = projection()
    outputs = qcc.build()
    assert len(outputs) == 70
    index = json.loads(outputs["index.v1.json"])
    links = json.loads(outputs["links.v1.json"])
    assert qcc.PROJECTION_POLICY_VERSION == b"qcc-public-contact-redaction-v3"
    seed = (qcc.SOURCE_SHA256.encode("ascii")
            + hashlib.sha256(qcc.OFFICIAL_SOURCE.read_bytes()).digest()
            + qcc.PROJECTION_POLICY_VERSION)
    assert index["snapshotId"] == "v1-" + hashlib.sha256(seed).hexdigest()[:16]
    assert set(index) == {"schemaVersion", "snapshotId", "exportedAt", "sourceSha256", "records"}
    assert index["schemaVersion"] == links["schemaVersion"] == 1
    assert index["exportedAt"] == "2026-11-16"
    assert index["sourceSha256"] == qcc.SOURCE_SHA256
    assert len(index["records"]) == 6777
    assert len({row["city"] for row in index["records"]}) == 21
    assert [row["rowNumber"] for row in index["records"]] == list(range(3, 6780))
    assert len({row["id"] for row in index["records"]}) == 6777
    assert index["records"][0]["chunk"] == "chunk-001.v1.json"
    assert index["records"][100]["chunk"] == "chunk-002.v1.json"
    chunks = [json.loads(outputs[f"chunk-{n:03d}.v1.json"]) for n in range(1, 69)]
    assert all(len(chunk["records"]) == 100 for chunk in chunks[:-1])
    assert len(chunks[-1]["records"]) == 77
    assert all(chunk["snapshotId"] == index["snapshotId"] for chunk in chunks)
    assert len(links["links"]) == 157
    assert sum(len(link["subjectIds"]) for link in links["links"]) == 158
    assert sum(len(link["subjectIds"]) == 2 for link in links["links"]) == 1
    assert all("sourceFields" not in record for record in index["records"])
    assert all(tuple(record["sourceFields"]) == qcc.EXPECTED_HEADERS
               for chunk in chunks for record in chunk["records"])
    assert all(record["sourceFields"][header] in (None, "", "-", "[已遮蔽]")
               for chunk in chunks for record in chunk["records"]
               for header in ("有效手机号", "更多电话", "邮箱"))
    assert all(not qcc.CONTACT_PATTERN.search(str(value))
               for chunk in chunks for record in chunk["records"]
               for value in record["sourceFields"].values() if value is not None)


class QccSourceFieldsTests(unittest.TestCase):
    def test_all_original_fields_survive_projection(self):
        test_source_fields_preserve_37_columns_but_redact_contacts()

    def test_invalid_source_value_types_are_rejected(self):
        qcc = projection()
        for invalid in (True, [], {}, float("inf"), float("nan")):
            raw = dict.fromkeys(qcc.EXPECTED_HEADERS)
            raw.update({"企业名称": "养老中心", "所属城市": "广州市", "官网网址": invalid})
            with self.assertRaisesRegex(ValueError, "source field"):
                qcc.project_row(3, raw, chunk=1)


def test_check_mode_detects_missing_or_changed_output(tmp_path):
    qcc = projection()
    outputs = {"index.v1.json": b"{}\n", "links.v1.json": b"{}\n"}
    qcc.write_outputs(outputs, tmp_path, check=False)
    qcc.write_outputs(outputs, tmp_path, check=True)
    (tmp_path / "links.v1.json").write_bytes(b"changed")
    with pytest.raises(ValueError, match="differs"):
        qcc.write_outputs(outputs, tmp_path, check=True)
