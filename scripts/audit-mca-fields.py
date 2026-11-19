"""Inventory MCA list/detail field paths without copying field values."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path


def value_type(value):
    if value is None:
        return 'null'
    if isinstance(value, bool):
        return 'bool'
    if isinstance(value, int):
        return 'int'
    if isinstance(value, float):
        return 'float'
    if isinstance(value, str):
        return 'str'
    if isinstance(value, list):
        return 'list'
    if isinstance(value, dict):
        return 'dict'
    raise ValueError('unsupported JSON value type')


def collect_paths(value, path, observed):
    observed.setdefault(path, set()).add(value_type(value))
    if isinstance(value, dict):
        for key, child in value.items():
            if not isinstance(key, str):
                raise ValueError('JSON object key is not text')
            collect_paths(child, f'{path}.{key}' if path else key, observed)
    elif isinstance(value, list):
        for child in value:
            collect_paths(child, path + '[]', observed)


def add_record(value, prefix, fields):
    if not isinstance(value, dict):
        raise ValueError(f'{prefix} must be an object')
    observed = {}
    for key, child in value.items():
        collect_paths(child, prefix + '.' + key, observed)
    for path, types in observed.items():
        entry = fields.setdefault(path, {'presentCount': 0, 'nonNullCount': 0, 'types': set()})
        entry['presentCount'] += 1
        entry['nonNullCount'] += int(types != {'null'})
        entry['types'].update(types)


def load_json(path):
    with path.open(encoding='utf-8-sig') as stream:
        return json.load(stream)


def inventory(root, area_code=None, detail_ids=None):
    if not root.is_dir():
        raise ValueError(f'input directory does not exist: {root}')
    area_pattern = f'area-{area_code}' if area_code is not None else 'area-*'
    fields = {}
    list_files = list_rows = detail_files = 0
    for path in sorted(root.glob(f'{area_pattern}/pages/*.json')):
        data = load_json(path)['response']['data']
        records = data['records']
        if not isinstance(records, list):
            raise ValueError(f'list records are not an array: {path}')
        list_files += 1
        for record in records:
            add_record(record, 'list', fields)
            list_rows += 1
    for path in sorted(root.glob(f'{area_pattern}/details/*.json')):
        if detail_ids is not None and path.stem not in detail_ids:
            continue
        endpoints = load_json(path)['endpoints']
        if not isinstance(endpoints, dict):
            raise ValueError(f'detail endpoints are not an object: {path}')
        detail_files += 1
        for name in ('orgBaseDetail', 'yangLaoOrgDetail'):
            if name in endpoints:
                add_record(endpoints[name]['response']['data'], name, fields)
    return {
        'schemaVersion': 1, 'listFiles': list_files, 'listRows': list_rows,
        'detailFiles': detail_files,
        'fields': {path: {**entry, 'types': sorted(entry['types'])} for path, entry in sorted(fields.items())},
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    report = inventory(args.root)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    temporary = args.output.with_name(args.output.name + '.tmp')
    temporary.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    os.replace(temporary, args.output)
    print(json.dumps({key: report[key] for key in ('listFiles', 'listRows', 'detailFiles')}, ensure_ascii=False))


if __name__ == '__main__':
    main()
