#!/usr/bin/env python3
"""Extract fixed Guangzhou government service tables from hash-pinned HTML."""

import csv
import hashlib
import json
from pathlib import Path

from lxml import html


ROOT = Path(__file__).resolve().parents[1]
ARCHIVE_DIR = ROOT / "data" / "raw" / "services"
MANIFEST_PATH = ARCHIVE_DIR / "source-manifest.json"


def text(node):
    value = node if isinstance(node, str) else " ".join(node.itertext())
    return " ".join(value.split())


def extract_archive(archive):
    html_path = ARCHIVE_DIR / archive["htmlFile"]
    raw = html_path.read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    if digest != archive["htmlSha256"]:
        raise ValueError(f"{archive['htmlFile']} SHA-256 mismatch: {digest}")

    document = html.fromstring(raw, parser=html.HTMLParser(encoding="utf-8", no_network=True))
    article_title = document.xpath("string(//meta[@name='ArticleTitle']/@content)")
    published_at = document.xpath("string(//meta[@name='PubDate']/@content)")
    source_url = document.xpath("string(//meta[@name='Url']/@content)")
    title = text(article_title)
    if title != archive["articleTitle"]:
        raise ValueError(f"{archive['htmlFile']} ArticleTitle changed: {title}")
    if published_at[:10] != archive["source"]["publishedAt"]:
        raise ValueError(f"{archive['htmlFile']} PubDate does not match source metadata: {published_at}")
    if source_url != archive["source"]["url"]:
        raise ValueError(f"{archive['htmlFile']} canonical source URL changed: {source_url}")

    matches = []
    for table in document.xpath("//table"):
        rows = table.xpath("./tr | ./thead/tr | ./tbody/tr | ./tfoot/tr")
        if not rows:
            continue
        headers = [text(cell) for cell in rows[0].xpath("./th | ./td")]
        if headers == archive["headers"]:
            matches.append((headers, rows[1:]))
    if len(matches) != 1:
        raise ValueError(f"{archive['htmlFile']} expected one exact-header table; found {len(matches)}")

    headers, body = matches[0]
    records = []
    for index, row in enumerate(body, start=1):
        values = [text(cell) for cell in row.xpath("./th | ./td")]
        if len(values) != len(headers):
            raise ValueError(f"{archive['htmlFile']} row {index} has {len(values)} cells")
        if values[0] != str(index):
            raise ValueError(f"{archive['htmlFile']} source row sequence changed at {index}: {values[0]}")
        records.append(values)
    if len(records) != archive["expectedRows"]:
        raise ValueError(f"{archive['htmlFile']} expected {archive['expectedRows']} rows; found {len(records)}")

    output = ARCHIVE_DIR / archive["tableFile"]
    with output.open("w", newline="", encoding="utf-8") as stream:
        writer = csv.writer(stream, lineterminator="\n")
        writer.writerow(headers)
        writer.writerows(records)
    csv_digest = hashlib.sha256(output.read_bytes()).hexdigest()
    print(json.dumps({"file": archive["tableFile"], "rows": len(records), "sha256": csv_digest}, ensure_ascii=False))


def main():
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    if manifest.get("schemaVersion") != 1 or len(manifest.get("archives", [])) != 2:
        raise ValueError("Unsupported service archive manifest")
    for archive in manifest["archives"]:
        extract_archive(archive)


if __name__ == "__main__":
    main()
