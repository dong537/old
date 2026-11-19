"""Build exact-code, same-province registry candidates from public projections.

An equal valid credit code identifies a registration-code candidate only. It does
not establish that the source row is the same care site or its operator.
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
NATIONAL_DIR = ROOT / "public/data/qcc-national"
GUANGDONG_DIR = ROOT / "public/data/qcc"
OUTPUT_DIR = ROOT / "public/data/qcc-institution-registry-links"
SLUG = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*\Z")
CHUNK = re.compile(r"chunk-\d{3,}\.v1\.json\Z")
ALPHABET = "0123456789ABCDEFGHJKLMNPQRTUWXY"
WEIGHTS = (1, 3, 9, 27, 19, 26, 16, 17, 20, 29, 25, 13, 8, 24, 10, 30, 28)
CODE = re.compile(rf"[{ALPHABET}]{{18}}\Z")


def json_bytes(value: object) -> bytes:
    return (json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False) + "\n").encode("utf-8")


def read_object(path: Path) -> dict:
    if not path.is_file():
        raise ValueError(f"missing public source file: {path}")
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (UnicodeError, json.JSONDecodeError) as error:
        raise ValueError(f"invalid public source JSON: {path}") from error
    if not isinstance(value, dict):
        raise ValueError(f"invalid public source object: {path}")
    return value


def required_text(value: object, label: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"missing {label}")
    return value


def snapshot(manifest: dict, label: str) -> str:
    if manifest.get("schemaVersion") != 1:
        raise ValueError(f"invalid {label} schema version")
    return required_text(manifest.get("snapshotId"), f"{label} snapshot")


def valid_code(value: object) -> bool:
    if not isinstance(value, str) or CODE.fullmatch(value) is None or value == "0" * 18:
        return False
    total = sum(ALPHABET.index(char) * weight for char, weight in zip(value[:17], WEIGHTS))
    return value[-1] == ALPHABET[(31 - total % 31) % 31]


def checked_code(record: dict, status_key: str, label: str) -> str | None:
    status = record.get(status_key)
    code = record.get("creditCode")
    if status == "valid":
        if not valid_code(code):
            raise ValueError(f"{label} marked valid with invalid credit code")
        return code
    if status_key == "codeStatus" and (status not in {"missing", "invalid", "placeholder"} or code is not None):
        raise ValueError(f"{label} invalid reference code state")
    if status_key == "codeValidity" and not isinstance(status, str):
        raise ValueError(f"{label} missing registry code validity")
    return None


def locations(manifest: dict, label: str):
    provinces = manifest.get("provinces")
    if not isinstance(provinces, list) or not provinces:
        raise ValueError(f"missing {label} provinces")
    seen_provinces: set[str] = set()
    total = 0
    for province in provinces:
        if not isinstance(province, dict):
            raise ValueError(f"invalid {label} province")
        province_name = required_text(province.get("name"), f"{label} province name")
        province_slug = required_text(province.get("slug"), f"{label} province slug")
        if not SLUG.fullmatch(province_slug) or province_slug in seen_provinces:
            raise ValueError(f"unsafe or duplicate {label} province slug")
        seen_provinces.add(province_slug)
        cities = province.get("cities")
        if not isinstance(cities, list) or not cities:
            raise ValueError(f"missing {label} cities")
        seen_cities: set[str] = set()
        province_count = 0
        for city in cities:
            if not isinstance(city, dict):
                raise ValueError(f"invalid {label} city")
            city_name = required_text(city.get("name"), f"{label} city name")
            city_slug = required_text(city.get("slug"), f"{label} city slug")
            count = city.get("count")
            index_path = f"{province_slug}/{city_slug}/index.v1.json"
            if (not SLUG.fullmatch(city_slug) or city_slug in seen_cities or
                    city.get("indexPath") != index_path):
                raise ValueError(f"unsafe or duplicate {label} city path")
            if not isinstance(count, int) or isinstance(count, bool) or count < 0:
                raise ValueError(f"invalid {label} city count")
            seen_cities.add(city_slug)
            province_count += count
            yield province_name, province_slug, city_name, city_slug, index_path, count
        if province_count != province.get("count"):
            raise ValueError(f"{label} province count mismatch")
        total += province_count
    if total != manifest.get("rowCount"):
        raise ValueError(f"{label} total row count mismatch")


def city_records(base: Path, location: tuple, source_snapshot: str, label: str, identity_keys: tuple[str, ...]):
    _province, province_slug, _city, city_slug, index_path, count = location
    index = read_object(base / index_path)
    rows = index.get("records")
    if (index.get("schemaVersion") != 1 or index.get("snapshotId") != source_snapshot or
            index.get("provinceSlug") != province_slug or index.get("citySlug") != city_slug or
            not isinstance(rows, list) or len(rows) != count):
        raise ValueError(f"{label} index snapshot, location or count mismatch: {index_path}")
    chunks: dict[str, list[dict]] = defaultdict(list)
    for row in rows:
        if not isinstance(row, dict):
            raise ValueError(f"invalid {label} index row: {index_path}")
        filename = required_text(row.get("chunk"), f"{label} chunk filename")
        if not CHUNK.fullmatch(filename):
            raise ValueError(f"unsafe {label} chunk filename")
        chunks[filename].append(row)
    details_by_id: dict[str, dict] = {}
    for filename, expected in chunks.items():
        detail_path = base / province_slug / city_slug / filename
        chunk = read_object(detail_path)
        details = chunk.get("records")
        if (chunk.get("schemaVersion") != 1 or chunk.get("snapshotId") != source_snapshot or
                chunk.get("provinceSlug") != province_slug or chunk.get("citySlug") != city_slug or
                not isinstance(details, list) or len(details) != len(expected)):
            raise ValueError(f"{label} detail snapshot, location or count mismatch: {detail_path}")
        for index_row, detail in zip(expected, details):
            if not isinstance(detail, dict) or any(detail.get(key) != index_row.get(key) for key in identity_keys):
                raise ValueError(f"{label} detail and index disagree: {detail_path}")
            row_id = required_text(detail.get("id"), f"{label} ID")
            if row_id in details_by_id:
                raise ValueError(f"duplicate {label} detail ID: {row_id}")
            details_by_id[row_id] = detail
    if len(details_by_id) != len(rows):
        raise ValueError(f"{label} detail coverage mismatch: {index_path}")
    for row in rows:
        yield row, details_by_id[row["id"]]


def registry_candidates(national_dir: Path, guangdong_dir: Path):
    national = read_object(national_dir / "manifest.v1.json")
    national_snapshot = snapshot(national, "national registry")
    guangdong_index = read_object(guangdong_dir / "index.v1.json")
    guangdong_snapshot = snapshot(guangdong_index, "Guangdong registry")
    by_code: dict[str, list[dict]] = defaultdict(list)
    seen_ids: set[tuple[str, str]] = set()
    national_rows = 0
    for location in locations(national, "national registry"):
        province, province_slug, city, city_slug, _path, _count = location
        for indexed, detail in city_records(national_dir, location, national_snapshot,
                                            "national registry", ("id", "rowNumber", "name", "province", "city", "sourceId")):
            row_id = required_text(indexed.get("id"), "national registry ID")
            if ("nationalRegistry", row_id) in seen_ids:
                raise ValueError(f"duplicate national registry ID: {row_id}")
            seen_ids.add(("nationalRegistry", row_id))
            if indexed.get("province") != province or indexed.get("city") != city:
                raise ValueError(f"national registry row location mismatch: {row_id}")
            code = checked_code(detail, "codeValidity", "national registry")
            if code:
                by_code[code].append({"kind": "nationalRegistry", "id": row_id,
                                      "provinceSlug": province_slug, "citySlug": city_slug,
                                      "province": province, "city": city,
                                      "name": required_text(indexed.get("name"), "national registry name")})
            national_rows += 1
    if national_rows != national["rowCount"]:
        raise ValueError("national registry index incomplete")
    gd_rows = guangdong_index.get("records")
    if not isinstance(gd_rows, list):
        raise ValueError("invalid Guangdong registry index")
    gd_chunks: dict[str, list[dict]] = defaultdict(list)
    for row in gd_rows:
        if not isinstance(row, dict) or not isinstance(row.get("chunk"), str) or not CHUNK.fullmatch(row["chunk"]):
            raise ValueError("invalid Guangdong registry index row")
        gd_chunks[row["chunk"]].append(row)
    for filename, expected in gd_chunks.items():
        chunk = read_object(guangdong_dir / filename)
        details = chunk.get("records")
        if chunk.get("schemaVersion") != 1 or chunk.get("snapshotId") != guangdong_snapshot or not isinstance(details, list) or len(details) != len(expected):
            raise ValueError(f"Guangdong registry detail snapshot or count mismatch: {filename}")
        for indexed, detail in zip(expected, details):
            if not isinstance(detail, dict) or any(detail.get(key) != indexed.get(key) for key in ("id", "rowNumber", "name", "city")):
                raise ValueError(f"Guangdong registry detail and index disagree: {filename}")
            row_id = required_text(indexed.get("id"), "Guangdong registry ID")
            if ("guangdongRegistry", row_id) in seen_ids:
                raise ValueError(f"duplicate Guangdong registry ID: {row_id}")
            seen_ids.add(("guangdongRegistry", row_id))
            code = checked_code(detail, "codeValidity", "Guangdong registry")
            if code:
                by_code[code].append({"kind": "guangdongRegistry", "id": row_id,
                                      "provinceSlug": None, "citySlug": None,
                                      "province": "广东省",
                                      "city": required_text(indexed.get("city"), "Guangdong registry city"),
                                      "name": required_text(indexed.get("name"), "Guangdong registry name")})
    return national_snapshot, guangdong_snapshot, by_code


def build(reference_dir: Path = REFERENCE_DIR, national_dir: Path = NATIONAL_DIR,
          guangdong_dir: Path = GUANGDONG_DIR) -> dict[str, bytes]:
    reference = read_object(reference_dir / "manifest.v1.json")
    reference_snapshot = snapshot(reference, "institution reference")
    national_snapshot, guangdong_snapshot, by_code = registry_candidates(national_dir, guangdong_dir)
    basis = {"schemaVersion": 1, "referenceSnapshotId": reference_snapshot,
             "nationalSnapshotId": national_snapshot, "guangdongSnapshotId": guangdong_snapshot}
    snapshot_id = "v1-" + hashlib.sha256(json_bytes(basis)).hexdigest()[:16]
    outputs: dict[str, bytes] = {}
    seen_reference_ids: set[str] = set()
    eligible = unique_hits = linked = cross = ambiguous = regions = reference_rows = 0
    for location in locations(reference, "institution reference"):
        province, province_slug, _city, city_slug, _path, _count = location
        links = []
        for indexed, detail in city_records(reference_dir, location, reference_snapshot,
                                            "institution reference", ("id", "sourceRow", "name", "region", "address", "beds")):
            row_id = required_text(indexed.get("id"), "institution reference ID")
            if row_id in seen_reference_ids:
                raise ValueError(f"duplicate institution reference ID: {row_id}")
            seen_reference_ids.add(row_id)
            reference_rows += 1
            code = checked_code(detail, "codeStatus", "institution reference")
            if not code:
                continue
            eligible += 1
            targets = by_code.get(code, [])
            if len(targets) > 1:
                ambiguous += 1
            elif len(targets) == 1:
                unique_hits += 1
                target = targets[0]
                if target["province"] == province:
                    links.append({"referenceId": row_id, "target": target})
                    linked += 1
                else:
                    cross += 1
        outputs[f"{province_slug}/{city_slug}/links.v1.json"] = json_bytes({
            "schemaVersion": 1, "snapshotId": snapshot_id,
            "referenceSnapshotId": reference_snapshot,
            "provinceSlug": province_slug, "citySlug": city_slug, "links": links,
        })
        regions += 1
    if reference_rows != reference["rowCount"] or linked + cross != unique_hits:
        raise ValueError("institution reference count mismatch")
    outputs = {"manifest.v1.json": json_bytes({
        **basis, "snapshotId": snapshot_id, "referenceRowCount": reference_rows,
        "eligibleReferenceCount": eligible, "uniqueCodeHitCount": unique_hits,
        "linkedReferenceCount": linked, "crossProvinceHitCount": cross,
        "ambiguousReferenceCount": ambiguous, "regionCount": regions,
    }), **outputs}
    return outputs


def write_outputs(outputs: dict[str, bytes], output_dir: Path = OUTPUT_DIR, *, check: bool) -> None:
    actual = ({file.relative_to(output_dir).as_posix() for file in output_dir.rglob("*")
               if file.is_file()} if output_dir.exists() else set())
    expected = set(outputs)
    if check and actual != expected:
        raise ValueError("registry links file set differs")
    if not check and actual - expected:
        raise ValueError("registry links stale output files remain")
    for filename, data in outputs.items():
        path = output_dir / filename
        if check:
            if not path.is_file() or path.read_bytes() != data:
                raise ValueError(f"registry links output differs: {filename}")
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Compare all generated links with public snapshots")
    args = parser.parse_args()
    outputs = build()
    write_outputs(outputs, check=args.check)
    manifest = json.loads(outputs["manifest.v1.json"])
    print(f"{'Checked' if args.check else 'Wrote'} {len(outputs)} files; "
          f"{manifest['uniqueCodeHitCount']} unique-code hits, "
          f"{manifest['linkedReferenceCount']} same-province candidates, "
          f"{manifest['crossProvinceHitCount']} cross-province audit rows, "
          f"{manifest['ambiguousReferenceCount']} ambiguous rows; "
          f"snapshot {manifest['snapshotId']}")


if __name__ == "__main__":
    main()
