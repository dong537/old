"""Read the frozen Hunan eldercare-service institution workbook safely.

This parser returns source rows, not verified current operating institutions. It
deliberately never returns the workbook's responsible-person column.
"""

from __future__ import annotations

import hashlib
import io
import re
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

from openpyxl import load_workbook


ROOT = Path(__file__).resolve().parents[1]
HUNAN_XLSX = ROOT / "data/private/national-official-source/raw/hunan-2025.xlsx"
HUNAN_SHA256 = "014521751d040e339edbef8ca53aecf01d451d59bdc52e5bdfcd4f5189e02f97"
HUNAN_BYTES = 131638
HUNAN_ROWS = 1768
TITLE = "养老服务机构信息表（2025年版）"
HEADERS = (
    "单位名称", "单位所在行政区划", "单位通信详细地址",
    "法定代表人或负责人姓名", "床位总数",
)
CITY_SLUGS = {
    "长沙市": "changsha", "常德市": "changde", "衡阳市": "hengyang",
    "岳阳市": "yueyang", "益阳市": "yiyang", "邵阳市": "shaoyang",
    "湘潭市": "xiangtan", "株洲市": "zhuzhou", "郴州市": "chenzhou",
    "湘西土家族苗族自治州": "xiangxi", "怀化市": "huaihua",
    "娄底市": "loudi", "永州市": "yongzhou", "张家界市": "zhangjiajie",
}
CITY_COUNTS = {
    "长沙市": 207, "常德市": 203, "衡阳市": 189, "岳阳市": 154,
    "益阳市": 145, "邵阳市": 138, "湘潭市": 132, "株洲市": 128,
    "郴州市": 102, "湘西土家族苗族自治州": 99, "怀化市": 78,
    "娄底市": 78, "永州市": 69, "张家界市": 46,
}
CONTACT = re.compile(
    r"(?<![0-9])(?:1[3-9][0-9]{9}|0[0-9]{2,3}[- ]?[0-9]{7,8})(?![0-9])"
    r"|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", re.IGNORECASE,
)


@dataclass(frozen=True)
class HunanOfficialRow:
    row_number: int  # 1..1768 within the source table; suitable for public rowNumber.
    excel_row: int  # Physical workbook row, for audit only; first data row is 3.
    name: str
    city_name: str
    city_slug: str
    address: str | None
    beds: int  # Zero is a source value and must not become unknown.


def _required_text(value: object, field: str, excel_row: int) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"Hunan Excel row {excel_row}: missing {field}")
    text = value.strip()
    if CONTACT.search(text):
        raise ValueError(f"Hunan Excel row {excel_row}: contact data in {field}")
    return text


def parse_hunan_rows(raw: bytes, *, expected_sha: str = HUNAN_SHA256) -> list[HunanOfficialRow]:
    """Validate one frozen XLSX and return privacy-minimal source rows.

    `expected_sha` exists so structural-negative tests can rehash a changed
    workbook. Production callers must use the pinned default.
    """
    if expected_sha == HUNAN_SHA256 and len(raw) != HUNAN_BYTES:
        raise ValueError("Hunan source size or SHA-256 changed")
    if hashlib.sha256(raw).hexdigest() != expected_sha:
        raise ValueError("Hunan source SHA-256 changed")
    workbook = load_workbook(io.BytesIO(raw), read_only=True, data_only=True)
    if len(workbook.worksheets) != 1:
        raise ValueError("Hunan workbook sheet count changed")
    sheet = workbook.active
    if sheet.title != TITLE or sheet.max_column != 5:
        raise ValueError("Hunan workbook title or columns changed")
    title = tuple(next(sheet.iter_rows(min_row=1, max_row=1, max_col=5, values_only=True)))
    headers = tuple(next(sheet.iter_rows(min_row=2, max_row=2, max_col=5, values_only=True)))
    if title != (TITLE, None, None, None, None) or headers != HEADERS:
        raise ValueError("Hunan workbook headers changed")
    if sheet.max_row != HUNAN_ROWS + 2:
        raise ValueError(f"Hunan workbook expected {HUNAN_ROWS} rows")

    output: list[HunanOfficialRow] = []
    cities: Counter[str] = Counter()
    for excel_row, cells in enumerate(sheet.iter_rows(min_row=3, max_col=5, values_only=True), 3):
        name, region, address_value, _responsible_person, beds = cells
        name = _required_text(name, "name", excel_row)
        region = _required_text(region, "region", excel_row)
        parts = region.split("/")
        if len(parts) < 2 or len(parts) > 5 or parts[0] != "湖南省" or any(not part for part in parts):
            raise ValueError(f"Hunan Excel row {excel_row}: invalid city region")
        city_name = parts[1]
        if city_name not in CITY_SLUGS:
            raise ValueError(f"Hunan Excel row {excel_row}: unknown city")
        if address_value is None:
            address = None
        elif excel_row == 710 and address_value == 169:
            # The source cell is numeric 169; preserve it without inventing a street.
            address = "169"
        else:
            address = _required_text(address_value, "address", excel_row)
        if isinstance(beds, bool) or not isinstance(beds, int) or beds < 0:
            raise ValueError(f"Hunan Excel row {excel_row}: invalid beds")
        cities[city_name] += 1
        output.append(HunanOfficialRow(
            row_number=excel_row - 2, excel_row=excel_row, name=name,
            city_name=city_name, city_slug=CITY_SLUGS[city_name],
            address=address, beds=beds,
        ))
    if len(output) != HUNAN_ROWS or cities != CITY_COUNTS:
        raise ValueError(f"Hunan source row or city distribution changed: {dict(cities)}")
    if sum(row.address is None for row in output) != 3 or sum(row.beds == 0 for row in output) != 6:
        raise ValueError("Hunan source missing-address or zero-bed audit changed")
    return output


def load_hunan_rows(path: Path = HUNAN_XLSX) -> list[HunanOfficialRow]:
    return parse_hunan_rows(path.read_bytes())
