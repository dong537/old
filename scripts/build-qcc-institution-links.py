"""Build exact same-province, same-name candidate links from public snapshots.

The links are discovery hints. They do not identify an operating institution,
prove a shared legal entity, or merge source rows across the three datasets.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from collections import defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
REFERENCE_DIR = ROOT / "public/data/qcc-institutions"
OFFICIAL_DIR = ROOT / "public/data/national-official"
GUANGDONG_FILE = ROOT / "public/data/guangdong-source-records.v1.json"
OUTPUT_DIR = ROOT / "public/data/qcc-institution-links"
SAFE_SLUG = re.compile(r"[a-z][a-z0-9-]*\Z")


def json_bytes(value: object) -> bytes:
    return (json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
            + "\n").encode("utf-8")


def _read_json(path: Path) -> dict:
    if not path.is_file():
        raise ValueError(f"missing public source file: {path}")
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (UnicodeError, json.JSONDecodeError) as error:
        raise ValueError(f"invalid public source JSON: {path}") from error
    if not isinstance(value, dict):
        raise ValueError(f"invalid public source object: {path}")
    return value


def _text(value: object, label: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"missing {label}")
    return value


def _snapshot(manifest: dict, label: str) -> str:
    if manifest.get("schemaVersion") != 1:
        raise ValueError(f"invalid {label} schema version")
    return _text(manifest.get("snapshotId"), f"{label} snapshot")


def _locations(manifest: dict, label: str):
    provinces = manifest.get("provinces")
    if not isinstance(provinces, list) or not provinces:
        raise ValueError(f"missing {label} provinces")
    seen_provinces: set[str] = set()
    row_count = 0
    for province in provinces:
        if not isinstance(province, dict):
            raise ValueError(f"invalid {label} province")
        province_name = _text(province.get("name"), f"{label} province name")
        province_slug = _text(province.get("slug"), f"{label} province slug")
        if not SAFE_SLUG.fullmatch(province_slug) or province_slug in seen_provinces:
            raise ValueError(f"unsafe or duplicate {label} province slug")
        seen_provinces.add(province_slug)
        cities = province.get("cities")
        if not isinstance(cities, list) or not cities:
            raise ValueError(f"missing {label} cities")
        city_rows = 0
        seen_cities: set[str] = set()
        for city in cities:
            if not isinstance(city, dict):
                raise ValueError(f"invalid {label} city")
            city_name = _text(city.get("name"), f"{label} city name")
            city_slug = _text(city.get("slug"), f"{label} city slug")
            count = city.get("count")
            if not SAFE_SLUG.fullmatch(city_slug) or city_slug in seen_cities:
                raise ValueError(f"unsafe or duplicate {label} city slug")
            if not isinstance(count, int) or isinstance(count, bool) or count < 0:
                raise ValueError(f"invalid {label} city count")
            seen_cities.add(city_slug)
            index_path = f"{province_slug}/{city_slug}/index.v1.json"
            if city.get("indexPath") != index_path:
                raise ValueError(f"unsafe {label} index path")
            city_rows += count
            yield province_name, province_slug, city_name, city_slug, index_path, count
        if city_rows != province.get("count"):
            raise ValueError(f"{label} province count mismatch")
        row_count += city_rows
    if row_count != manifest.get("rowCount"):
        raise ValueError(f"{label} total row count mismatch")


def _load_index(base: Path, index_path: str, snapshot: str,
                province_slug: str, city_slug: str, count: int, label: str) -> list[dict]:
    value = _read_json(base / index_path)
    records = value.get("records")
    if (value.get("schemaVersion") != 1 or value.get("snapshotId") != snapshot or
            value.get("provinceSlug") != province_slug or
            value.get("citySlug") != city_slug or
            not isinstance(records, list) or len(records) != count):
        raise ValueError(f"{label} index snapshot, location or count mismatch: {index_path}")
    if any(not isinstance(record, dict) for record in records):
        raise ValueError(f"invalid {label} index record: {index_path}")
    return records


def _official_candidates(official_dir: Path, guangdong_path: Path):
    manifest = _read_json(official_dir / "manifest.v1.json")
    official_snapshot = _snapshot(manifest, "national official")
    source_info = {}
    sources = manifest.get("sources")
    if not isinstance(sources, list):
        raise ValueError("missing official sources")
    for source in sources:
        if not isinstance(source, dict):
            raise ValueError("invalid official source")
        source_id = _text(source.get("id"), "official source ID")
        if source_id in source_info:
            raise ValueError("duplicate official source ID")
        source_info[source_id] = (
            _text(source.get("province"), "official source province"),
            _text(source.get("title"), "official source title"),
        )
    candidates: dict[tuple[str, str], list[dict]] = defaultdict(list)
    seen_official_ids: set[str] = set()
    indexed_rows = 0
    for province, province_slug, city, city_slug, index_path, count in _locations(manifest, "official"):
        records = _load_index(official_dir, index_path, official_snapshot,
                              province_slug, city_slug, count, "official")
        for record in records:
            name = _text(record.get("name"), "official name")
            record_id = _text(record.get("id"), "official record ID")
            source_id = _text(record.get("sourceId"), "official source ID")
            if record_id in seen_official_ids:
                raise ValueError("duplicate official record ID")
            seen_official_ids.add(record_id)
            source = source_info.get(source_id)
            if source is None or source[0] != province:
                raise ValueError("official source and province mismatch")
            candidates[(province, name)].append({
                "kind": "nationalOfficial", "id": record_id,
                "provinceSlug": province_slug, "citySlug": city_slug,
                "city": city, "sourceTitle": source[1],
            })
            indexed_rows += 1
    if indexed_rows != manifest["rowCount"]:
        raise ValueError("official index incomplete")

    guangdong = _read_json(guangdong_path)
    guangdong_snapshot = _snapshot(guangdong, "Guangdong official")
    records = guangdong.get("records")
    if not isinstance(records, list):
        raise ValueError("missing Guangdong records")
    seen_guangdong_ids: set[str] = set()
    for record in records:
        if not isinstance(record, dict):
            raise ValueError("invalid Guangdong record")
        name = _text(record.get("name"), "Guangdong name")
        record_id = _text(record.get("id"), "Guangdong record ID")
        city = _text(record.get("city"), "Guangdong city")
        source_title = _text(record.get("evidenceType"), "Guangdong evidence type")
        if record_id in seen_guangdong_ids:
            raise ValueError("duplicate Guangdong source ID")
        seen_guangdong_ids.add(record_id)
        candidates[("广东省", name)].append({
            "kind": "guangdongOfficial", "id": record_id,
            "provinceSlug": None, "citySlug": None,
            "city": city, "sourceTitle": source_title,
        })
    return official_snapshot, guangdong_snapshot, candidates


def build(reference_dir: Path = REFERENCE_DIR, official_dir: Path = OFFICIAL_DIR,
          guangdong_path: Path = GUANGDONG_FILE) -> dict[str, bytes]:
    reference = _read_json(reference_dir / "manifest.v1.json")
    reference_snapshot = _snapshot(reference, "institution reference")
    official_snapshot, guangdong_snapshot, candidates = _official_candidates(
        official_dir, guangdong_path)
    snapshot_basis = {
        "schemaVersion": 1, "referenceSnapshotId": reference_snapshot,
        "officialSnapshotId": official_snapshot,
        "guangdongSnapshotId": guangdong_snapshot,
    }
    snapshot_id = "v1-" + hashlib.sha256(json_bytes(snapshot_basis)).hexdigest()[:16]
    outputs: dict[str, bytes] = {}
    seen_reference_ids: set[str] = set()
    indexed_rows = linked_references = matches = regions = 0
    for province, province_slug, _city, city_slug, index_path, count in _locations(reference, "reference"):
        records = _load_index(reference_dir, index_path, reference_snapshot,
                              province_slug, city_slug, count, "reference")
        links = []
        for record in records:
            record_id = _text(record.get("id"), "reference ID")
            name = _text(record.get("name"), "reference name")
            if record_id in seen_reference_ids:
                raise ValueError("duplicate reference ID")
            seen_reference_ids.add(record_id)
            indexed_rows += 1
            hits = candidates.get((province, name))
            if hits:
                links.append({"referenceId": record_id, "matches": hits})
                linked_references += 1
                matches += len(hits)
        outputs[f"{province_slug}/{city_slug}/links.v1.json"] = json_bytes({
            "schemaVersion": 1, "snapshotId": snapshot_id,
            "referenceSnapshotId": reference_snapshot,
            "provinceSlug": province_slug, "citySlug": city_slug,
            "links": links,
        })
        regions += 1
    if indexed_rows != reference.get("rowCount"):
        raise ValueError("reference index incomplete")
    outputs = {"manifest.v1.json": json_bytes({
        **snapshot_basis, "snapshotId": snapshot_id,
        "linkedReferenceCount": linked_references, "matchCount": matches,
        "regionCount": regions,
    }), **outputs}
    return outputs


def write_outputs(outputs: dict[str, bytes], output_dir: Path = OUTPUT_DIR,
                  *, check: bool) -> None:
    output_dir = Path(output_dir)
    actual = ({file.relative_to(output_dir).as_posix() for file in output_dir.rglob("*")
               if file.is_file()} if output_dir.exists() else set())
    expected = set(outputs)
    if check and actual != expected:
        raise ValueError("institution links file set differs")
    if not check and actual - expected:
        raise ValueError("institution links stale output files remain")
    for filename, data in outputs.items():
        path = output_dir / filename
        if check:
            if not path.is_file() or path.read_bytes() != data:
                raise ValueError(f"institution links output differs: {filename}")
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true",
                        help="Compare every existing link file to three public source snapshots")
    args = parser.parse_args()
    outputs = build()
    write_outputs(outputs, check=args.check)
    manifest = json.loads(outputs["manifest.v1.json"])
    verb = "Checked" if args.check else "Wrote"
    print(f"{verb} {len(outputs)} public JSON files; "
          f"{manifest['linkedReferenceCount']} linked reference rows, "
          f"{manifest['matchCount']} exact-name candidate matches across "
          f"{manifest['regionCount']} region files; snapshot {manifest['snapshotId']}")


if __name__ == "__main__":
    main()
