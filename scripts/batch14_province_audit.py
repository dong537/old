"""Audit saved batch14 provincial catalogue responses without making network calls."""
from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import re
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data/private/guangdong-eldercare-source"
PACKAGE = DATA / "research-batch14/province"
CAPTURE_KEYS = {
    "robots-gddata", "catalog-eldercare-p10", "catalog-eldercare-p18", "catalog-eldercare-p22",
    "sihui-public-detail", "sihui-private-detail", "jieyang-legacy-detail", "boluo-legacy-detail",
    "longmen-legacy-detail", "guangzhou-legacy-detail", "longmen-legacy-schema", "guangzhou-legacy-schema",
}


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def packed(value) -> bytes:
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + "\n").encode("utf-8")


def validate_capture(root: Path, record: dict) -> dict:
    if record.get("authorization") != "none":
        raise ValueError("Capture authorization boundary changed")
    result = dict(record)
    raw_file = record.get("raw_file")
    if not raw_file:
        if (not record.get("error_type") or not record.get("error") or
                any(record.get(key) is not None for key in ("sha256", "bytes", "http_status"))):
            raise ValueError("A missing response must retain the real request error")
        result.update(capture_result="request_failed", raw_sha256_verified=False)
        return result
    relative = Path(raw_file)
    target = (root / relative).resolve()
    if relative.is_absolute() or ".." in relative.parts or not target.is_relative_to(root.resolve()):
        raise ValueError("Invalid raw source path")
    raw = target.read_bytes()
    if not re.fullmatch(r"[a-f0-9]{64}", record.get("sha256", "")) or sha(raw) != record["sha256"]:
        raise ValueError("Captured response SHA mismatch")
    if record.get("bytes") != len(raw):
        raise ValueError("Captured response size mismatch")
    if not isinstance(record.get("http_status"), int) or record.get("error_type"):
        raise ValueError("Captured response result is contradictory")
    if record.get("business_status") is not None:
        if json.loads(raw)["status"] != record["business_status"]:
            raise ValueError("Captured business status mismatch")
    result.update(capture_result=("response_saved" if 200 <= record["http_status"] < 300
                                  else "http_error_response_saved"),
                  raw_sha256_verified=True)
    return result


def access_decision(data: dict) -> str:
    if data.get("openLevel") == "3":
        return "review_required_do_not_preview"
    if data.get("openMode") == "有条件开放":
        return "conditional_do_not_preview"
    if data.get("openLevel") == "1" and data.get("openMode") == "无条件开放":
        return "ordinary_preview_eligible_no_data_obtained"
    return "unknown_do_not_preview"


def build() -> dict[str, bytes]:
    inputs = {}
    requests = []
    paths = sorted(PACKAGE.glob("*-request.json"))
    if {p.name.removesuffix("-request.json") for p in paths} != CAPTURE_KEYS:
        raise ValueError("Reviewed request set changed")
    for path in paths:
        raw = path.read_bytes()
        inputs[path.relative_to(DATA).as_posix()] = sha(raw)
        record = validate_capture(PACKAGE, json.loads(raw))
        if record["key"] != path.name.removesuffix("-request.json"):
            raise ValueError("Capture key differs from filename")
        if record.get("raw_file"):
            inputs[(PACKAGE / record["raw_file"]).relative_to(DATA).as_posix()] = record["sha256"]
        requests.append(record)
    inventory = DATA / "research-batch5/catalog-inventory"
    old = json.loads((inventory / "verification.json").read_bytes())
    inventory_csv = (inventory / "public-catalog-metadata.csv").read_bytes()
    if (old["catalog_pages"], old["catalog_metadata_records"], old["unique_catalog_ids"]) != (25, 147, 147):
        raise ValueError("Existing complete catalogue inventory differs")
    if sha(inventory_csv) != old["csv_sha256"]:
        raise ValueError("Existing catalogue inventory SHA mismatch")
    for request in old["requests"]:
        artifact = inventory / request["path"]
        raw = artifact.read_bytes()
        if sha(raw) != request["sha256"] or len(raw) != request["bytes"]:
            raise ValueError("Existing catalogue page SHA/size mismatch")
        inputs[artifact.relative_to(DATA).as_posix()] = sha(raw)
    for filename in ("verification.json", "public-catalog-metadata.csv"):
        path = inventory / filename
        inputs[path.relative_to(DATA).as_posix()] = sha(path.read_bytes())
    if (len(requests), sum(r["raw_sha256_verified"] for r in requests)) != (12, 8):
        raise ValueError("Batch14 request partition changed")
    access = []
    for record in requests:
        if not record["key"].endswith("-detail") or not record["raw_sha256_verified"]:
            continue
        response = json.loads((PACKAGE / record["raw_file"]).read_bytes())
        data = response["data"]
        if record.get("business_status") != "1000" or data["resId"] != record["request_json"]["resId"]:
            raise ValueError("Catalogue detail identity/status differs")
        access.append({"key": record["key"], "catalog_id": data["resId"],
                       "title_as_published": data["resTitle"], "open_level_as_published": data["openLevel"],
                       "open_level_name_as_published": data["openLevelName"],
                       "open_mode_as_published": data["openMode"],
                       "platform_record_total_as_published": data["recordTotal"],
                       "platform_data_update_time_as_published": data["dataUpdateTime"],
                       "platform_publish_date_as_published": data["publishDate"],
                       "access_decision": access_decision(data),
                       "source_file": (PACKAGE / record["raw_file"]).relative_to(DATA).as_posix(),
                       "source_sha256": record["sha256"], "institution_rows_obtained": 0})
    if len(access) != 5 or sum("do_not_preview" in r["access_decision"] for r in access) != 3:
        raise ValueError("Catalogue access boundary differs")
    stream = io.StringIO(newline="")
    writer = csv.DictWriter(stream, fieldnames=list(access[0]), lineterminator="\n")
    writer.writeheader()
    writer.writerows(access)
    report = {"requests": 12, "saved_responses": 8, "request_failures": 4,
              "catalogue_details_obtained": 5, "institution_rows_obtained": 0,
              "paid_queries": 0, "schema_failures": 2, "preview_requests": 0,
              "prior_inventory": {"pages": 25, "catalogues": 147, "all_25_page_hashes_reverified": True},
              "limits": ["147项是关键词目录元数据，不是147家机构，也不保证涵盖所有命名的目录。",
                         "robots.txt响应为SPA HTML，不是有效robots允许声明。",
                         "平台记录数、发布日期和更新时间不证明机构数、资料截止日或当前在营。",
                         "四会两项审核开放与博罗有条件开放只读取公开详情，没有请求明细。",
                         "龙门和广州schema请求超时，未执行预览；失败不当作零机构。"]}
    readme = """# 第十四批省目录访问证据整理

只整理本机已保存响应，不联网、不付费、不取得受限数据。12次请求分为8份响应原件、4次真实请求失败；**本分区新增机构观察为0**。

- `source-register.json`：12次请求的真实HTTP/业务状态、错误、采集时间、原件路径和已复算SHA。
- `catalogue-access-review.csv`：5个成功目录详情；原文开放条件、平台记录数及日期分栏。目录记录数不进入机构观察。
- `report.json`：计数、访问边界和限制；`manifest.json`固定输入、生成器及输出哈希。

跨批纠正：第五批已经保存25页、147项目录，本脚本重核全部25份原件及目录CSV哈希。第十四批重取10/18页只记复查，22页超时不表示全项目缺该页。robots响应是HTML壳，不能当成有效允许声明。

四会公办/民办为审核开放，停在公开详情；博罗同时出现普通开放枚举与“有条件开放”文字，按较严条件停止。龙门/广州的普通无条件目录schema请求超时，未预览，不把它们写成空名录。未申请、登录、下载、猜分页或绕过访问限制。

项目根目录离线复算：`python -X utf8 scripts/batch14_province_audit.py --check`。默认生成到独立`audit/`目录；已存在但字节不同时拒绝覆盖。平台更新时间不是名录统计截止日。
"""
    outputs = {"source-register.json": packed(requests),
               "catalogue-access-review.csv": stream.getvalue().encode("utf-8-sig"),
               "report.json": packed(report), "README.md": readme.encode("utf-8")}
    generator_sha = sha(Path(__file__).read_bytes())
    output_hashes = {name: sha(raw) for name, raw in sorted(outputs.items())}
    version = "v1-" + sha(packed({"generator": generator_sha, "inputs": inputs,
                                  "outputs": output_hashes}))[:16]
    outputs["manifest.json"] = packed({"version_id": version, "generator": "scripts/batch14_province_audit.py",
        "generator_sha256": generator_sha, "inputs_sha256": inputs,
        "output_sha256": output_hashes, "summary": report})
    return outputs


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    outputs = build()
    version = json.loads(outputs["manifest.json"])["version_id"]
    destination = PACKAGE / "audit/versions" / version
    if args.check or destination.exists():
        if not destination.is_dir() or {p.name for p in destination.iterdir()} != set(outputs):
            raise ValueError("Province audit file set differs")
        for name, raw in outputs.items():
            if (destination / name).read_bytes() != raw:
                raise ValueError("Province audit bytes differ: " + name)
        action = "verified"
    else:
        destination.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix=".audit-", dir=PACKAGE) as temporary:
            stage = Path(temporary) / "audit"
            stage.mkdir()
            for name, raw in outputs.items():
                (stage / name).write_bytes(raw)
            stage.rename(destination)
        action = "created"
    print(json.dumps({"action": action, "path": destination.relative_to(ROOT).as_posix(),
                      "summary": json.loads(outputs["report.json"])}, ensure_ascii=False))


if __name__ == "__main__":
    main()
