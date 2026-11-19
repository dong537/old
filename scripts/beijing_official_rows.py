"""Read Beijing's frozen starred-institution list without claiming full coverage.

The 459 names are the institutions holding star qualifications on 2025-12-31.
The separate community-station attachment and contact details are not projected.
"""

from __future__ import annotations

import hashlib
import io
import re
from dataclasses import dataclass

from docx import Document
from lxml import html


PAGE_URL = "https://mzj.beijing.gov.cn/art/2026/2/10/art_371_691012.html"
DOCUMENT_URL = "https://mzj.beijing.gov.cn/attach/0/a1220b640740409cb65b4324531db68a.docx"
PAGE_BYTES = 10581
PAGE_SHA256 = "9a16cfcc9f25cee80c6eaad7cdb484082588142eaf2df5938bfc00f9e07c4c7e"
DOCUMENT_BYTES = 279087
DOCUMENT_SHA256 = "ad41da1b9a8b9f557059d9edefcf64e549a60d070aa89d376f390e96311e6280"
PUBLISHED_AT = "2026-02-10"
AS_OF = "2025-12-31"
ROW_COUNT = 459
TITLE = "北京市星级养老机构名单"
SECTIONS = (
    (5, "一、五星级养老机构（11家）", 11),
    (4, "二、四星级养老机构（19家）", 19),
    (3, "三、三星级养老机构（92家）", 92),
    (2, "四、二星级养老机构（326家）", 326),
    (1, "五、一星级养老机构（11家）", 11),
)
CONTACT = re.compile(
    r"(?<!\d)(?:1[3-9]\d{9}|0\d{2,3}[- ]?\d{7,8})(?!\d)"
    r"|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", re.IGNORECASE,
)


@dataclass(frozen=True)
class BeijingOfficialRow:
    row_number: int
    source_paragraph_number: int
    name: str
    star_level: int
    city_name: str = "北京"
    city_slug: str = "beijing"
    address: None = None
    beds: None = None


def validate_beijing_page(raw: bytes) -> None:
    """Verify the government page identifying the exact attachment and scope."""
    if len(raw) != PAGE_BYTES or hashlib.sha256(raw).hexdigest() != PAGE_SHA256:
        raise ValueError("Beijing page size or SHA-256 changed")
    document = html.fromstring(raw.decode("utf-8", errors="strict"))
    published = document.xpath("//meta[@name='PubDate']/@content")
    title = document.xpath("//meta[@name='ArticleTitle']/@content")
    links = document.xpath("//a[contains(@href, '.docx')]/@href")
    body = " ".join(document.text_content().split())
    if published != ["2026-02-10 15:01"] or title != ["关于发布全市星级养老服务机构名单的公告"]:
        raise ValueError("Beijing page title or publication date changed")
    if links != ["/attach/0/a1220b640740409cb65b4324531db68a.docx",
                 "/attach/0/45747a0f548040c793d930ff75a8a028.docx"]:
        raise ValueError("Beijing page attachments changed")
    if "截至2025年12月31日" not in body or "养老机构共有459家" not in body:
        raise ValueError("Beijing page scope or count changed")
    if "社区养老服务驿站共有832家" not in body:
        raise ValueError("Beijing page separate community-station count changed")


def parse_beijing_rows(raw: bytes, *, expected_sha: str = DOCUMENT_SHA256) -> list[BeijingOfficialRow]:
    """Validate the DOCX and return only source sequence, name, and grade."""
    if expected_sha == DOCUMENT_SHA256 and len(raw) != DOCUMENT_BYTES:
        raise ValueError("Beijing document size or SHA-256 changed")
    if hashlib.sha256(raw).hexdigest() != expected_sha:
        raise ValueError("Beijing document SHA-256 changed")
    document = Document(io.BytesIO(raw))
    if document.tables:
        raise ValueError("Beijing document has unexpected tables")
    nonempty = [
        (number, " ".join(paragraph.text.split()))
        for number, paragraph in enumerate(document.paragraphs, 1)
        if paragraph.text.strip()
    ]
    if [text for _, text in nonempty[:2]] != ["附件1", TITLE]:
        raise ValueError("Beijing document title changed")
    position = 2
    records: list[BeijingOfficialRow] = []
    for level, heading, count in SECTIONS:
        if position >= len(nonempty) or nonempty[position][1] != heading:
            raise ValueError(f"Beijing star level {level} heading changed")
        section = nonempty[position + 1:position + count + 1]
        if len(section) != count or any("星级养老机构" in name for _, name in section):
            raise ValueError(f"Beijing star level {level} count changed")
        for paragraph_number, name in section:
            if CONTACT.search(name):
                raise ValueError(f"Beijing source row {len(records) + 1}: contact in name")
            records.append(BeijingOfficialRow(
                row_number=len(records) + 1,
                source_paragraph_number=paragraph_number,
                name=name,
                star_level=level,
            ))
        position += count + 1
    if position != len(nonempty) or len(records) != ROW_COUNT:
        raise ValueError("Beijing document count or trailing content changed")
    if len({row.name for row in records}) != ROW_COUNT:
        raise ValueError("Beijing document contains duplicate names")
    return records
