"""Audit names in the Zhuhai image roster without changing source observations."""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import unicodedata
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data/private/guangdong-eldercare-source"
INPUT = DATA / "exports/20261114_batch10/机构名录_逐条来源.csv"
IMAGE = DATA / "research-batch3/pearl-expansion/raw/zhuhai-202607-roster.webp"
OUTPUT = DATA / "research-batch12/zhuhai-image-review"
EXPECTED_IMAGE_SHA = "c8ea5ee2a36ac09056140ef8ef6cd8b365ef7b172404a881bc5a9ceb1bdb3f14"
EXPECTED_INPUT_SHA = "6c20c94161f124741e826b5bbb519bb037253e5734925bc5cd6e3aa372f2d266"

# Manually read from the official infographic on 2026-11-14. Position means
# district card and item ordinal, not an automatic OCR bounding box.
TRANSCRIPTION = [
    ("香洲区", 1, "珠海市养老中心"),
    ("香洲区", 2, "香洲区社会福利中心（香洲和园）"),
    ("香洲区", 3, "珠海福慧长者家园养老服务有限公司"),
    ("香洲区", 4, "香洲区乐百年护老中心"),
    ("香洲区", 5, "珠海容永道长者护理院有限责任公司"),
    ("香洲区", 6, "香洲区翠香社区养老服务中心"),
    ("香洲区", 7, "香洲区光明街朝晖护老院"),
    ("香洲区", 8, "香洲区祈康托老中心"),
    ("香洲区", 9, "香洲区博爱老年公寓"),
    ("香洲区", 10, "香洲区拱北社区养老服务中心"),
    ("香洲区", 11, "香洲区吉大社区养老服务中心"),
    ("香洲区", 12, "香洲区爱晖护老院"),
    ("金湾区", 1, "金湾区社会福利中心（金湾颐养园）"),
    ("金湾区", 2, "平沙镇养老院"),
    ("斗门区", 1, "斗门区莲洲镇社会福利中心"),
    ("斗门区", 2, "斗门区白藤街道社会福利中心"),
    ("斗门区", 3, "斗门区井岸镇社会福利中心"),
    ("斗门区", 4, "珠海方华医院有限责任公司"),
    ("斗门区", 5, "斗门区乾务镇社会福利中心"),
    ("斗门区", 6, "斗门区白蕉镇社会福利中心"),
    ("斗门区", 7, "斗门区斗门镇社会福利中心"),
    ("斗门区", 8, "斗门区辛港自然生态养老中心"),
    ("斗门区", 9, "珠海市华仁康养服务有限公司"),
    ("高新区", 1, "高新区社会福利中心（高新和熹）"),
    ("高新区", 2, "珠海高新区快乐寿星公寓"),
]


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def normalize(name: str) -> str:
    return "".join(unicodedata.normalize("NFKC", name).split())


def build() -> tuple[list[dict[str, object]], dict[str, object]]:
    input_bytes = INPUT.read_bytes()
    image_bytes = IMAGE.read_bytes()
    if sha(input_bytes) != EXPECTED_INPUT_SHA or sha(image_bytes) != EXPECTED_IMAGE_SHA:
        raise ValueError("Input CSV or official image bytes changed; review transcription again.")
    rows = list(csv.DictReader(io.StringIO(input_bytes.decode("utf-8-sig"))))
    selected = []
    for line, row in enumerate(rows, start=2):
        details = json.loads(row["details"])
        if row["city"] == "珠海" and details.get("source_row_number"):
            selected.append((line, row, details))
    if len(selected) != len(TRANSCRIPTION) or [int(d["source_row_number"]) for _, _, d in selected] != list(range(1, 26)):
        raise ValueError("Zhuhai image observation count/order differs from the reviewed source.")
    output = []
    for (line, row, details), (district, ordinal, visual_name) in zip(selected, TRANSCRIPTION):
        if details["district"] != district or normalize(row["institution_name"]) != normalize(visual_name):
            raise ValueError(f"Image transcription or district differs from CSV at line {line}.")
        output.append({
            "export_line": line,
            "source_row_number": int(details["source_row_number"]),
            "image_region": district,
            "image_item_ordinal": ordinal,
            "name_transcribed_from_image": visual_name,
            "name_in_batch10": row["institution_name"],
            "name_match": "exact" if row["institution_name"] == visual_name else "nfkc_whitespace",
            "image_sha256": EXPECTED_IMAGE_SHA,
            "review_method": "agent_visual_self_review",
            "other_fields_verified": False,
            "row_content_verified": False,
        })
    summary = {
        "input_sha256": EXPECTED_INPUT_SHA,
        "image_sha256": EXPECTED_IMAGE_SHA,
        "reviewed_on": "2026-11-14",
        "record_count": len(output),
        "exact_name_count": sum(r["name_match"] == "exact" for r in output),
        "visual_review_not_independent_human_verification": True,
        "source_hash_backfilled": False,
    }
    return output, summary


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    check = parser.parse_args().check
    records, summary = build()
    files = {
        "names.jsonl": "".join(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n" for row in records).encode(),
        "summary.json": (json.dumps(summary, ensure_ascii=False, sort_keys=True, indent=2) + "\n").encode(),
    }
    version = OUTPUT / ("v1-" + EXPECTED_INPUT_SHA[:12] + "-" + EXPECTED_IMAGE_SHA[:12])
    if check:
        for filename, content in files.items():
            if (version / filename).read_bytes() != content:
                raise ValueError(f"Output differs: {filename}")
    else:
        version.mkdir(parents=True, exist_ok=False)
        for filename, content in files.items():
            (version / filename).write_bytes(content)
    print(json.dumps({"output": str(version), **summary}, ensure_ascii=False))


if __name__ == "__main__":
    main()
