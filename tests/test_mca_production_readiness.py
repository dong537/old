"""Offline production-gate checks for saved MCA institution responses."""

import base64
import hashlib
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / 'scripts' / 'audit-mca-production-readiness.py'
AREA = '110101000000'
IDENTIFIER = 'id-secret-1'


def endpoint(name, data, *, raw=True):
    response = {'code': 0, 'data': data}
    body = json.dumps(response, ensure_ascii=False, separators=(',', ':')).encode()
    item = {
        'request': {'url': 'https://yanglao.mca.gov.cn/ylxxptapi/ylfwpt/ylfw/' + name,
                    'method': 'POST', 'params': {'axbe0001': IDENTIFIER}},
        'httpStatus': 200, 'responseSha256': hashlib.sha256(body).hexdigest(),
        'response': response,
    }
    if raw:
        item['rawBodyBase64'] = base64.b64encode(body).decode()
    return item


def setup_capture(root, *, raw_page=True, raw_details=True):
    folder = root / ('area-' + AREA + '-check-sort-1')
    (folder / 'pages').mkdir(parents=True)
    (folder / 'details').mkdir()
    (folder / 'manifest.json').write_text(json.dumps({
        'scope': folder.name, 'filters': {'areaCode': AREA, 'checkSort': 1},
        'total': 1, 'serverPageSize': 10, 'expectedPages': 1, 'complete': False,
    }), encoding='utf-8')
    record = {'axbe0001': IDENTIFIER, 'axbe0003': 'Private Institution',
              'axbe0013': 'Private Address', 'ahae2347': 10,
              'ahae0012': '13812345678', 'unexpectedField': 'private-marker'}
    response = {'code': 0, 'data': {'current': 1, 'size': 10, 'total': 1,
                                   'records': [record]}}
    body = json.dumps(response, ensure_ascii=False, separators=(',', ':')).encode()
    page = {
        'request': {'url': 'https://yanglao.mca.gov.cn/ylxxptapi/ylfwpt/ylfw/queryOrganizationDataList',
                    'method': 'POST',
                    'params': {'areaCode': AREA, 'checkSort': 1, 'current': 1, 'size': 10}},
        'httpStatus': 200, 'responseSha256': hashlib.sha256(body).hexdigest(),
        'response': response,
    }
    if raw_page:
        page['rawBodyBase64'] = base64.b64encode(body).decode()
    (folder / 'pages' / '00001.json').write_text(json.dumps(page), encoding='utf-8')
    detail = {'institutionId': IDENTIFIER, 'endpoints': {
        'orgBaseDetail': endpoint('orgBaseDetail', {
            'axbe0001': IDENTIFIER, 'axbe0003': 'Updated Private Institution',
            'axbe0013': 'Private Address', 'ahae2572': 'Private Person',
            'orgBaseInfo': {'note': 'Private narrative'},
        }, raw=raw_details),
        'yangLaoOrgDetail': endpoint('yangLaoOrgDetail', {
            'axbe0001': IDENTIFIER, 'ahae2347': 12,
        }, raw=raw_details),
    }}
    (folder / 'details' / f'{IDENTIFIER}.json').write_text(
        json.dumps(detail), encoding='utf-8')
    return folder


def run_audit(root):
    output = root / 'audit.json'
    completed = subprocess.run(
        [sys.executable, str(SCRIPT), '--root', str(root), '--output', str(output)],
        cwd=ROOT, text=True, capture_output=True, check=False,
    )
    if completed.returncode:
        raise AssertionError(completed.stderr or completed.stdout)
    return json.loads(output.read_text(encoding='utf-8'))


class McaProductionReadinessTests(unittest.TestCase):
    def test_new_level_four_observations_are_explicitly_unassessed(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            page = root / ('national-level4-first-pages-v1/area-' + AREA +
                           '/pages/00001.json')
            page.parent.mkdir(parents=True)
            page.write_text('{}', encoding='utf-8')
            detail = root / ('national-level4-observed-details-v1/details/' +
                             IDENTIFIER + '.json')
            detail.parent.mkdir(parents=True)
            detail.write_text('{}', encoding='utf-8')
            report = run_audit(root)
            self.assertEqual(report['modernObservationsNotAudited']['pageFiles'], 1)
            self.assertEqual(report['modernObservationsNotAudited']['detailFiles'], 1)
            self.assertEqual(report['modernObservationsNotAudited']['level4PageFiles'], 1)
            self.assertEqual(report['modernObservationsNotAudited']['level4DetailFiles'], 1)
            self.assertGreater(report['issues']['modernObservationSourcesNotAudited'], 0)
            self.assertFalse(report['publishable'])

    def test_zero_total_probe_and_area_tree_are_not_capture_errors(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / 'area-tree').mkdir()
            folder = root / ('area-' + AREA)
            (folder / 'pages').mkdir(parents=True)
            (folder / 'manifest.json').write_text(json.dumps({
                'scope': folder.name, 'filters': {'areaCode': AREA}, 'total': 0,
                'serverPageSize': 10, 'expectedPages': 0, 'complete': False,
            }), encoding='utf-8')
            response = {'code': 0, 'data': {'current': 1, 'size': 10, 'total': 0,
                                           'records': []}}
            body = json.dumps(response, separators=(',', ':')).encode()
            (folder / 'pages' / '00001.json').write_text(json.dumps({
                'request': {'url': 'https://yanglao.mca.gov.cn/ylxxptapi/ylfwpt/ylfw/queryOrganizationDataList',
                            'method': 'POST',
                            'params': {'areaCode': AREA, 'current': 1, 'size': 10}},
                'httpStatus': 200, 'responseSha256': hashlib.sha256(body).hexdigest(),
                'response': response, 'rawBodyBase64': base64.b64encode(body).decode(),
            }), encoding='utf-8')
            report = run_audit(root)
            self.assertEqual(report['counts']['captures'], 1)
            self.assertEqual(report['counts']['expectedPages'], 0)
            self.assertEqual(report['counts']['zeroTotalProbePages'], 1)
            self.assertEqual(report['counts']['missingPages'], 0)
            self.assertNotIn('invalidCaptureFolder', report['issues'])
            self.assertNotIn('invalidPageShape', report['issues'])

    def test_verified_raw_bodies_and_field_conflicts_remain_private(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            setup_capture(root)
            report = run_audit(root)
            self.assertFalse(report['publishable'])
            self.assertEqual(report['counts']['validPages'], 1)
            self.assertEqual(report['counts']['uniqueObservedIds'], 1)
            self.assertEqual(report['counts']['validDetails'], 1)
            self.assertEqual(report['integrity']['rawBodyVerified'], 3)
            self.assertEqual(report['integrity']['rawBodyUnavailable'], 0)
            self.assertEqual(report['conflicts']['listVsOrgBase']['axbe0003'], 1)
            self.assertEqual(report['conflicts']['listVsYangLao']['ahae2347'], 1)
            self.assertIn('list.unexpectedField', report['fields']['unreviewedNonNullPaths'])
            self.assertIn('orgBaseDetail.orgBaseInfo.note', report['fields']['privacyReviewPaths'])
            self.assertIn('list.ahae0012', report['fields']['restrictedContactPaths'])
            rendered = json.dumps(report, ensure_ascii=False)
            for private in (IDENTIFIER, 'Private Institution', 'Private Address',
                            'Private Person', 'Private narrative', '13812345678',
                            'private-marker'):
                self.assertNotIn(private, rendered)

    def test_declared_sha_without_raw_body_is_unverifiable(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            setup_capture(root, raw_page=False, raw_details=False)
            report = run_audit(root)
            self.assertEqual(report['integrity']['rawBodyUnavailable'], 3)
            self.assertEqual(report['integrity']['rawBodyVerified'], 0)
            self.assertEqual(report['counts']['validPages'], 1)
            self.assertEqual(report['counts']['validDetails'], 1)
            self.assertEqual(report['issues'].get('responseIntegrityMismatch', 0), 0)

    def test_tampered_raw_body_and_wrong_request_fail_closed(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            folder = setup_capture(root)
            page_path = folder / 'pages' / '00001.json'
            page = json.loads(page_path.read_text(encoding='utf-8'))
            page['request']['params']['areaCode'] = '440000000000'
            page_path.write_text(json.dumps(page), encoding='utf-8')
            detail_path = folder / 'details' / f'{IDENTIFIER}.json'
            detail = json.loads(detail_path.read_text(encoding='utf-8'))
            detail['endpoints']['orgBaseDetail']['rawBodyBase64'] = base64.b64encode(b'{}').decode()
            detail_path.write_text(json.dumps(detail), encoding='utf-8')
            report = run_audit(root)
            self.assertEqual(report['counts']['validPages'], 0)
            self.assertEqual(report['counts']['validDetails'], 0)
            self.assertEqual(report['issues']['requestMismatch'], 1)
            self.assertEqual(report['issues']['responseIntegrityMismatch'], 1)
            self.assertEqual(report['counts']['missingPages'], 1)

    def test_page_length_drift_is_not_counted_as_valid_coverage(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            folder = setup_capture(root)
            page_path = folder / 'pages' / '00001.json'
            page = json.loads(page_path.read_text(encoding='utf-8'))
            page['response']['data']['records'] = []
            raw = json.dumps(page['response'], ensure_ascii=False,
                             separators=(',', ':')).encode()
            page['responseSha256'] = hashlib.sha256(raw).hexdigest()
            page['rawBodyBase64'] = base64.b64encode(raw).decode()
            page_path.write_text(json.dumps(page), encoding='utf-8')
            report = run_audit(root)
            self.assertEqual(report['issues']['pageLengthMismatch'], 1)
            self.assertEqual(report['counts']['validPages'], 0)
            self.assertEqual(report['counts']['missingPages'], 1)


if __name__ == '__main__':
    unittest.main()
