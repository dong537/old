"""Read-only local field evidence. Output aggregates, never institution values/IDs."""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import hashlib
import json
from pathlib import Path
import re
import runpy


def summary(values):
    counts = Counter()
    types = Counter()
    for value in values:
        types[type(value).__name__] += 1
        if value is None:
            counts['null'] += 1
        elif isinstance(value, str) and not value.strip():
            counts['blankString'] += 1
            counts['emptyString' if value == '' else 'whitespaceOnlyString'] += 1
        elif isinstance(value, (list, dict)) and not value:
            counts['emptyContainer'] += 1
        else:
            counts['populated'] += 1
        if type(value) in (int, float) and value == 0:
            counts['numericZero'] += 1
        if value == '0':
            counts['stringZero'] += 1
    return {'present': len(values), 'types': dict(sorted(types.items())), **dict(counts)}


def cache_paths(root):
    folders = sorted(p for p in root.glob('area-*') if p.is_dir()
                     and re.match(r'area-\d{12}(?:-|$)', p.name))
    return ([p for folder in folders for p in sorted((folder / 'pages').glob('*.json'))],
            [p for folder in folders for p in sorted((folder / 'details').glob('*.json'))],
            [folder / 'manifest.json' for folder in folders])


def audit(root):
    files, details, manifests = cache_paths(root)
    baseline = root / 'production-readiness-audit.json'
    static = root / 'static-js/chunk-3d5896b7.22ca4f71.js'
    sources = files + details + manifests + [baseline, static]
    blobs = {p: p.read_bytes() for p in sources}
    old = json.loads(blobs[baseline].decode('utf-8-sig'))
    fresh = runpy.run_path(str(Path(__file__).with_name(
        'audit-mca-production-readiness.py')))['audit'](root)
    if (fresh['issues']
            or old.get('integrity', {}).get('cacheFileSetSha256')
            != fresh['integrity']['cacheFileSetSha256']
            or old.get('fields') != fresh['fields']):
        raise ValueError('Stale or inconsistent baseline; rerun production readiness audit offline')
    targets = fresh['fields']['unreviewedNonNullPaths']
    by_id = defaultdict(list)
    records = defaultdict(list)
    for p in files:
        wrapper = json.loads(blobs[p].decode('utf-8-sig'))
        if wrapper['httpStatus'] != 200 or wrapper['response']['code'] != 0:
            raise ValueError('Unsuccessful cached list response')
        for row in wrapper['response']['data']['records']:
            by_id[row['axbe0001']].append(row)
            records['list'].append(row)
    pairs = []
    for p in details:
        wrapper = json.loads(blobs[p].decode('utf-8-sig'))
        identifier = wrapper['institutionId']
        if identifier != p.stem:
            raise ValueError('Detail identity mismatch')
        for endpoint in ('orgBaseDetail', 'yangLaoOrgDetail'):
            part = wrapper['endpoints'][endpoint]
            if part['httpStatus'] != 200 or part['response']['code'] != 0:
                raise ValueError('Unsuccessful cached detail response')
            row = part['response']['data']
            records[endpoint].append(row)
            pairs.append((endpoint, identifier, row))
    script = blobs[static].decode('utf-8')
    fields = {}
    for path in targets:
        endpoint, key = path.split('.', 1)
        item = summary([row[key] for row in records[endpoint] if key in row])
        item['staticTokenMatches'] = len(re.findall(
            r'(?<![A-Za-z0-9_$])' + re.escape(key) + r'(?![A-Za-z0-9_$])', script))
        if endpoint != 'list':
            paired = [(row[key], [v[key] for v in by_id[identifier] if key in v])
                      for source, identifier, row in pairs
                      if source == endpoint and key in row and identifier in by_id]
            comparable = [(a, b) for a, b in paired if b]
            item['pairedWithList'] = len(comparable)
            item['equalAllListObservations'] = sum(all(a == v for v in b) for a, b in comparable)
        fields[path] = item
    if cache_paths(root) != (files, details, manifests):
        raise ValueError('Input file set changed during read; no consistent report emitted')
    changed = sum(p.read_bytes() != blob for p, blob in blobs.items())
    if changed:
        raise ValueError('Input changed during read; no consistent report emitted')
    digest = hashlib.sha256()
    for p in sorted(blobs):
        digest.update(str(p.relative_to(root)).replace('\\', '/').encode())
        digest.update(hashlib.sha256(blobs[p]).digest())
    return {'scope': 'local cached observations; not a national snapshot',
            'publishable': False, 'listFiles': len(files),
            'listRows': len(records['list']), 'uniqueObservedIds': len(by_id),
            'detailFiles': len(details), 'targetPathCount': len(targets),
            'inputSetSha256': digest.hexdigest(),
            'staticSha256': hashlib.sha256(blobs[static]).hexdigest(), 'fields': fields}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', required=True, type=Path)
    args = parser.parse_args()
    print(json.dumps(audit(args.root), ensure_ascii=False, indent=2))
