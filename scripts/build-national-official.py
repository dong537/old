"""Project frozen government tables and PDF into contact-free source records.

The public records are source observations, not a current or complete institution roster.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import sys
import tempfile
import uuid
from collections import Counter
from pathlib import Path

from lxml import html

from beijing_official_rows import (
    AS_OF as BEIJING_AS_OF, DOCUMENT_BYTES as BEIJING_BYTES,
    DOCUMENT_SHA256 as BEIJING_SHA256, PAGE_URL as BEIJING_SOURCE_URL,
    PUBLISHED_AT as BEIJING_PUBLISHED_AT, ROW_COUNT as BEIJING_ROWS,
    TITLE as BEIJING_TITLE, parse_beijing_rows, validate_beijing_page,
)
from gaoping_official_rows import (
    WORKBOOK_BYTES as GAOPING_BYTES, WORKBOOK_SHA256 as GAOPING_SHA256,
    PUBLISHED_AT as GAOPING_PUBLISHED_AT, ROW_COUNT as GAOPING_ROWS,
    SOURCE_URL as GAOPING_SOURCE_URL, TITLE as GAOPING_TITLE,
    parse_gaoping_rows, validate_gaoping_page,
)
from dazhou_official_rows import (
    PREVIEW_BYTES as DAZHOU_BYTES, PREVIEW_SHA256 as DAZHOU_SHA256,
    PUBLISHED_AT as DAZHOU_PUBLISHED_AT, ROW_COUNT as DAZHOU_ROWS,
    SOURCE_URL as DAZHOU_SOURCE_URL, TITLE as DAZHOU_TITLE,
    parse_dazhou_rows, validate_dazhou_catalog,
)
from dazhou_county_official_rows import (
    SOURCES as DAZHOU_COUNTY_SOURCES,
    parse_dazhou_county_rows, validate_dazhou_county_catalog,
)
from hunan_official_rows import HUNAN_BYTES, HUNAN_ROWS, HUNAN_SHA256, parse_hunan_rows
from hubei_official_rows import (
    HUBEI_BYTES, HUBEI_ROWS, HUBEI_SHA256, PUBLISHED_AT as HUBEI_PUBLISHED_AT,
    SOURCE_URL as HUBEI_SOURCE_URL, TITLE as HUBEI_TITLE, parse_hubei_rows,
)
from nanjing_official_rows import SOURCE_BYTES as NANJING_BYTES, SOURCE_SHA256 as NANJING_SHA256, ROW_COUNT as NANJING_ROWS, validate_nanjing_source
from shijiazhuang_official_rows import (
    PDF_BYTES as SHIJIAZHUANG_BYTES, PDF_SHA256 as SHIJIAZHUANG_SHA256,
    PUBLISHED_AT as SHIJIAZHUANG_PUBLISHED_AT, SOURCE_URL as SHIJIAZHUANG_SOURCE_URL,
    SOURCE_TITLE as SHIJIAZHUANG_TITLE, parse_shijiazhuang_rows,
)
from tianjin_nankai_official_rows import (
    PREVIEW_BYTES as TIANJIN_BYTES, PREVIEW_SHA256 as TIANJIN_SHA256,
    ROW_COUNT as TIANJIN_ROWS, SOURCE_URL as TIANJIN_SOURCE_URL,
    TITLE as TIANJIN_TITLE, PUBLISHED_AT as TIANJIN_PUBLISHED_AT,
    parse_tianjin_rows, validate_tianjin_license,
)
from zhejiang_official_rows import (
    AS_OF as ZHEJIANG_AS_OF, CATALOG_URL as ZHEJIANG_SOURCE_URL,
    CSV_BYTES as ZHEJIANG_BYTES, CSV_SHA256 as ZHEJIANG_SHA256,
    PUBLIC_ROW_COUNT as ZHEJIANG_PUBLIC_ROWS, ROW_COUNT as ZHEJIANG_ROWS,
    load_zhejiang_rows, project_public_zhejiang_rows,
)
from wenzhou_6724_official_rows import (
    ARCHIVE_BYTES as WENZHOU_6724_BYTES, ARCHIVE_SHA256 as WENZHOU_6724_SHA256,
    DATASET_URL as WENZHOU_6724_URL, LICENSE as WENZHOU_6724_LICENSE,
    METADATA as WENZHOU_6724_METADATA, PUBLISHED_AT as WENZHOU_6724_PUBLISHED_AT,
    ROW_COUNT as WENZHOU_6724_ROWS,
    parse_wenzhou_6724_rows, validate_wenzhou_6724_pages,
)
from shandong_luxi_official_rows import (
    AS_OF as LUXI_AS_OF, CATALOG as LUXI_CATALOG,
    OLDER_BYTES as LUXI_BYTES, OLDER_SHA256 as LUXI_SHA256,
    NEWER as LUXI_NEWER, NEWER_ROW_COUNT as LUXI_NEWER_ROWS,
    PUBLISHED_AT as LUXI_PUBLISHED_AT, ROW_COUNT as LUXI_ROWS,
    SOURCE_URL as LUXI_SOURCE_URL, TITLE as LUXI_TITLE,
    parse_luxi_rows, validate_luxi_catalog,
)
from shandong_taian_official_rows import (
    AS_OF as TAIAN_AS_OF, CATALOG as TAIAN_CATALOG,
    OLDER_BYTES as TAIAN_BYTES, OLDER_SHA256 as TAIAN_SHA256,
    NEWER as TAIAN_NEWER, NEWER_ROW_COUNT as TAIAN_NEWER_ROWS,
    PUBLISHED_AT as TAIAN_PUBLISHED_AT, ROW_COUNT as TAIAN_ROWS,
    SOURCE_URL as TAIAN_SOURCE_URL, TITLE as TAIAN_TITLE,
    parse_taian_rows, validate_taian_catalog,
)
from shandong_jinan_official_rows import (
    CATALOG as JINAN_CATALOG, LATEST as JINAN_LATEST,
    LATEST_ROW_COUNT as JINAN_LATEST_ROWS,
    OLDER_BYTES as JINAN_BYTES, OLDER_SHA256 as JINAN_SHA256,
    PUBLISHED_AT as JINAN_PUBLISHED_AT, ROW_COUNT as JINAN_ROWS,
    SOURCE_URL as JINAN_SOURCE_URL, TITLE as JINAN_TITLE,
    parse_jinan_rows, validate_jinan_catalog,
)
from shandong_weifang_official_rows import (
    AS_OF as WEIFANG_AS_OF, CATALOG as WEIFANG_CATALOG,
    LATEST_BYTES as WEIFANG_BYTES, LATEST_SHA256 as WEIFANG_SHA256,
    PRIOR as WEIFANG_PRIOR, PUBLISHED_AT as WEIFANG_PUBLISHED_AT,
    ROW_COUNT as WEIFANG_ROWS, SOURCE_URL as WEIFANG_SOURCE_URL,
    TITLE as WEIFANG_TITLE, parse_weifang_rows, validate_weifang_catalog,
)
from panzhihua_official_rows import (
    AS_OF as PANZHIHUA_AS_OF, CATALOG as PANZHIHUA_CATALOG,
    FULL_PREVIEW_BYTES as PANZHIHUA_BYTES, FULL_PREVIEW_SHA256 as PANZHIHUA_SHA256,
    PUBLISHED_AT as PANZHIHUA_PUBLISHED_AT, ROW_COUNT as PANZHIHUA_ROWS,
    SCOPE as PANZHIHUA_SCOPE, SOURCE_URL as PANZHIHUA_SOURCE_URL,
    TITLE as PANZHIHUA_TITLE, parse_panzhihua_rows, validate_panzhihua_catalog,
)


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "data/private/national-official-source/raw"
SOURCE_MANIFEST = ROOT / "data/raw/national-official-source-manifest.json"
OUTPUT_DIR = ROOT / "public/data/national-official"
ARCHIVED_AT = "2026-11-17"
CHUNK_SIZE = 100
DAZHOU_COUNTY_BY_ID = {source.source_id: source for source in DAZHOU_COUNTY_SOURCES.values()}
SHUCHENG_SOURCE_ID = "ah-sc-20261014"
SHUCHENG_PREVIEW_BYTES = 7206
SHUCHENG_PREVIEW_SHA256 = "5ee9d2902167ab88e16ed4b3aba0fe714d6bb3d944a146373611582cd6aa0bc0"
SHUCHENG_CATALOG_NAME = "anhui-shucheng-catalog-20261117.html"
SHUCHENG_CATALOG_BYTES = 72807
SHUCHENG_CATALOG_SHA256 = "4bcdd03d4a3a8ad021b1672cfc8f3499c24f394f330b53dec472e4703c8d1e0f"
SHUCHENG_ROWS = 12
SHUCHENG_HEADERS = ("XH", "FRDJLX", "YLJGMC", "BAJG", "DZ", "FDDBR", "LXDH",
                    "TYSHXYDM", "CLSJ", "ZCZJ")

HEADERS = {
    "cq-mzj-20251222": ("序号", "名称", "地址", "入住老年人总数", "从业人员数", "床位数", "提供服务内容"),
    "js-zjg-20261029": ("序号", "单位名称", "单位地址", "机构床位数", "机构联系电话"),
    "fj-mzt-undated": ("序号", "机构名称", "通讯地址"),
}
SOURCE_INFO = {
    "cq-mzj-20251222": {
        "filename": "chongqing-20251222.html",
        "province": "重庆市", "provinceSlug": "chongqing",
        "city": "重庆", "citySlug": "chongqing",
        "scope": "重庆市民政局公开的养老服务机构表；原文未说明资料截止期",
        "title": "养老服务机构",
        "url": "https://mzj.cq.gov.cn/mzbm/mzjg/ylfwjg/202512/t20251222_15260877.html",
        "publishedAt": "2025-12-22", "asOf": None,
    },
    "js-zjg-20261029": {
        "filename": "zhangjiagang-20261029.html",
        "province": "江苏省", "provinceSlug": "jiangsu",
        "city": "苏州", "citySlug": "suzhou",
        "scope": "仅张家港市民政监管养老机构，不覆盖整个苏州市",
        "title": "张家港市民政监管养老机构名单（截至2026.9.20）",
        "url": "https://www.suzhou.gov.cn/szsrmzf/gzjzec/202610/39c57d1c1e704be29dd625b5aa7b6d96.shtml",
        "publishedAt": "2026-10-29", "asOf": "2026-09-20",
    },
    "fj-mzt-undated": {
        "filename": "fujian-undated.html",
        "province": "福建省", "provinceSlug": "fujian",
        "city": None, "cityDisplay": "全省", "citySlug": "provincewide",
        "scope": "福建省民政厅便民查询逐名来源；未注明发布日及资料截止期，含社区照料等设施，不代表当前全省在营养老机构全量",
        "title": "福建省养老机构",
        "url": "https://mzt.fujian.gov.cn/bmcx_ls/fjsyljg/",
        "publishedAt": None, "asOf": None,
    },
    "hn-mzt-20260112": {
        "filename": "hunan-2025.xlsx",
        "province": "湖南省", "provinceSlug": "hunan",
        "city": None,
        "scope": "湖南省民政厅《养老服务机构信息表（2025年版）》附表；金民工程数据截至2026-01-09，按原表地市分组，混含敬老院、医院与社区设施，不证明当前在营",
        "title": "养老服务机构信息表（2025年版）",
        "url": "https://mzt.hunan.gov.cn/mzt/xxgk/tzgg/202604/t20260414_33953898.html",
        "publishedAt": "2026-01-12", "asOf": "2026-01-09",
    },
    "js-nj-20260310": {
        "filename": "nanjing-202602.html",
        "province": "江苏省", "provinceSlug": "jiangsu",
        "city": "南京", "citySlug": "nanjing",
        "scope": "仅南京市民政局《全市养老机构明细表公示》，资料截至2026年2月底；不证明当前在营或空床",
        "title": "全市养老机构明细表公示（截至2026年2月底）",
        "url": "https://mzj.nanjing.gov.cn/njsmzj/ztzl/njylfw/fwjgxx/202603/t20260310_5803250.html",
        "publishedAt": "2026-03-10", "asOf": "2026年2月底",
    },
    "hb-qj-20260615": {
        "filename": "hubei-wuhancircle-202605.html",
        "province": "湖北省", "provinceSlug": "hubei",
        "city": None,
        "scope": "仅武汉都市圈9市截至2026年5月底已登记备案且正常运营的养老机构公示名单；不代表当前在营、湖北省全量或空床",
        "title": HUBEI_TITLE,
        "url": HUBEI_SOURCE_URL,
        "publishedAt": HUBEI_PUBLISHED_AT, "asOf": "2026年5月底",
    },
    "he-sjz-20260320": {
        "filename": "shijiazhuang-2026.pdf",
        "province": "河北省", "provinceSlug": "hebei",
        "city": "石家庄", "citySlug": "shijiazhuang",
        "scope": "仅石家庄市民政局公开 PDF：265 个编号、268 条物理行，含 3 条未编号院区；名称与地址按前后两半同页同行严格对齐。网页标注 2026-03-20，附件路径含 2026-03-30，版本时间差待核；原件未注明资料截至期，不证明当前在营或空床。",
        "title": SHIJIAZHUANG_TITLE, "url": SHIJIAZHUANG_SOURCE_URL,
        "publishedAt": SHIJIAZHUANG_PUBLISHED_AT, "asOf": None,
    },
    "bj-mzj-20260210": {
        "filename": "beijing-stars-20251231.docx",
        "province": "北京市", "provinceSlug": "beijing",
        "city": "北京", "citySlug": "beijing",
        "scope": "北京市民政局截至2025-12-31具备星级资格的459家养老机构名单；仅覆盖星级资格机构，不是北京市全部养老机构。原附件按星级分组，本站此版仅展示原文名称，不展示逐家星级、地址或床位，也不证明当前资格或在营。",
        "title": BEIJING_TITLE, "url": BEIJING_SOURCE_URL,
        "publishedAt": BEIJING_PUBLISHED_AT, "asOf": BEIJING_AS_OF,
    },
    "sc-ncgp-20250220": {
        "filename": "gaoping-202502.xlsx",
        "province": "四川省", "provinceSlug": "sichuan",
        "city": "南充", "citySlug": "nanchong",
        "scope": "仅南充市高坪区2025年2月公示的36条逐名来源；原表混含中央厨房、社会工作服务中心等，不能认定为独立养老机构，也不代表南充市或四川省当前在营全量。原文未说明精确资料截止日。",
        "title": GAOPING_TITLE, "url": GAOPING_SOURCE_URL,
        "publishedAt": GAOPING_PUBLISHED_AT, "asOf": None,
    },
    "sc-dz-20260814": {
        "filename": "dazhou-preview-20261117.json",
        "province": "四川省", "provinceSlug": "sichuan",
        "city": "达州", "citySlug": "dazhou",
        "scope": "来源为达州公共数据开放网、数源部门达州市民政局；目录标注无条件开放，元数据2026-08-14更新且称179条，但2026-11-17匿名预览仅30条。本站只展示实际取得的30条，涉及通川区、达川区及1条区县未说明记录，不代表达州市全量或当前在营。原文未说明资料截至期，床位为来源快照；依据数据使用许可注明来源，需定期反馈利用情况。",
        "title": DAZHOU_TITLE, "url": DAZHOU_SOURCE_URL,
        "publishedAt": DAZHOU_PUBLISHED_AT, "asOf": None,
    },
    **{
        source.source_id: {
            "filename": source.preview.name,
            "province": "四川省", "provinceSlug": "sichuan",
            "city": "达州", "citySlug": "dazhou",
            "scope": (
                f"仅达州市{source.county}开放数据目录的{source.row_count}条实际匿名预览来源行；"
                "来源第N条按冻结预览位次，不等于原表序号。"
                "目录更新于2026-07-22，逐家资料截至日未知；"
                "不代表全市或该区县当前在营全量，也不证明当前空床。"
                "原表含个人或联系字段，本站仅展示名称与地址；"
                "依据达州公共数据开放许可注明来源，并需定期反馈利用情况。"
            ),
            "title": source.title, "url": source.url,
            "publishedAt": source.published_at, "asOf": None,
        }
        for source in DAZHOU_COUNTY_SOURCES.values()
    },
    "sc-pzh-20260901": {
        "filename": "panzhihua-43f1109ec4c04fde854889873395d4cd-full-20261117.json",
        "province": "四川省", "provinceSlug": "sichuan",
        "city": "攀枝花", "citySlug": "panzhihua",
        "scope": PANZHIHUA_SCOPE + "；2026-11-17匿名取得21/21条。原件未提供地址或逐家资料截至日；床位是来源快照，不是当前空床。依据攀枝花公共数据开放许可注明来源，并应定期反馈利用情况。",
        "title": PANZHIHUA_TITLE, "url": PANZHIHUA_SOURCE_URL,
        "publishedAt": PANZHIHUA_PUBLISHED_AT, "asOf": PANZHIHUA_AS_OF,
    },
    "sd-hz-luxi-20250627": {
        "filename": "shandong-luxi-20250627.csv",
        "province": "山东省", "provinceSlug": "shandong",
        "city": "菏泽", "citySlug": "heze",
        "scope": "仅菏泽鲁西新区开放数据目录的2025-06-27 版本文件23条，资料截至日未说明；2026-11-10版本仅5行且均在旧版中，缩减原因不明。不是菏泽市或山东省全量，也不证明当前在营或空床。",
        "title": LUXI_TITLE, "url": LUXI_SOURCE_URL,
        "publishedAt": LUXI_PUBLISHED_AT, "asOf": LUXI_AS_OF,
    },
    "sd-taian-20250724": {
        "filename": "shandong-taian-20250724.csv",
        "province": "山东省", "provinceSlug": "shandong",
        "city": "泰安", "citySlug": "taian",
        "scope": "仅泰安市民政局开放数据目录的2025-07-24 版本文件93条；2026-08-01 版本仅10行且均为旧版子集，缩减原因未说明。本站展示历史来源行，不代表泰安市或山东省当前在营全量；原件开办时间不等于资料截止日，不展示区划代码或开办时间。依据山东公共数据开放网许可注明来源。",
        "title": TAIAN_TITLE, "url": TAIAN_SOURCE_URL,
        "publishedAt": TAIAN_PUBLISHED_AT, "asOf": TAIAN_AS_OF,
    },
    "sd-weifang-20261110": {
        "filename": "shandong-weifang-20261110.csv",
        "province": "山东省", "provinceSlug": "shandong",
        "city": "潍坊", "citySlug": "weifang",
        "scope": "仅潍坊市民政局开放数据《养老机构信息》2026-11-10文件的187条来源行，原表全部为2025-04-10逐行统计时间；2025-07-03文件内容相同但行序不同。床位为当时总床位，不是当前空床；不证明当前在营或潍坊全市全量。依据山东公共数据开放网许可注明来源并定期反馈使用情况。",
        "title": WEIFANG_TITLE, "url": WEIFANG_SOURCE_URL,
        "publishedAt": WEIFANG_PUBLISHED_AT, "asOf": WEIFANG_AS_OF,
    },
    "tj-nankai-20220411": {
        "filename": "tianjin-nankai-preview-20261117.html",
        "province": "天津市", "provinceSlug": "tianjin",
        "city": "天津", "citySlug": "tianjin",
        "scope": "天津市信息资源统一开放平台无条件开放的南开区养老机构数据；仅南开区，目录元数据称42条，但2026-11-17匿名预览仅20条，本地只发布实际取得的20条。来源第N条按冻结预览顺序，不等于原表序号。原资料截至日未说明，不代表天津全市全量或当前在营；联系电话整列排除。",
        "title": TIANJIN_TITLE, "url": TIANJIN_SOURCE_URL,
        "publishedAt": TIANJIN_PUBLISHED_AT, "asOf": None,
    },
    "zj-prov-20260902": {
        "filename": "zhejiang-provincial-yljg-20260902.csv",
        "province": "浙江省", "provinceSlug": "zhejiang",
        "city": None,
        "scope": "浙江省数据开放平台《养老机构信息》2026-11-17下载快照；原件1,147行，仅含宁波、台州、杭州、衢州、绍兴五市，去除263条完全重复的额外行，并排除原件212条泛名行（去重后210条），公开展示674条来源行，不代表全省机构总数或当前在营。原件55条空地址、148条床位未知；公开行仍有49条空地址。文件统一更新时间2026-08-21，不等于逐家资料截至日；床位数不是当前空床。本应用中的该数据受浙江省数据开放平台数据开放授权许可使用协议约束。",
        "title": "养老机构信息", "url": ZHEJIANG_SOURCE_URL,
        "publishedAt": None, "asOf": ZHEJIANG_AS_OF,
    },
    SHUCHENG_SOURCE_ID: {
        "filename": "anhui-shucheng-catalog-preview-20261117.html",
        "province": "安徽省", "provinceSlug": "anhui",
        "city": "六安", "citySlug": "luan",
        "scope": "仅舒城县民政局《舒城县已备案养老机构清单》的完整匿名预览12条，目录2026-10-14更新，逐家资料截至日未知；不代表六安市或安徽省全量，也不证明当前在营、当前备案状态或空床。原表含个人及联系字段，本站只展示名称与地址；依据六安市公共数据开放网许可注明来源，并须定期反馈利用情况。",
        "title": "舒城县已备案养老机构清单",
        "url": "https://data.luan.gov.cn/oportal/catalog/e287335fdd2246b8aee9ed99236299d9",
        "publishedAt": "2026-06-04", "asOf": None,
    },
    "sd-jinan-20250721": {
        "filename": "shandong-jinan-202507210938.csv",
        "province": "山东省", "provinceSlug": "shandong",
        "city": "济南", "citySlug": "jinan",
        "scope": "仅济南市民政局开放数据目录2025-07-21版本CSV的135条历史来源行；目录所列数据时间范围为2023年08月至2024年05月，逐家资料截至日未知。2024-05版本与本版文件内容相同；2026-07-21版本仅20行且均为旧版子集，缩减原因未知，不能据此推断其余机构停业。历史床位总数不是当前空床，也不证明济南市或山东省当前在营全量。依据山东公共数据开放网许可注明来源并定期反馈利用情况。",
        "title": JINAN_TITLE, "url": JINAN_SOURCE_URL,
        "publishedAt": JINAN_PUBLISHED_AT, "asOf": None,
    },
    "zj-wz-20220826": {
        "filename": "wenzhou-care-homes-6724-current-20261117.zip",
        "province": "浙江省", "provinceSlug": "zhejiang",
        "city": "温州", "citySlug": "wenzhou",
        "scope": "温州市公共数据开放平台《温州养老院信息》2026-11-17下载的196条历史来源行；目录于2022-08-26更新，逐家资料截至日未知。仅涉及温州11个区县，不证明温州全量或当前在营；床位为原表总床位，不是当前空床，10行分项之和与总数不符时保留原表总数。按开放协议注明来源；应用须备案，数据下线删除。原表法定代表人及机构简介不公开。",
        "title": "温州养老院信息", "url": WENZHOU_6724_URL,
        "publishedAt": WENZHOU_6724_PUBLISHED_AT, "asOf": None,
    },
}
EXPECTED_AUDIT = {
    "cq-mzj-20251222": {"serialWhitespace": 37, "numericWhitespace": 26, "missingBeds": 16, "duplicateNameGroups": 6},
    "js-zjg-20261029": {"serialWhitespace": 0, "numericWhitespace": 0, "missingBeds": 0, "duplicateNameGroups": 0},
    "fj-mzt-undated": {"serialWhitespace": 0, "numericWhitespace": 0, "missingBeds": 944, "duplicateNameGroups": 0},
}
MOBILE = re.compile(r"(?<!\d)(?:(?:\+86|0086)[\s-]*)?1[3-9](?:[\s-]*\d){9}(?!\d)")
LANDLINE = re.compile(r"(?<!\d)0\d{2,3}[- ]?\d{7,8}(?!\d)")
EMAIL = re.compile(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", re.IGNORECASE)
SHA256 = re.compile(r"[0-9a-f]{64}\Z")
DIGITS_WITH_SPACES = re.compile(r"[0-9]+(?:\s+[0-9]+)*\Z")


def json_bytes(value: object) -> bytes:
    return (json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False) + "\n").encode("utf-8")


def load_source_manifest(path: Path) -> list[dict]:
    manifest = json.loads(path.read_text(encoding="utf-8"))
    if set(manifest) != {"schemaVersion", "sources"} or manifest["schemaVersion"] != 1:
        raise ValueError("official source manifest schema differs from version 1")
    sources = manifest["sources"]
    if not isinstance(sources, list) or [source.get("id") for source in sources] != list(SOURCE_INFO):
        raise ValueError("official source IDs or order changed")
    for source in sources:
        if set(source) != {"id", "filename", "sha256", "bytes", "rowCount"}:
            raise ValueError("official source manifest has unexpected fields")
        if (source["filename"] != SOURCE_INFO[source["id"]]["filename"]
                or SHA256.fullmatch(str(source["sha256"])) is None
                or not isinstance(source["bytes"], int) or source["bytes"] <= 0
                or not isinstance(source["rowCount"], int) or source["rowCount"] <= 0):
            raise ValueError("official source manifest contains invalid metadata")
        if source["id"] == "hn-mzt-20260112" and (source["sha256"], source["bytes"], source["rowCount"]) != (HUNAN_SHA256, HUNAN_BYTES, HUNAN_ROWS):
            raise ValueError("Hunan source lock differs from frozen workbook")
        if source["id"] == "js-nj-20260310" and (source["sha256"], source["bytes"], source["rowCount"]) != (NANJING_SHA256, NANJING_BYTES, NANJING_ROWS):
            raise ValueError("Nanjing source lock differs from frozen HTML")
        if source["id"] == "hb-qj-20260615" and (source["sha256"], source["bytes"], source["rowCount"]) != (HUBEI_SHA256, HUBEI_BYTES, HUBEI_ROWS):
            raise ValueError("Hubei source lock differs from frozen HTML")
        if source["id"] == "he-sjz-20260320" and (source["sha256"], source["bytes"], source["rowCount"]) != (SHIJIAZHUANG_SHA256, SHIJIAZHUANG_BYTES, 268):
            raise ValueError("Shijiazhuang source lock differs from frozen PDF")
        if source["id"] == "bj-mzj-20260210" and (source["sha256"], source["bytes"], source["rowCount"]) != (BEIJING_SHA256, BEIJING_BYTES, BEIJING_ROWS):
            raise ValueError("Beijing source lock differs from frozen DOCX")
        if source["id"] == "sc-ncgp-20250220" and (source["sha256"], source["bytes"], source["rowCount"]) != (GAOPING_SHA256, GAOPING_BYTES, GAOPING_ROWS):
            raise ValueError("Gaoping source lock differs from frozen workbook")
        if source["id"] == "sc-dz-20260814" and (source["sha256"], source["bytes"], source["rowCount"]) != (DAZHOU_SHA256, DAZHOU_BYTES, DAZHOU_ROWS):
            raise ValueError("Dazhou source lock differs from frozen preview")
        if source["id"] in DAZHOU_COUNTY_BY_ID:
            county = DAZHOU_COUNTY_BY_ID[source["id"]]
            if (source["sha256"], source["bytes"], source["rowCount"]) != (
                county.preview_sha256, county.preview_bytes, county.row_count,
            ):
                raise ValueError(f"Dazhou {county.county} source lock differs from frozen preview")
        if source["id"] == "sc-pzh-20260901" and (source["sha256"], source["bytes"], source["rowCount"]) != (PANZHIHUA_SHA256, PANZHIHUA_BYTES, PANZHIHUA_ROWS):
            raise ValueError("Panzhihua source lock differs from frozen preview")
        if source["id"] == "sd-hz-luxi-20250627" and (source["sha256"], source["bytes"], source["rowCount"]) != (LUXI_SHA256, LUXI_BYTES, LUXI_ROWS):
            raise ValueError("Luxi source lock differs from frozen CSV")
        if source["id"] == "sd-taian-20250724" and (source["sha256"], source["bytes"], source["rowCount"]) != (TAIAN_SHA256, TAIAN_BYTES, TAIAN_ROWS):
            raise ValueError("Tai'an source lock differs from frozen CSV")
        if source["id"] == "sd-jinan-20250721" and (source["sha256"], source["bytes"], source["rowCount"]) != (JINAN_SHA256, JINAN_BYTES, JINAN_ROWS):
            raise ValueError("Jinan source lock differs from frozen CSV")
        if source["id"] == "sd-weifang-20261110" and (source["sha256"], source["bytes"], source["rowCount"]) != (WEIFANG_SHA256, WEIFANG_BYTES, WEIFANG_ROWS):
            raise ValueError("Weifang source lock differs from frozen CSV")
        if source["id"] == "tj-nankai-20220411" and (source["sha256"], source["bytes"], source["rowCount"]) != (TIANJIN_SHA256, TIANJIN_BYTES, TIANJIN_ROWS):
            raise ValueError("Tianjin source lock differs from frozen preview")
        if source["id"] == "zj-prov-20260902" and (source["sha256"], source["bytes"], source["rowCount"]) != (ZHEJIANG_SHA256, ZHEJIANG_BYTES, ZHEJIANG_ROWS):
            raise ValueError("Zhejiang source lock differs from frozen CSV")
        if source["id"] == SHUCHENG_SOURCE_ID and (source["sha256"], source["bytes"], source["rowCount"]) != (SHUCHENG_PREVIEW_SHA256, SHUCHENG_PREVIEW_BYTES, SHUCHENG_ROWS):
            raise ValueError("Shucheng source lock differs from frozen preview")
        if source["id"] == "zj-wz-20220826" and (source["sha256"], source["bytes"], source["rowCount"]) != (WENZHOU_6724_SHA256, WENZHOU_6724_BYTES, WENZHOU_6724_ROWS):
            raise ValueError("Wenzhou 6724 source lock differs from frozen ZIP")
    return sources


def cell_text(cell: html.HtmlElement) -> str:
    return " ".join(" ".join(cell.itertext()).split())


def source_rows(raw: bytes, source_id: str, expected_count: int) -> list[list[str]]:
    document = html.fromstring(raw.decode("utf-8", errors="strict"))
    tables = document.xpath("//table")
    expected_tables = 2 if source_id == "fj-mzt-undated" else 1
    if len(tables) != expected_tables:
        raise ValueError(f"{source_id}: expected exactly {expected_tables} source tables")
    rows = tables[0].xpath(".//tr")
    if not rows:
        raise ValueError(f"{source_id}: source table is empty")
    header = tuple(cell_text(cell) for cell in rows[0].xpath("./th|./td"))
    if header != HEADERS[source_id]:
        raise ValueError(f"{source_id}: source table headers changed: {header!r}")
    if source_id == "fj-mzt-undated":
        companion = tables[1].xpath(".//tr")
        companion_header = tuple(cell_text(cell) for cell in companion[0].xpath("./th|./td")) if companion else ()
        if (len(companion) != 3 or companion_header != header or
                [cell_text(cell) for cell in companion[1].xpath("./th|./td")] != ["暂无数据，建议重新更换搜索内容"] or
                [cell_text(cell) for cell in companion[2].xpath("./th|./td")] != ["", "", ""]):
            raise ValueError(f"{source_id}: companion table changed")
        if len(rows) != expected_count + 2:
            raise ValueError(f"{source_id}: expected {expected_count} rows, got {len(rows) - 2}")
        if [cell_text(cell) for cell in rows[1].xpath("./th|./td")] != ["暂无数据，建议重新更换搜索内容"]:
            raise ValueError(f"{source_id}: hidden placeholder changed")
        rows = [rows[0], *rows[2:]]
    if len(rows) - 1 != expected_count:
        raise ValueError(f"{source_id}: expected {expected_count} rows, got {len(rows) - 1}")
    result = []
    for number, row in enumerate(rows[1:], 1):
        cells = [cell_text(cell) for cell in row.xpath("./th|./td")]
        if len(cells) != len(header):
            raise ValueError(f"{source_id} row {number}: expected {len(header)} cells, got {len(cells)}")
        result.append(cells)
    return result


def source_integer(value: str, source_id: str, row_number: int, field: str,
                   audit: Counter[str], *, nullable: bool = False) -> int | None:
    if value == "" and nullable:
        return None
    if DIGITS_WITH_SPACES.fullmatch(value) is None:
        raise ValueError(f"{source_id} row {row_number}: invalid {field}: {value!r}")
    if any(char.isspace() for char in value):
        audit["serialWhitespace" if field == "serial" else "numericWhitespace"] += 1
    return int(re.sub(r"\s+", "", value))


def safe_text(value: str, source_id: str, row_number: int, field: str) -> str:
    if not value:
        raise ValueError(f"{source_id} row {row_number}: missing {field}")
    if MOBILE.search(value) or LANDLINE.search(value) or EMAIL.search(value):
        raise ValueError(f"{source_id} row {row_number}: contact data in {field}")
    return value


def validate_shucheng_catalog(raw: bytes) -> None:
    if (len(raw) != SHUCHENG_CATALOG_BYTES
            or hashlib.sha256(raw).hexdigest() != SHUCHENG_CATALOG_SHA256):
        raise ValueError("Shucheng catalog size or SHA-256 changed")
    document = html.fromstring(raw.decode("utf-8", errors="strict"))
    text = " ".join(" ".join(document.itertext()).split())
    required = (
        "舒城县已备案养老机构清单", "来源部门 舒城县民政局",
        "数据量 12", "开放状态 无条件开放",
        "发布时间 2026-06-04 09:32:28", "最后更新时间 2026-10-14 01:35:44",
        "本数据集全量为12条，仅展示前30条数据",
        "可以自由利用、自由传播与分享", "在成果中注明数据来源",
    )
    if not all(fragment in text for fragment in required):
        raise ValueError("Shucheng catalog metadata or open-data licence changed")


def parse_shucheng_rows(raw: bytes) -> list[dict]:
    if (len(raw) != SHUCHENG_PREVIEW_BYTES
            or hashlib.sha256(raw).hexdigest() != SHUCHENG_PREVIEW_SHA256):
        raise ValueError("Shucheng preview size or SHA-256 changed")
    document = html.fromstring(raw.decode("utf-8", errors="strict"))
    tables = document.xpath("//table")
    if len(tables) != 1:
        raise ValueError("Shucheng preview table count changed")
    table_rows = tables[0].xpath(".//tr")
    if len(table_rows) != SHUCHENG_ROWS + 1:
        raise ValueError("Shucheng preview row count changed")
    header = tuple(cell_text(cell) for cell in table_rows[0].xpath("./th|./td"))
    if header != SHUCHENG_HEADERS:
        raise ValueError("Shucheng preview headers changed")
    records = []
    for number, row in enumerate(table_rows[1:], 1):
        cells = [cell_text(cell) for cell in row.xpath("./th|./td")]
        if len(cells) != len(SHUCHENG_HEADERS) or cells[0] != str(number):
            raise ValueError(f"Shucheng preview row {number} cells or serial changed")
        if (cells[3] != "舒城县民政局"
                or re.fullmatch(r"[0-9A-Z]{18}", cells[7]) is None):
            raise ValueError(f"Shucheng preview row {number} registration evidence changed")
        # Only the place name and address are projected. In particular, the
        # source representative and telephone columns never leave this parser.
        records.append({
            "id": f"{SHUCHENG_SOURCE_ID}-{number:04d}", "sourceId": SHUCHENG_SOURCE_ID,
            "rowNumber": number,
            "name": safe_text(cells[2], SHUCHENG_SOURCE_ID, number, "name"),
            "address": safe_text(cells[4], SHUCHENG_SOURCE_ID, number, "address"),
            "beds": None, "residentCount": None, "staffCount": None, "services": None,
        })
    if len({record["name"] for record in records}) != SHUCHENG_ROWS:
        raise ValueError("Shucheng preview duplicate names changed")
    return records


def parse_source(raw: bytes, source_id: str, expected_count: int) -> tuple[list[dict], dict[str, int]]:
    rows = source_rows(raw, source_id, expected_count)
    records: list[dict] = []
    audit: Counter[str] = Counter()
    for number, cells in enumerate(rows, 1):
        serial = source_integer(cells[0], source_id, number, "serial", audit)
        if serial != number:
            raise ValueError(f"{source_id} row {number}: source serial is {serial}")
        name = safe_text(cells[1], source_id, number, "name")
        address = safe_text(cells[2], source_id, number, "address")
        if source_id == "cq-mzj-20251222":
            residents = source_integer(cells[3], source_id, number, "residentCount", audit)
            staff = source_integer(cells[4], source_id, number, "staffCount", audit)
            beds = source_integer(cells[5], source_id, number, "beds", audit, nullable=True)
            services = safe_text(cells[6], source_id, number, "services")
        elif source_id == "js-zjg-20261029":
            beds = source_integer(cells[3], source_id, number, "beds", audit)
            residents = staff = services = None
            # cells[4] is the official contact column. Exclude the whole column.
        else:
            beds = residents = staff = services = None
        if beds is None:
            audit["missingBeds"] += 1
        records.append({
            "id": f"{source_id}-{number:04d}", "sourceId": source_id,
            "rowNumber": number, "name": name, "address": address,
            "beds": beds, "residentCount": residents,
            "staffCount": staff, "services": services,
        })
    audit["duplicateNameGroups"] = sum(count > 1 for count in Counter(record["name"] for record in records).values())
    summary = {key: audit[key] for key in EXPECTED_AUDIT[source_id]}
    if summary != EXPECTED_AUDIT[source_id]:
        raise ValueError(f"{source_id}: source audit changed: {summary!r}")
    return records, summary


def projected_rows(raw: bytes, source_id: str, expected_count: int, *, luxi_revision: bytes | None = None, taian_revision: bytes | None = None, source_dir: Path = SOURCE_DIR) -> tuple[list[tuple[dict, str, str]], dict[str, int]]:
    """Pair each privacy-minimal source row with its explicit display city."""
    if source_id == "zj-wz-20220826":
        source_rows = parse_wenzhou_6724_rows(raw)
        if len(source_rows) != expected_count:
            raise ValueError("Wenzhou 6724 frozen row count differs from source manifest")
        rows = []
        for item in source_rows:
            record = {
                "id": f"{source_id}-{item.source_row:04d}", "sourceId": source_id,
                "rowNumber": item.source_row, "name": item.name,
                "address": None, "beds": item.beds,
                "residentCount": None, "staffCount": None, "services": None,
            }
            rows.append((record, "wenzhou", "温州"))
        return rows, {"missingAddress": len(rows), "districtGroups": 11, "bedComponentMismatches": 10}
    if source_id == SHUCHENG_SOURCE_ID:
        records = parse_shucheng_rows(raw)
        if len(records) != expected_count:
            raise ValueError("Shucheng frozen row count differs from source manifest")
        return [(record, "luan", "六安") for record in records], {
            "missingBeds": SHUCHENG_ROWS, "previewRows": SHUCHENG_ROWS,
            "catalogClaimedRows": SHUCHENG_ROWS,
        }
    if source_id in DAZHOU_COUNTY_BY_ID:
        county = DAZHOU_COUNTY_BY_ID[source_id]
        source_rows = parse_dazhou_county_rows(county, raw)
        if len(source_rows) != expected_count:
            raise ValueError(f"Dazhou {county.county} frozen row count differs from source manifest")
        rows = []
        for item in source_rows:
            record = {
                "id": f"{source_id}-{item.row_number:04d}", "sourceId": source_id,
                "rowNumber": item.row_number, "name": item.name,
                "address": item.address, "beds": None,
                "residentCount": None, "staffCount": None, "services": None,
            }
            rows.append((record, "dazhou", "达州"))
        return rows, {"previewRows": len(rows), "missingBeds": len(rows),
                      "catalogClaimedRows": county.row_count}
    if source_id == "sc-pzh-20260901":
        source_rows = parse_panzhihua_rows(raw)
        if len(source_rows) != expected_count:
            raise ValueError("Panzhihua frozen row count differs from source manifest")
        rows = []
        for item in source_rows:
            record = {
                "id": f"{source_id}-{item.row_number:04d}", "sourceId": source_id,
                "rowNumber": item.row_number, "name": item.name,
                "address": None, "beds": item.beds,
                "residentCount": None, "staffCount": None, "services": None,
            }
            rows.append((record, "panzhihua", "攀枝花"))
        return rows, {"missingAddress": len(rows), "minimumBeds": 100, "districtGroups": 6}
    if source_id == "zj-prov-20260902":
        source_rows = load_zhejiang_rows(source_dir, source_raw=raw)
        if len(source_rows) != expected_count:
            raise ValueError("Zhejiang frozen row count differs from source manifest")
        public_rows = project_public_zhejiang_rows(source_rows)
        rows = []
        for item in public_rows:
            record = {
                "id": f"{source_id}-{item.row_number:04d}", "sourceId": source_id,
                "rowNumber": item.row_number, "name": item.name,
                "address": item.address, "beds": item.beds,
                "residentCount": None, "staffCount": None, "services": None,
            }
            rows.append((record, item.city_slug, item.city_name))
        return rows, {
            "rawRows": len(source_rows), "uniqueRows": 884, "publicRows": len(rows),
            "excludedDuplicates": 263, "excludedGenericNames": 210,
            "missingAddress": sum(item.address is None for item in public_rows),
            "missingBeds": sum(item.beds is None for item in public_rows),
        }
    if source_id == "tj-nankai-20220411":
        source_rows = parse_tianjin_rows(raw)
        if len(source_rows) != expected_count:
            raise ValueError("Tianjin frozen row count differs from source manifest")
        rows = []
        for item in source_rows:
            record = {
                "id": f"{source_id}-{item.row_number:04d}", "sourceId": source_id,
                "rowNumber": item.row_number, "name": item.name,
                "address": item.address, "beds": None,
                "residentCount": None, "staffCount": None, "services": None,
            }
            rows.append((record, "tianjin", "天津"))
        return rows, {"missingBeds": len(rows), "previewRows": len(rows), "catalogClaimedRows": 42}
    if source_id == "sd-hz-luxi-20250627":
        if luxi_revision is None:
            raise ValueError("Luxi revision CSV is required")
        source_rows = parse_luxi_rows(raw, luxi_revision)
        if len(source_rows) != expected_count:
            raise ValueError("Luxi frozen row count differs from source manifest")
        rows = []
        for item in source_rows:
            record = {
                "id": f"{source_id}-{item.row_number:04d}", "sourceId": source_id,
                "rowNumber": item.row_number, "name": item.name,
                "address": item.address, "beds": None,
                "residentCount": None, "staffCount": None, "services": None,
            }
            rows.append((record, "heze", "菏泽"))
        return rows, {"missingBeds": len(rows), "revisionRows": LUXI_NEWER_ROWS}
    if source_id == "sd-taian-20250724":
        if taian_revision is None:
            raise ValueError("Tai'an revision CSV is required")
        source_rows = parse_taian_rows(raw, taian_revision)
        if len(source_rows) != expected_count:
            raise ValueError("Tai'an frozen row count differs from source manifest")
        rows = []
        for item in source_rows:
            record = {
                "id": f"{source_id}-{item.row_number:04d}", "sourceId": source_id,
                "rowNumber": item.row_number, "name": item.name,
                "address": item.address, "beds": None,
                "residentCount": None, "staffCount": None, "services": None,
            }
            rows.append((record, "taian", "泰安"))
        return rows, {"missingBeds": len(rows), "revisionRows": TAIAN_NEWER_ROWS}
    if source_id == "sd-jinan-20250721":
        source_rows = parse_jinan_rows(raw, (source_dir / JINAN_LATEST.name).read_bytes())
        if len(source_rows) != expected_count:
            raise ValueError("Jinan frozen row count differs from source manifest")
        rows = []
        for item in source_rows:
            record = {
                "id": f"{source_id}-{item.row_number:04d}", "sourceId": source_id,
                "rowNumber": item.row_number, "name": item.name,
                "address": item.address, "beds": item.beds,
                "residentCount": None, "staffCount": None, "services": None,
            }
            rows.append((record, "jinan", "济南"))
        return rows, {"missingBeds": 0, "newerSubsetRows": JINAN_LATEST_ROWS}
    if source_id == "sd-weifang-20261110":
        source_rows = parse_weifang_rows(raw, (source_dir / WEIFANG_PRIOR.name).read_bytes())
        if len(source_rows) != expected_count:
            raise ValueError("Weifang frozen row count differs from source manifest")
        rows = []
        for item in source_rows:
            record = {
                "id": f"{source_id}-{item.row_number:04d}", "sourceId": source_id,
                "rowNumber": item.row_number, "name": item.name,
                "address": item.address, "beds": item.beds,
                "residentCount": None, "staffCount": None, "services": None,
            }
            rows.append((record, "weifang", "潍坊"))
        return rows, {"statisticTimeRows": len(rows), "missingBeds": 0}
    if source_id == "sc-dz-20260814":
        source_rows = parse_dazhou_rows(raw)
        if len(source_rows) != expected_count:
            raise ValueError("Dazhou frozen row count differs from source manifest")
        rows = []
        for item in source_rows:
            record = {
                "id": f"{source_id}-{item.row_number:04d}", "sourceId": source_id,
                "rowNumber": item.row_number, "name": item.name,
                "address": item.address, "beds": item.beds,
                "residentCount": None, "staffCount": None, "services": None,
            }
            rows.append((record, "dazhou", "达州"))
        return rows, {"missingBeds": sum(item.beds is None for item in source_rows),
                      "previewRows": len(source_rows), "catalogClaimedRows": 179}
    if source_id == "sc-ncgp-20250220":
        source_rows = parse_gaoping_rows(raw)
        if len(source_rows) != expected_count:
            raise ValueError("Gaoping frozen row count differs from source manifest")
        rows = []
        for item in source_rows:
            record = {
                "id": f"{source_id}-{item.row_number:04d}", "sourceId": source_id,
                "rowNumber": item.row_number, "name": item.name,
                "address": None, "beds": None,
                "residentCount": None, "staffCount": None, "services": None,
            }
            rows.append((record, "nanchong", "南充"))
        return rows, {"missingAddress": len(source_rows), "missingBeds": len(source_rows)}
    if source_id == "bj-mzj-20260210":
        source_rows = parse_beijing_rows(raw)
        if len(source_rows) != expected_count:
            raise ValueError("Beijing frozen row count differs from source manifest")
        rows = []
        for item in source_rows:
            record = {
                "id": f"{source_id}-{item.row_number:04d}", "sourceId": source_id,
                "rowNumber": item.row_number, "name": item.name,
                "address": None, "beds": None,
                "residentCount": None, "staffCount": None, "services": None,
            }
            rows.append((record, item.city_slug, item.city_name))
        return rows, {"missingAddress": len(source_rows), "missingBeds": len(source_rows),
                      "starGroups": 5}
    if source_id == "he-sjz-20260320":
        source_rows = parse_shijiazhuang_rows(raw)
        if len(source_rows) != expected_count:
            raise ValueError("Shijiazhuang frozen row count differs from source manifest")
        rows = []
        for item in source_rows:
            record = {
                "id": f"{source_id}-{item.row_number:04d}", "sourceId": source_id,
                "rowNumber": item.row_number, "name": item.name,
                "address": item.address, "beds": item.beds,
                "residentCount": None, "staffCount": None, "services": None,
            }
            rows.append((record, item.city_slug, item.city_name))
        return rows, {"missingAddress": 0, "missingBeds": len(source_rows),
                      "numberedRows": 265,
                      "unnumberedSites": sum(item.is_unnumbered_site for item in source_rows)}
    if source_id == "hb-qj-20260615":
        source_rows = parse_hubei_rows(raw)
        if len(source_rows) != expected_count:
            raise ValueError("Hubei frozen row count differs from source manifest")
        rows = []
        for item in source_rows:
            record = {
                "id": f"{source_id}-{item.row_number:04d}", "sourceId": source_id,
                "rowNumber": item.row_number, "name": item.name,
                "address": item.address, "beds": item.beds,
                "residentCount": None, "staffCount": None, "services": None,
            }
            rows.append((record, item.city_slug, item.city_name))
        return rows, {"missingAddress": 0, "missingBeds": len(source_rows),
                      "cityGroups": len({item.city_slug for item in source_rows})}
    if source_id == "hn-mzt-20260112":
        source_rows = parse_hunan_rows(raw)
        if len(source_rows) != expected_count:
            raise ValueError("Hunan frozen row count differs from source manifest")
        rows = []
        for item in source_rows:
            record = {
                "id": f"{source_id}-{item.row_number:04d}", "sourceId": source_id,
                "rowNumber": item.row_number, "name": item.name,
                "address": item.address, "beds": item.beds,
                "residentCount": None, "staffCount": None, "services": None,
            }
            rows.append((record, item.city_slug, item.city_name))
        return rows, {
            "missingAddress": sum(item.address is None for item in source_rows),
            "zeroBeds": sum(item.beds == 0 for item in source_rows),
            "cityGroups": len({item.city_slug for item in source_rows}),
        }
    if source_id == "js-nj-20260310":
        source_rows = validate_nanjing_source(raw)
        if len(source_rows) != expected_count:
            raise ValueError("Nanjing frozen row count differs from source manifest")
        rows = []
        for item in source_rows:
            record = {
                "id": f"{source_id}-{item['rowNumber']:04d}", "sourceId": source_id,
                "rowNumber": item["rowNumber"], "name": item["name"],
                "address": item["address"], "beds": item["beds"],
                "residentCount": None, "staffCount": None, "services": None,
            }
            rows.append((record, item["citySlug"], item["cityName"]))
        return rows, {"missingAddress": 0, "missingBeds": 0}
    records, audit = parse_source(raw, source_id, expected_count)
    info = SOURCE_INFO[source_id]
    return [(record, info["citySlug"], info.get("cityDisplay", info["city"])) for record in records], audit


def project(source_dir: Path, source_manifest_path: Path) -> tuple[dict[str, bytes], dict[str, dict[str, int]]]:
    sources = load_source_manifest(source_manifest_path)
    snapshot_material = [(item["id"], item["sha256"], item["rowCount"]) for item in sources]
    snapshot_id = "v1-" + hashlib.sha256(json_bytes(snapshot_material)).hexdigest()[:16]
    files: dict[str, bytes] = {}
    audits: dict[str, dict[str, int]] = {}
    public_sources = []
    groups: dict[str, dict] = {}
    all_ids: set[str] = set()
    for source in sources:
        source_id = source["id"]
        info = SOURCE_INFO[source_id]
        raw = (source_dir / source["filename"]).read_bytes()
        if len(raw) != source["bytes"] or hashlib.sha256(raw).hexdigest() != source["sha256"]:
            raise ValueError(f"{source_id}: frozen source size or SHA-256 changed")
        if source_id == "bj-mzj-20260210":
            validate_beijing_page((source_dir / "beijing-stars-20260210.html").read_bytes())
        if source_id == "sc-ncgp-20250220":
            validate_gaoping_page((source_dir / "gaoping-202502-page.html").read_bytes())
        if source_id == "sc-dz-20260814":
            validate_dazhou_catalog((source_dir / "dazhou-catalog-20260814.html").read_bytes())
        if source_id in DAZHOU_COUNTY_BY_ID:
            county = DAZHOU_COUNTY_BY_ID[source_id]
            validate_dazhou_county_catalog(county, (source_dir / county.catalog.name).read_bytes())
        if source_id == "sc-pzh-20260901":
            validate_panzhihua_catalog((source_dir / PANZHIHUA_CATALOG.name).read_bytes())
        if source_id == "tj-nankai-20220411":
            validate_tianjin_license((source_dir / "tianjin-open-license-20261117.html").read_bytes())
        if source_id == "zj-wz-20220826":
            validate_wenzhou_6724_pages(
                (source_dir / WENZHOU_6724_METADATA.name).read_bytes(),
                (source_dir / WENZHOU_6724_LICENSE.name).read_bytes(),
            )
        if source_id == SHUCHENG_SOURCE_ID:
            validate_shucheng_catalog((source_dir / SHUCHENG_CATALOG_NAME).read_bytes())
        luxi_revision = None
        if source_id == "sd-hz-luxi-20250627":
            validate_luxi_catalog((source_dir / LUXI_CATALOG.name).read_bytes())
            luxi_revision = (source_dir / LUXI_NEWER.name).read_bytes()
        taian_revision = None
        if source_id == "sd-taian-20250724":
            validate_taian_catalog((source_dir / TAIAN_CATALOG.name).read_bytes())
            taian_revision = (source_dir / TAIAN_NEWER.name).read_bytes()
        if source_id == "sd-jinan-20250721":
            validate_jinan_catalog((source_dir / JINAN_CATALOG.name).read_bytes())
        if source_id == "sd-weifang-20261110":
            validate_weifang_catalog((source_dir / WEIFANG_CATALOG.name).read_bytes())
        rows, audits[source_id] = projected_rows(raw, source_id, source["rowCount"], luxi_revision=luxi_revision, taian_revision=taian_revision, source_dir=source_dir)
        records = [record for record, _, _ in rows]
        row_numbers = [record["rowNumber"] for record in records]
        if source_id == "zj-prov-20260902":
            if len(rows) != ZHEJIANG_PUBLIC_ROWS or len(set(row_numbers)) != len(rows) or any(
                not 1 <= number <= source["rowCount"] for number in row_numbers
            ):
                raise ValueError("Zhejiang public rows incomplete, repeated or outside source CSV")
        elif source_id == "zj-wz-20220826":
            if len(rows) != source["rowCount"] or set(row_numbers) != set(range(2, source["rowCount"] + 2)):
                raise ValueError("Wenzhou 6724 source rows incomplete or repeated")
        elif len(rows) != source["rowCount"] or set(row_numbers) != set(range(1, source["rowCount"] + 1)):
            raise ValueError(f"{source_id}: source rows incomplete or repeated")
        if all_ids.intersection(record["id"] for record in records):
            raise ValueError(f"{source_id}: duplicate public record ID")
        all_ids.update(record["id"] for record in records)
        public_sources.append({
            "id": source_id, "province": info["province"], "city": info["city"],
            "scope": info["scope"], "title": info["title"], "url": info["url"],
            "publishedAt": info["publishedAt"], "asOf": info["asOf"],
            "sha256": source["sha256"], "rowCount": len(records),
        })
        province_slug = info["provinceSlug"]
        province = groups.setdefault(province_slug, {"name": info["province"], "cities": {}})
        if province["name"] != info["province"]:
            raise ValueError(f"{source_id}: province slug has conflicting names")
        for record, city_slug, city_name in rows:
            if info["city"] is not None and city_name != info.get("cityDisplay", info["city"]):
                raise ValueError(f"{source_id}: source city differs from index city")
            city = province["cities"].setdefault(city_slug, {"name": city_name, "records": []})
            if city["name"] != city_name:
                raise ValueError(f"{source_id}: city slug has conflicting names")
            city["records"].append(record)
    provinces = []
    for province_slug, province in groups.items():
        cities = []
        for city_slug, city in province["cities"].items():
            city_records = city["records"]
            prefix = f"{province_slug}/{city_slug}"
            index_records = []
            for start in range(0, len(city_records), CHUNK_SIZE):
                chunk_name = f"chunk-{start // CHUNK_SIZE + 1:03d}.v1.json"
                part = city_records[start:start + CHUNK_SIZE]
                files[f"{prefix}/{chunk_name}"] = json_bytes({
                    "schemaVersion": 1, "snapshotId": snapshot_id,
                    "provinceSlug": province_slug, "citySlug": city_slug, "records": part,
                })
                index_records.extend({
                    "id": record["id"], "sourceId": record["sourceId"],
                    "rowNumber": record["rowNumber"], "name": record["name"],
                    "address": record["address"], "beds": record["beds"],
                    "chunk": chunk_name,
                } for record in part)
            index_path = f"{prefix}/index.v1.json"
            files[index_path] = json_bytes({
                "schemaVersion": 1, "snapshotId": snapshot_id,
                "provinceSlug": province_slug, "citySlug": city_slug,
                "records": index_records,
            })
            cities.append({"slug": city_slug, "name": city["name"],
                           "count": len(city_records), "indexPath": index_path})
        provinces.append({"slug": province_slug, "name": province["name"],
                          "count": sum(city["count"] for city in cities), "cities": cities})
    row_count = sum(source["rowCount"] for source in public_sources)
    if row_count != 7719 or len(all_ids) != row_count or sum(province["count"] for province in provinces) != row_count:
        raise ValueError("official projection must cover all 7,719 public source observations")
    files["manifest.v1.json"] = json_bytes({
        "schemaVersion": 1, "snapshotId": snapshot_id,
        "archivedAt": ARCHIVED_AT, "rowCount": row_count,
        "sources": public_sources, "provinces": provinces,
    })
    return files, audits


def check_output(output_dir: Path, files: dict[str, bytes]) -> None:
    actual = {path.relative_to(output_dir).as_posix(): path for path in output_dir.rglob("*") if path.is_file()}
    if set(actual) != set(files):
        raise ValueError(f"public projection file set differs: missing={sorted(set(files) - set(actual))}, extra={sorted(set(actual) - set(files))}")
    for name, expected in files.items():
        if actual[name].read_bytes() != expected:
            raise ValueError(f"public projection differs: {name}")


def write_output(output_dir: Path, files: dict[str, bytes]) -> None:
    if output_dir.exists():
        try:
            check_output(output_dir, files)
            return
        except ValueError:
            pass
    output_dir.parent.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix=".national-official-", dir=output_dir.parent))
    backup = output_dir.parent / f".{output_dir.name}.backup-{uuid.uuid4().hex}"
    try:
        for name, content in files.items():
            target = staging / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(content)
        check_output(staging, files)
        if output_dir.exists():
            os.replace(output_dir, backup)
        try:
            os.replace(staging, output_dir)
        except OSError:
            if backup.exists():
                os.replace(backup, output_dir)
            raise
        if backup.exists():
            shutil.rmtree(backup)
    finally:
        if staging.exists():
            shutil.rmtree(staging)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", type=Path, default=SOURCE_DIR)
    parser.add_argument("--source-manifest", type=Path, default=SOURCE_MANIFEST)
    parser.add_argument("--output-dir", type=Path, default=OUTPUT_DIR)
    parser.add_argument("--check", action="store_true", help="verify existing JSON without writing")
    args = parser.parse_args()
    try:
        files, audits = project(args.source_dir, args.source_manifest)
        if args.check:
            check_output(args.output_dir, files)
        else:
            write_output(args.output_dir, files)
    except (OSError, ValueError, UnicodeError, json.JSONDecodeError) as error:
        print(f"national official projection failed: {error}", file=sys.stderr)
        return 1
    raw_rows = sum(item["rowCount"] for item in load_source_manifest(args.source_manifest))
    public_rows = json.loads(files["manifest.v1.json"])["rowCount"]
    print(f"{'Checked' if args.check else 'Generated'} {len(files)} public JSON files, {raw_rows:,} raw rows, {public_rows:,} public observations; audit={json.dumps(audits, ensure_ascii=False, sort_keys=True)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
