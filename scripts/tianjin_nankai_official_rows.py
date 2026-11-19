"""Validate Tianjin Nankai's frozen, anonymously visible open-data preview.

The portal reports 42 total records but embeds only 20 preview rows in HTML.
Only those 20 rows are projected; the contact column is always discarded.
"""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass
from pathlib import Path

from lxml import html


ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = ROOT / 'data/private/national-official-source/raw'
PREVIEW = RAW_DIR / 'tianjin-nankai-preview-20261117.html'
LICENSE = RAW_DIR / 'tianjin-open-license-20261117.html'
PREVIEW_BYTES = 65220
PREVIEW_SHA256 = 'a8ad003337e11ac5e270f56f134839e1280846a3e623a2c39e459d91e8256cf8'
LICENSE_BYTES = 15278
LICENSE_SHA256 = 'e91b7a6796877eae8a64a6618c6cc08d6af1355aa35eeb09098f8ccd4a1527ef'
ROW_COUNT = 20
SOURCE_URL = 'https://open.data.tj.gov.cn/sjjk/45e4998327f34ddd8dab66770999e631.htm'
LICENSE_URL = 'https://open.data.tj.gov.cn/xgxx/wzsm/index.htm'
TITLE = '南开区养老机构'
PUBLISHED_AT = '2022-04-02'
UPDATED_AT = '2022-04-11'
EXPECTED_SERIALS = ('1', '10', '11', '12', '13', '14', '15', '16', '17', '18',
                    '19', '2', '20', '21', '22', '23', '24', '25', '26', '27')
CONTACT = re.compile(
    r'(?<!\d)(?:1[3-9]\d{9}|0\d{2,3}[- ]?\d{7,8})(?!\d)'
    r'|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}', re.IGNORECASE,
)


@dataclass(frozen=True)
class TianjinOfficialRow:
    row_number: int  # 1-based position in the public preview array, not its source serial.
    source_serial: str
    name: str
    address: str


def _check_hash(raw: bytes, expected_sha: str, expected_bytes: int, label: str) -> None:
    if hashlib.sha256(raw).hexdigest() != expected_sha:
        raise ValueError(f'Tianjin {label} SHA-256 changed')
    if expected_sha in (PREVIEW_SHA256, LICENSE_SHA256) and len(raw) != expected_bytes:
        raise ValueError(f'Tianjin {label} size or SHA-256 changed')


def _document(raw: bytes):
    return html.fromstring(raw.decode('utf-8', errors='strict'))


def _text(document) -> str:
    return ' '.join(' '.join(document.itertext()).split())


def validate_tianjin_license(raw: bytes, *, expected_sha: str = LICENSE_SHA256) -> None:
    _check_hash(raw, expected_sha, LICENSE_BYTES, 'licence')
    text = _text(_document(raw))
    required = (
        '天津市信息资源统一开放平台',
        '无条件开放的公共数据资源享有可自由利用、自由传播与分享的权利',
        '注明数据资源来源为“天津市信息资源统一开放平台',
    )
    if not all(fragment in text for fragment in required):
        raise ValueError('Tianjin open-data licence changed')


def _public_text(value: object, row_number: int, field: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f'Tianjin row {row_number}: missing {field}')
    result = value.strip()
    if CONTACT.search(result):
        raise ValueError(f'Tianjin row {row_number}: contact data in {field}')
    return result


def parse_tianjin_rows(raw: bytes, *, expected_sha: str = PREVIEW_SHA256) -> list[TianjinOfficialRow]:
    _check_hash(raw, expected_sha, PREVIEW_BYTES, 'preview')
    document = _document(raw)
    text = _text(document)
    required = (TITLE, '无条件开放', '南开区人民政府',
                '2022-04-02 14:23', '2022-04-11 16:12')
    if not all(fragment in text for fragment in required):
        raise ValueError('Tianjin dataset metadata changed')
    scripts = [element.text or '' for element in document.xpath('//script')
               if 'columnNames' in (element.text or '') and 'previewCount' in (element.text or '')]
    if len(scripts) != 1 or 'var data =' not in scripts[0]:
        raise ValueError('Tianjin preview data script changed')
    payload_text = scripts[0].split('var data =', 1)[1].lstrip()
    payload, _ = json.JSONDecoder().raw_decode(payload_text)
    if not isinstance(payload, dict) or set(payload) != {
        'msg', 'code', 'columnNames', 'list', 'totalCount', 'previewCount'
    } or payload['msg'] != '获取数据成功' or payload['code'] != 200:
        raise ValueError('Tianjin preview structure changed')
    if payload['columnNames'] != ['地址', '联系电话', '序号', '名称']:
        raise ValueError('Tianjin preview columns changed')
    values = payload['list']
    if (not isinstance(values, list) or len(values) != ROW_COUNT
            or payload['previewCount'] != ROW_COUNT):
        raise ValueError('Tianjin preview row count changed')
    if payload['totalCount'] != 42:
        raise ValueError('Tianjin preview metadata changed')
    rows = []
    for row_number, item in enumerate(values, 1):
        if not isinstance(item, list) or len(item) != 4:
            raise ValueError(f'Tianjin row {row_number}: preview cells changed')
        address, _contact, serial, name = item
        if serial != EXPECTED_SERIALS[row_number - 1]:
            raise ValueError(f'Tianjin row {row_number}: source serial changed')
        rows.append(TianjinOfficialRow(
            row_number, serial, _public_text(name, row_number, 'name'),
            _public_text(address, row_number, 'address'),
        ))
    if len({row.name for row in rows}) != ROW_COUNT:
        raise ValueError('Tianjin preview duplicate names changed')
    return rows
