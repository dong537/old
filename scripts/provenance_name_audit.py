"""Find names in hash-verified source artifacts without assigning institution identity."""

from __future__ import annotations

import argparse
import csv
import hashlib
import html
import io
import json
import re
import unicodedata
import uuid
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
from typing import Any


HASH_FIELDS = ("source_sha256", "source_page_sha256", "sha256")
PROJECT_ROOT = Path(__file__).resolve().parents[1]
DATA_ROOT = PROJECT_ROOT / "data/private/guangdong-eldercare-source"
OBSERVATIONS = DATA_ROOT / "exports/20261114_batch10/机构名录_逐条来源.csv"
ARTIFACT_GROUPS = DATA_ROOT / "research-batch10/provenance-audit-20261114/source-url-artifacts.json"
OUTPUT_ROOT = DATA_ROOT / "research-batch12/provenance-name-audit"


class _VisibleText(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.hidden_depth = 0
        self.parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in ("script", "style", "noscript", "template"):
            self.hidden_depth += 1

    def handle_endtag(self, tag: str) -> None:
        if tag in ("script", "style", "noscript", "template") and self.hidden_depth:
            self.hidden_depth -= 1

    def handle_data(self, data: str) -> None:
        if not self.hidden_depth:
            self.parts.append(data)


def _decode(data: bytes) -> str:
    for codec in ("utf-8-sig", "gb18030"):
        try:
            return data.decode(codec)
        except UnicodeDecodeError:
            continue
    raise ValueError("来源文件既不是 UTF-8 也不是 GB18030 文本。")


def _normalized(value: str) -> str:
    return re.sub(r"\s+", "", unicodedata.normalize("NFKC", html.unescape(value)))


def _artifact_segments(path: Path, data: bytes) -> list[tuple[str, str]] | None:
    suffix = path.suffix.lower()
    if suffix in (".html", ".htm"):
        parser = _VisibleText()
        parser.feed(_decode(data))
        parser.close()
        return [("visible-html-text", "".join(parser.parts))]
    if suffix in (".txt", ".csv"):
        return [("text", _decode(data))]
    if suffix == ".xlsx":
        from openpyxl import load_workbook

        book = load_workbook(io.BytesIO(data), read_only=True, data_only=True)
        try:
            return [(f"{sheet.title}!{cell.coordinate}", str(cell.value))
                    for sheet in book for row in sheet for cell in row if cell.value is not None]
        finally:
            book.close()
    if suffix == ".xls":
        import xlrd

        book = xlrd.open_workbook(file_contents=data)
        return [(f"{sheet.name}!R{row + 1}C{column + 1}", str(sheet.cell_value(row, column)))
                for sheet in book.sheets() for row in range(sheet.nrows)
                for column in range(sheet.ncols) if sheet.cell_value(row, column) not in ("", None)]
    if suffix == ".pdf":
        import pdfplumber

        with pdfplumber.open(io.BytesIO(data)) as pdf:
            return [(f"page:{index + 1}", page.extract_text() or "")
                    for index, page in enumerate(pdf.pages)]
    return None


def _safe_artifact(root: Path, relative_path: str) -> Path:
    target = (root / relative_path).resolve()
    if not target.is_relative_to(root.resolve()):
        raise ValueError("原件路径越过私有数据目录。")
    if not target.is_file():
        raise FileNotFoundError(target)
    return target


def audit_missing_sha_rows(rows: list[dict[str, str]], groups: list[dict[str, Any]], root: Path) -> list[dict[str, Any]]:
    by_url: dict[str, dict[str, Any]] = {}
    for group in groups:
        url = group["source_url"]
        if url in by_url:
            raise ValueError(f"重复的来源 URL 分组：{url}")
        by_url[url] = group
    missing: list[tuple[int, dict[str, str]]] = []
    for export_line, row in enumerate(rows, start=2):
        details = json.loads(row["details"] or "{}")
        if not isinstance(details, dict):
            raise ValueError(f"第 {export_line} 行 details 不是对象。")
        if not any(details.get(field) for field in HASH_FIELDS):
            missing.append((export_line, row))
    counts = Counter(row["source_url"] for _, row in missing)
    if set(counts) != set(by_url):
        raise ValueError("缺 SHA 的 URL 集合与候选原件分组不一致。")
    for url, count in counts.items():
        if count != by_url[url]["missing_sha_rows"]:
            raise ValueError(f"{url} 缺 SHA 的行数与原件分组不一致。")

    prepared: dict[str, list[dict[str, Any]]] = {}
    for url, group in by_url.items():
        prepared[url] = []
        for artifact in group["artifacts"]:
            path = _safe_artifact(root, artifact["path"])
            data = path.read_bytes()
            digest = hashlib.sha256(data).hexdigest()
            if digest != artifact["sha256"]:
                raise ValueError(f"来源原件 SHA-256 不匹配：{artifact['path']}")
            segments = _artifact_segments(path, data)
            prepared[url].append({"path": artifact["path"], "sha256": digest,
                                  "role": artifact.get("role"), "segments": segments,
                                  "normalized": [_normalized(value) for _, value in segments]
                                  if segments is not None else None})

    result: list[dict[str, Any]] = []
    for export_line, row in missing:
        group = by_url[row["source_url"]]
        name = row["institution_name"].strip()
        if not name:
            raise ValueError(f"第 {export_line} 行机构名称为空。")
        normalized_name = _normalized(name)
        matches: list[dict[str, str | None]] = []
        unsupported: list[str] = []
        for artifact in prepared[row["source_url"]]:
            segments = artifact["segments"]
            if segments is None:
                unsupported.append(artifact["path"])
                continue
            for (location, value), normalized_value in zip(segments, artifact["normalized"]):
                method = "exact" if name in value else "normalized" if normalized_name in normalized_value else None
                if method:
                    matches.append({"artifact_path": artifact["path"],
                                    "artifact_sha256": artifact["sha256"],
                                    "artifact_role": artifact["role"],
                                    "location": location, "method": method})
                    break
        result.append({"export_line": export_line, "group_id": group["group_id"],
                       "city": row["city"], "institution_name": name,
                       "source_url": row["source_url"], "source_file": row.get("source_file", ""),
                       "source_published_at": row.get("source_published_at", ""),
                       "source_as_of": row.get("source_as_of", ""), "artifact_tier": group["tier"],
                       "name_match_status": "matched" if matches else "not_found" if len(unsupported) < len(prepared[row["source_url"]]) else "unsupported",
                       "matches": matches, "unsupported_artifacts": unsupported,
                       "row_content_verified": False})
    return result


def render_outputs(records: list[dict[str, Any]], input_sha: str, groups_sha: str) -> dict[str, str]:
    jsonl = "".join(json.dumps(record, ensure_ascii=False, sort_keys=True) + "\n" for record in records)
    csv_file = io.StringIO()
    fields = ("export_line", "city", "institution_name", "source_url", "source_file",
              "artifact_tier", "name_match_status", "matched_artifacts", "manual_review_required")
    writer = csv.DictWriter(csv_file, fieldnames=fields)
    writer.writeheader()
    for record in records:
        writer.writerow({"export_line": record["export_line"], "city": record["city"],
                         "institution_name": record["institution_name"], "source_url": record["source_url"],
                         "source_file": record["source_file"], "artifact_tier": record["artifact_tier"],
                         "name_match_status": record["name_match_status"],
                         "matched_artifacts": " | ".join(item["artifact_path"] for item in record["matches"]),
                         "manual_review_required": "true"})
    summary = {"schema_version": 1, "input_sha256": input_sha, "artifact_groups_sha256": groups_sha,
               "missing_sha_rows": len(records), "cities": len({record["city"] for record in records}),
               "name_match_status_counts": dict(Counter(record["name_match_status"] for record in records)),
               "matched_rows_with_paired_artifact_tier": sum(record["name_match_status"] == "matched" and
                   record["artifact_tier"] == "paired_local_artifact_needs_manual_link" for record in records),
               "row_content_verified": 0,
               "interpretation": "名称出现在哈希一致的本地原件中，仅证明名称级对应；仍需人工核对原件版本、行、字段与来源 URL，未回填逐条 SHA。"}
    return {"name-matches.jsonl": jsonl, "name-matches.csv": "\ufeff" + csv_file.getvalue(),
            "summary.json": json.dumps(summary, ensure_ascii=False, indent=2, sort_keys=True) + "\n"}


def save_outputs(output: Path, rendered: dict[str, str]) -> None:
    if output.exists():
        raise FileExistsError(f"相同输入的审核产物已存在：{output}；使用 --check 复核。")
    output.parent.mkdir(parents=True, exist_ok=True)
    staging = output.parent / f".staging-{uuid.uuid4()}"
    staging.mkdir()
    for filename, content in rendered.items():
        (staging / filename).write_bytes(content.encode("utf-8"))
    staging.rename(output)


def verify_outputs(output: Path, rendered: dict[str, str]) -> None:
    for filename, content in rendered.items():
        if (output / filename).read_bytes() != content.encode("utf-8"):
            raise ValueError(f"审核产物与输入或原件不一致：{filename}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="重算并核对已经生成的私有版本")
    args = parser.parse_args()
    input_bytes = OBSERVATIONS.read_bytes()
    groups_bytes = ARTIFACT_GROUPS.read_bytes()
    rows = list(csv.DictReader(io.StringIO(input_bytes.decode("utf-8-sig"))))
    groups = json.loads(groups_bytes)["groups"]
    records = audit_missing_sha_rows(rows, groups, DATA_ROOT)
    input_sha = hashlib.sha256(input_bytes).hexdigest()
    groups_sha = hashlib.sha256(groups_bytes).hexdigest()
    output = OUTPUT_ROOT / f"v2-{input_sha[:12]}-{groups_sha[:12]}"
    rendered = render_outputs(records, input_sha, groups_sha)
    if args.check:
        verify_outputs(output, rendered)
        print(json.dumps({"checked": str(output), "counts": Counter(record["name_match_status"] for record in records)}, ensure_ascii=False))
        return
    save_outputs(output, rendered)
    print(json.dumps({"output": str(output), "counts": Counter(record["name_match_status"] for record in records)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
