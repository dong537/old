"""Archive a name/address crosswalk between Guangzhou's September and Tianhe's October lists."""
from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import re
import tempfile
import unicodedata
from collections import Counter
from pathlib import Path

from lxml import html


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data/private/guangdong-eldercare-source"
PACKAGE = DATA / "research-batch15/guangzhou"
MUNICIPAL = DATA / "research-batch3/pearl-expansion/raw/guangzhou-235.html"
DISTRICT = DATA / "research-batch14/pearl/raw/guangzhou-tianhe-202610.html"
MUNICIPAL_SHA = "588ac7e9d2ffae76ebe5ffcd522a865665d4ffa39cdb12e04fbca88ec5e4e46e"
DISTRICT_SHA = "c1d5aff39524b555edb9628a822a1d15009e00951f421c85f7688a1dbbc0f31f"
FIELDS = (
    "district_serial", "district_name_as_published", "district_address_as_published",
    "district_operating_flag_as_published", "municipal_serial", "municipal_name_as_published",
    "municipal_address_as_published", "comparison", "district_name_xpath",
    "district_address_xpath", "district_status_xpath", "municipal_name_xpath",
    "municipal_address_xpath", "municipal_source_file", "municipal_source_sha256",
    "district_source_file", "district_source_sha256", "identity_verified",
    "current_operating_status_verified",
)


def sha(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def packed(value: object) -> bytes:
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + "\n").encode("utf-8")


def read_verified(path: Path, expected_sha: str) -> bytes:
    raw = path.read_bytes()
    if sha(raw) != expected_sha:
        raise ValueError("Original source SHA mismatch: " + str(path))
    return raw


def clean_text(cell) -> str:
    return " ".join("".join(cell.itertext()).split())


def key(value: str) -> str:
    return re.sub(r"\s+", "", unicodedata.normalize("NFKC", value))


def reconcile(municipal: list[dict], district: list[dict]) -> list[dict]:
    by_key = {}
    for row in municipal:
        pair = (key(row["name"]), key(row["address"]))
        if pair in by_key:
            raise ValueError("Municipal exact name/address key is ambiguous")
        by_key[pair] = row
    if len({(key(row["name"]), key(row["address"])) for row in district}) != len(district):
        raise ValueError("District exact name/address key is ambiguous")
    rows = []
    matched = set()
    for row in district:
        source = by_key.get((key(row["name"]), key(row["address"])))
        if source:
            matched.add(source["serial"])
        rows.append({
            "district_serial": row["serial"],
            "district_name_as_published": row["name"],
            "district_address_as_published": row["address"],
            "district_operating_flag_as_published": row["status"],
            "municipal_serial": source["serial"] if source else "",
            "municipal_name_as_published": source["name"] if source else "",
            "municipal_address_as_published": source["address"] if source else "",
            "comparison": "exact_name_and_address" if source else "district_only_unmatched",
            "district_name_xpath": row.get("name_xpath", ""),
            "district_address_xpath": row.get("address_xpath", ""),
            "district_status_xpath": row.get("status_xpath", ""),
            "municipal_name_xpath": source.get("name_xpath", "") if source else "",
            "municipal_address_xpath": source.get("address_xpath", "") if source else "",
            "municipal_source_file": MUNICIPAL.relative_to(DATA).as_posix(),
            "municipal_source_sha256": MUNICIPAL_SHA,
            "district_source_file": DISTRICT.relative_to(DATA).as_posix(),
            "district_source_sha256": DISTRICT_SHA,
            "identity_verified": False,
            "current_operating_status_verified": False,
        })
    if len(matched) != len(municipal):
        raise ValueError("A municipal Tianhe row lacks an exact district name/address pair")
    return rows


def extract_city(raw: bytes) -> tuple[list[dict], str]:
    page = html.fromstring(raw)
    tables = page.xpath("//table")
    if len(tables) != 1:
        raise ValueError("Expected one municipal table")
    trs = tables[0].xpath(".//tr")
    if len(trs) != 237:
        raise ValueError("Municipal table is not the reviewed 235-row snapshot")
    records = []
    for tr in trs[2:]:
        cells = tr.xpath("./th|./td")
        values = [clean_text(cell) for cell in cells]
        if len(values) != 9 or not values[0].isdigit():
            raise ValueError("Malformed municipal institution row")
        if values[1] == "天河区":
            records.append({"serial": values[0], "name": values[2], "address": values[3],
                            "name_xpath": page.getroottree().getpath(cells[2]),
                            "address_xpath": page.getroottree().getpath(cells[3])})
    if [int(row["serial"]) for row in records] != [*range(95, 111), 111]:
        raise ValueError("Municipal Tianhe serials changed")
    dates = page.xpath("//meta[@name='PubDate']/@content")
    if dates != ["2026-09-23 17:14"]:
        raise ValueError("Municipal publication label changed")
    return records, dates[0]


def extract_district(raw: bytes) -> tuple[list[dict], str]:
    page = html.fromstring(raw)
    tables = page.xpath("//table")
    if len(tables) != 1:
        raise ValueError("Expected one Tianhe table")
    trs = tables[0].xpath(".//tr")
    if len(trs) != 21:
        raise ValueError("District table is not the reviewed 19-row snapshot")
    records = []
    for tr in trs[2:]:
        cells = tr.xpath("./th|./td")
        values = [clean_text(cell) for cell in cells]
        if len(values) != 11 or not values[0].isdigit() or values[5] not in ("是", "否"):
            raise ValueError("Malformed district institution row")
        records.append({"serial": values[0], "name": values[1], "address": values[3],
                        "status": values[5],
                        "name_xpath": page.getroottree().getpath(cells[1]),
                        "address_xpath": page.getroottree().getpath(cells[3]),
                        "status_xpath": page.getroottree().getpath(cells[5])})
    if [int(row["serial"]) for row in records] != list(range(1, 20)):
        raise ValueError("District serials changed")
    dates = page.xpath("//meta[@name='PubDate']/@content")
    if dates != ["2026-10-16 14:10"]:
        raise ValueError("District publication label changed")
    return records, dates[0]


def csv_bytes(rows: list[dict]) -> bytes:
    stream = io.StringIO(newline="")
    writer = csv.DictWriter(stream, fieldnames=FIELDS, lineterminator="\n", extrasaction="raise")
    writer.writeheader()
    writer.writerows(rows)
    return stream.getvalue().encode("utf-8-sig")


def build() -> tuple[dict[str, bytes], dict]:
    municipal_raw = read_verified(MUNICIPAL, MUNICIPAL_SHA)
    district_raw = read_verified(DISTRICT, DISTRICT_SHA)
    municipal, municipal_date = extract_city(municipal_raw)
    district, district_date = extract_district(district_raw)
    rows = reconcile(municipal, district)
    matches = sum(row["comparison"] == "exact_name_and_address" for row in rows)
    report = {
        "municipal_tianhe_rows": len(municipal),
        "district_tianhe_rows": len(district),
        "exact_name_and_address_pairs": matches,
        "district_only_rows": len(rows) - matches,
        "district_status_as_published": dict(sorted(Counter(row["status"] for row in district).items())),
        "municipal_published_at": municipal_date,
        "district_published_at": district_date,
        "source_as_of": None,
        "institution_identity_verified": False,
        "current_operating_status_verified": False,
        "same_period_citywide_completeness_proven": False,
        "limits": [
            "两份表分别于2026-09-23和2026-10-16发布，未证实同一资料期。",
            "17对只证明规范化名称和地址文字一致，不自动批准跨期机构身份或目前在营。",
            "天河区表的17个是和2个否是来源原值，不能外推至2026-11-15。",
            "本对照仅覆盖天河区，不证明广州市11区同期名录完整。",
        ],
    }
    outputs = {"crosswalk.csv": csv_bytes(rows), "report.json": packed(report)}
    lines = [
        "# 广州市表与天河区表跨期对照", "",
        "2026年9月市表天河区17行与2026年10月区表19行，按名称和地址原文做NFKC/空白规范化后逐行比较。",
        f"完全对应{matches}行；区表另有{len(rows) - matches}行未在市表天河区部分对应。", "",
        "## 解释边界", "",
    ] + ["- " + item for item in report["limits"]]
    lines += ["", "原件SHA、行定位及逐项输出哈希见manifest.json；未复制个人电话。"]
    outputs["report.md"] = ("\n".join(lines) + "\n").encode("utf-8")
    source_hashes = {
        MUNICIPAL.relative_to(DATA).as_posix(): MUNICIPAL_SHA,
        DISTRICT.relative_to(DATA).as_posix(): DISTRICT_SHA,
    }
    output_hashes = {name: sha(content) for name, content in sorted(outputs.items())}
    generator_sha = sha(Path(__file__).read_bytes())
    version = "v1-" + sha(packed({"generator": generator_sha, "sources": source_hashes,
                                  "outputs": output_hashes}))[:16]
    outputs["manifest.json"] = packed({"version_id": version, "generator_sha256": generator_sha,
                                       "source_sha256": source_hashes,
                                       "output_sha256": output_hashes, "summary": report})
    return outputs, report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    outputs, report = build()
    version = json.loads(outputs["manifest.json"])["version_id"]
    destination = PACKAGE / "versions" / version
    if args.check or destination.exists():
        if not destination.is_dir() or {p.name for p in destination.iterdir()} != set(outputs):
            raise ValueError("Crosswalk archive file set differs")
        for name, content in outputs.items():
            if (destination / name).read_bytes() != content:
                raise ValueError("Crosswalk archive bytes differ: " + name)
        action = "verified"
    else:
        destination.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix=".staging-", dir=destination.parent) as temp:
            stage = Path(temp) / "version"
            stage.mkdir()
            for name, content in outputs.items():
                (stage / name).write_bytes(content)
            stage.rename(destination)
        action = "created"
    print(json.dumps({"action": action, "path": destination.relative_to(ROOT).as_posix(),
                      "summary": report}, ensure_ascii=False))


if __name__ == "__main__":
    main()
