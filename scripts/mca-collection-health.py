"""Read-only, redacted MCA collection health snapshot; stdout only, no network."""
from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime, timedelta, timezone
import hashlib
import json
from pathlib import Path
import re
import runpy

PROJECT = Path(__file__).resolve().parents[1]
AUDIT = runpy.run_path(str(PROJECT / 'scripts/audit-mca-pipeline-progress.py'))
TREE_AUTO = runpy.run_path(str(PROJECT / 'scripts/run-mca-tree-auto-resume.py'))
ROOT = AUDIT['ROOT']
FOLDERS = {
    'tree': ('area-tree-20261119',),
    'firstPages': ('national-area-first-pages-20261119',),
    'probe': ('area-level3-probe-20261119',),
    'pages': ('national-area-followup-pages-20261119', 'national-area-large-pages-20261119'),
    'details': ('national-observed-details-20261119',),
}
COUNT_FIELDS = ('savedResponses', 'seedCount', 'completedAreaCount', 'pendingAreaCount',
                'plannedParentCount', 'pendingParents', 'level4NodeCount',
                'selectedAreaCount', 'areasPagesObservedComplete', 'areasUnverified',
                'uniqueIdCount', 'completedDetailCount', 'invalidCodeNodeCount')
PHASES = {'running', 'waiting', 'blocked', 'finished', 'failed', 'stopped'}


def status_failed(value):
    return bool(value.get('error') or value.get('lastError')
                or value.get('phase') in ('blocked', 'failed')
                or value.get('rateLimited') is True
                or (value.get('phase') == 'finished' and value.get('exitCode') not in (None, 0)))


def verified_tree_budget_stop(root, status, manifest, now):
    """Recognize the existing wrapper's exit-1 clean-budget contract, read-only."""
    if status.get('phase') != 'finished' or not TREE_AUTO['clean_partial'](status):
        return False
    run_id = status.get('runId')
    if not isinstance(run_id, str) or not re.fullmatch(r'tree-[0-9]{8}-[a-z][a-z0-9-]*', run_id):
        return False
    try:
        started = timestamp(status.get('startedAtUtc'), now)
        ended = timestamp(status.get('endedAtUtc'), now)
        if started is None or ended is None or ended < started:
            return False
        one_shot = TREE_AUTO['ONE_SHOT']
        raw = one_shot['owned_manifest_path'](root, run_id).read_bytes()
        if hashlib.sha256(raw).hexdigest() != status['collectorManifestSha256']:
            return False
        owned = one_shot['read_tree_manifest'](
            root, started, ended, manifest_bytes=raw, expected_run_id=run_id)
        return (owned == manifest and owned.get('lastError') is None
                and all(owned.get(key) == status.get(key) for key in (
                    'treeWalkComplete', 'rateLimited', 'requestBudgetReached',
                    'requestsThisRun', 'savedResponses'))
                and len(owned['pendingParentIds']) == status.get('pendingAfter'))
    except (OSError, RuntimeError, ValueError, TypeError, KeyError):
        return False


def read_object(path):
    if not path.exists():
        return None, 'missing'
    try:
        value = json.loads(path.read_text(encoding='utf-8-sig'))
        if not isinstance(value, dict):
            raise ValueError('object required')
        return value, 'present'
    except (OSError, ValueError, TypeError):
        return None, 'invalid'


def timestamp(value, now):
    moment = AUDIT['parsed_utc'](value)
    return moment if moment is not None and moment <= now else None


def response_observations(root, stage, now):
    pattern = ('responses/*.json' if stage in ('tree', 'probe') else
               'detail-checkpoints/*/*.json' if stage == 'details' else 'area-*/pages/*.json')
    paths = [p for folder in FOLDERS[stage] for p in (root / folder).glob(pattern)]
    valid, invalid, legacy, moments = 0, 0, 0, []
    for path in paths:
        item, state = read_object(path)
        if state != 'present':
            invalid += 1
            continue
        try:
            integrity, issues = Counter(), Counter()
            tree = stage in ('tree', 'probe')
            if not AUDIT['check_body'](item, integrity, issues, tree=tree):
                raise ValueError('invalid body')
            body = item['response']
            if item.get('httpStatus') != 200 or body.get('code') != 0:
                raise ValueError('unsuccessful response')
            if tree:
                good = (item.get('parentId') == path.stem and item.get('method') == 'GET'
                        and AUDIT['official_url'](item.get('sourceUrl'), AUDIT['TREE_PATH'] + path.stem)
                        and isinstance(body.get('data'), list))
            else:
                request = item.get('request', {})
                params = request.get('params', {})
                good = request.get('method') == 'POST' and isinstance(body.get('data'), dict)
                if stage == 'details':
                    good = (good and path.stem in AUDIT['DETAIL_NAMES']
                            and params == {'axbe0001': path.parent.name}
                            and AUDIT['official_url'](request.get('url'), AUDIT['DETAIL_PATH'] + path.stem))
                else:
                    area = AUDIT['AREA'].fullmatch(path.parent.parent.name)
                    page = AUDIT['PAGE'].fullmatch(path.name)
                    data = body.get('data', {})
                    good = (good and bool(area) and bool(page)
                            and AUDIT['official_url'](request.get('url'), AUDIT['LIST_PATH'])
                            and params.get('areaCode') == area.group(1)
                            and params.get('current') == int(page.group(1))
                            and data.get('current') == int(page.group(1))
                            and isinstance(data.get('records'), list))
            moment = timestamp(item.get('fetchedAtUtc'), now)
            if not good or moment is None:
                raise ValueError('invalid source or timestamp')
            valid += 1
            legacy += item.get('rawBodyBase64') is None
            # Parsed-only legacy list responses have no verifiable bytes.
            if item.get('rawBodyBase64') is not None or tree:
                moments.append(moment)
        except (ValueError, TypeError, KeyError, AttributeError):
            invalid += 1
    return {'responseFileCount': len(paths), 'validResponseCount': valid,
            'invalidResponseCount': invalid, 'responsesWithoutRawBytes': legacy}, moments


def reported_complete(stage, manifests, responses):
    if any(m is None for m in manifests):
        return False
    m = manifests[0]
    if stage == 'tree':
        return (m.get('treeWalkComplete') is True and m.get('pendingParentIds') == []
                and m.get('savedResponses') == responses['validResponseCount'])
    if stage == 'firstPages':
        return (type(m.get('seedCount')) is int and m.get('pendingAreaCount') == 0
                and m.get('completedAreaCount') == m['seedCount']
                and responses['validResponseCount'] >= m['seedCount'])
    if stage == 'probe':
        return (m.get('allLevel3ChildrenEnumerated') is True and m.get('pendingParents') == 0
                and m.get('activeBatch') is None
                and m.get('savedResponses') == responses['validResponseCount'])
    if stage == 'pages':
        return all(type(v.get('selectedAreaCount')) is int
                   and v.get('selectedAreaCount') == v.get('areasPagesObservedComplete')
                   and v.get('areasUnverified') == 0 for v in manifests)
    return (m.get('detailsCompleteForObservedIds') is True
            and type(m.get('uniqueIdCount')) is int
            and m.get('uniqueIdCount') == m.get('completedDetailCount')
            and responses['validResponseCount'] >= 2 * m['uniqueIdCount'])


def stage_snapshot(root, stage, now):
    counts, moments = response_observations(root, stage, now)
    manifests, reported_counts, invalid_manifest, source_error = [], {}, False, False
    manifest_error_times = []
    for folder in FOLDERS[stage]:
        value, state = read_object(root / folder / 'manifest.json')
        manifests.append(value)
        invalid_manifest |= state == 'invalid'
        if value is None:
            continue
        source_error |= bool(value.get('lastError') or value.get('error'))
        source_error |= value.get('rateLimited') is True
        if value.get('lastError') or value.get('error') or value.get('rateLimited') is True:
            manifest_error_times.append(timestamp(value.get('auditedAtUtc'), now))
        for key in COUNT_FIELDS:
            if key in value:
                if type(value[key]) is not int or value[key] < 0:
                    invalid_manifest = True
                else:
                    reported_counts[key] = reported_counts.get(key, 0) + value[key]
        if 'pendingParentIds' in value:
            if not isinstance(value['pendingParentIds'], list):
                invalid_manifest = True
            else:
                reported_counts['pendingParentCount'] = len(value['pendingParentIds'])
    status_paths = (list((root / 'batch-runs').glob('tree-*.status.json')) if stage == 'tree' else
                    [p for folder in FOLDERS[stage]
                     for p in (root / folder / 'batch-runs').glob('*.status.json')])
    statuses, invalid_statuses = [], []
    latest_by_group = {}
    for path in status_paths:
        value, status = read_object(path)
        when = timestamp(value.get('startedAtUtc') or value.get('checkedAtUtc'), now) if value else None
        if (status != 'present' or not isinstance(value.get('phase'), str)
                or value['phase'] not in PHASES or when is None):
            invalid_statuses.append((path.parent, when))
        else:
            statuses.append((when, value, path.parent))
            group = path.parent
            if group not in latest_by_group or when > latest_by_group[group][0]:
                latest_by_group[group] = (when, value)
    entries = list(latest_by_group.values())
    active_entries = [entry for entry in entries if entry[1]['phase'] in ('running', 'waiting', 'stopped')]
    selected = max(active_entries or entries, key=lambda pair: pair[0]) if entries else None
    latest = selected[1] if selected else {}
    phase = latest.get('phase')
    invalid_status = any(when is None or group not in latest_by_group
                         or when >= latest_by_group[group][0] for group, when in invalid_statuses)
    historical_invalid_count = sum(when is not None and group in latest_by_group
                                   and when < latest_by_group[group][0]
                                   for group, when in invalid_statuses)
    prior_manifest_error = (source_error and stage != 'pages' and phase == 'running'
                            and all(when is not None and when < selected[0]
                                    for when in manifest_error_times))
    manifest_error_present = source_error
    if prior_manifest_error:
        source_error = False
    budget_stop = stage == 'tree' and verified_tree_budget_stop(root, latest, manifests[0], now)
    historical_failure_count = sum(
        when < latest_by_group[group][0] and status_failed(value)
        and not (stage == 'tree' and TREE_AUTO['clean_partial'](value, require_owned=False))
        for when, value, group in statuses)
    for _, branch in entries:
        if not (budget_stop and branch is latest):
            source_error |= status_failed(branch)
    if invalid_status:
        state, code = 'blocked', 'invalid_status'
    elif invalid_manifest:
        state, code = 'blocked', 'invalid_manifest'
    elif counts['invalidResponseCount']:
        state, code = 'blocked', 'invalid_response'
    elif source_error:
        state, code = 'blocked', 'source_error'
    elif phase in ('waiting', 'running', 'stopped'):
        state, code = phase, 'running_prior_manifest_error' if prior_manifest_error else phase
    elif budget_stop:
        state, code = 'partial', 'request_budget_reached'
    elif reported_complete(stage, manifests, counts):
        state, code = 'reported_complete', 'reported_complete'
    elif any(m is not None for m in manifests) or counts['responseFileCount'] or statuses:
        state, code = 'partial', 'incomplete'
    else:
        state, code = 'not_started', 'not_started'
    last = max(moments) if moments else None
    observed_status_time = (timestamp(latest.get('endedAtUtc'), now) if phase == 'finished' else None)
    observed_status_time = observed_status_time or (selected[0] if selected else None)
    return {'state': state, 'code': code, **counts, 'reportedCounts': reported_counts,
            'statusObservedAtUtc': observed_status_time.isoformat() if observed_status_time else None,
            'statusAgeSeconds': int((now - observed_status_time).total_seconds()) if observed_status_time else None,
            'historicalInvalidStatusCount': historical_invalid_count,
            'historicalFailureCount': historical_failure_count,
            'latestBudgetStopVerified': budget_stop,
            'historicalHandoffBlockCount': 0,
            'lastHistoricalHandoffBlockAtUtc': None,
            'manifestErrorPresent': manifest_error_present,
            'coverageGapCount': reported_counts.get('invalidCodeNodeCount'),
            'lastSuccessfulResponseAtUtc': last.isoformat() if last else None,
            'noProgressSeconds': int((now - last).total_seconds()) if last else None}, moments


def apply_handoff_observations(root, stages, now):
    mapping = {'area-tree': 'tree', 'first-pages': 'firstPages',
               'build-area-seeds': 'firstPages', 'first-page-controller': 'firstPages',
               'level3-probe': 'probe', 'small-pages': 'pages', 'large-pages': 'pages',
               'observed-details': 'details'}
    for filename in ('stage-handoff.status.json', 'observed-stage-handoff.status.json'):
        value, state = read_object(root / 'batch-runs' / filename)
        if state == 'missing':
            continue
        fallback = next((s for s in FOLDERS if stages[s]['state'] != 'reported_complete'), 'details')
        stage_name = value.get('stage') if value else None
        target = mapping.get(stage_name, fallback) if isinstance(stage_name, str) else fallback
        when = timestamp(value.get('startedAtUtc') or value.get('checkedAtUtc'), now) if value else None
        if (state == 'invalid' or when is None or not isinstance(value.get('phase'), str)
                or value['phase'] not in PHASES or isinstance(stage_name, (dict, list))):
            if stages[target]['state'] != 'blocked':
                stages[target].update(state='blocked', code='invalid_handoff_status')
            continue
        # This handoff poll re-reads the previously committed tree manifest;
        # its newer checkedAtUtc is not a new failure of the running batch.
        # Keep the downstream block visible without replacing batch state.
        stale_manifest_poll = (filename == 'observed-stage-handoff.status.json'
                               and stage_name == 'area-tree'
                               and stages[target]['state'] == 'running'
                               and stages[target]['code'] == 'running_prior_manifest_error'
                               and value['phase'] == 'blocked'
                               and value.get('reason') == 'upstream area tree failed or rate limited'
                               and not value.get('error')
                               and all(value.get(key) in (None, 0)
                                       for key in ('childExitCode', 'firstPageExitCode')))
        if stale_manifest_poll:
            stages[target]['historicalHandoffBlockCount'] += 1
            stages[target]['lastHistoricalHandoffBlockAtUtc'] = when.isoformat()
            stages[target]['downstreamHandoffCode'] = 'blocked_on_prior_tree_manifest'
            continue
        previous = AUDIT['parsed_utc'](stages[target]['statusObservedAtUtc'])
        if previous is not None and previous > when:
            if value['phase'] in ('blocked', 'failed'):
                stages[target]['historicalHandoffBlockCount'] += 1
                stages[target]['lastHistoricalHandoffBlockAtUtc'] = when.isoformat()
                stages[target]['downstreamHandoffCode'] = 'historical_handoff_block'
            continue
        if stages[target]['state'] == 'blocked':
            continue
        phase = value['phase']
        failed = (phase in ('blocked', 'failed') or bool(value.get('error'))
                  or any(value.get(key) not in (None, 0) for key in ('childExitCode', 'firstPageExitCode')))
        if failed or phase in ('running', 'waiting', 'stopped'):
            stages[target].update(state='blocked' if failed else phase,
                                  code='handoff_error' if failed else phase,
                                  statusObservedAtUtc=when.isoformat(),
                                  statusAgeSeconds=int((now - when).total_seconds()))


def shared_limits(root, now):
    value, state = read_object(root / 'rate-limit.json')
    cooldown = {'state': 'unknown' if state == 'missing' else 'invalid',
                'remainingSeconds': None, 'untilUtc': None}
    if value is not None:
        detected = timestamp(value.get('detectedAtUtc'), now)
        until = AUDIT['parsed_utc'](value.get('cooldownUntilUtc'))
        if detected is not None and until is not None and until >= detected:
            cooldown = {'state': 'active' if until > now else 'expired',
                        'remainingSeconds': max(0, int((until - now).total_seconds())),
                        'untilUtc': until.isoformat()}
    value, state = read_object(root / 'hourly-request-budget.json')
    budget = {'state': 'unknown' if state == 'missing' else 'invalid',
              'limit': 60, 'windowSeconds': 3600, 'used': None, 'remaining': None, 'resumeAtUtc': None}
    if value is not None and (value.get('schemaVersion') == 1 and value.get('limit') == 60
                             and value.get('windowSeconds') == 3600
                             and isinstance(value.get('requestStartedAtUtc'), list)):
        starts = [timestamp(v, now) for v in value['requestStartedAtUtc']]
        if all(v is not None for v in starts):
            recent = sorted(v for v in starts if v > now - timedelta(seconds=3600))
            budget.update(state='exhausted' if len(recent) >= 60 else 'available',
                          used=len(recent), remaining=max(0, 60 - len(recent)),
                          resumeAtUtc=(recent[len(recent) - 60] + timedelta(seconds=3600)).isoformat()
                          if len(recent) >= 60 else None)
    return cooldown, budget


def snapshot(root, *, now=None):
    root = Path(root)
    if not root.is_dir():
        raise ValueError('cache_root_unavailable')
    now = now or datetime.now(timezone.utc)
    if now.tzinfo is None:
        raise ValueError('snapshot_time_requires_timezone')
    now = now.astimezone(timezone.utc)
    stages, moments = {}, []
    for stage in FOLDERS:
        stages[stage], found = stage_snapshot(root, stage, now)
        moments.extend(found)
    apply_handoff_observations(root, stages, now)
    cooldown, budget = shared_limits(root, now)
    current = next((s for s in FOLDERS if stages[s]['state'] != 'reported_complete'), None)
    blocker = {'stage': current, 'code': stages[current]['code']} if current else None
    if current and stages[current]['state'] != 'blocked':
        for condition, code in ((cooldown['state'] == 'invalid', 'invalid_cooldown'),
                                (budget['state'] == 'invalid', 'invalid_hourly_budget'),
                                (cooldown['state'] == 'active', 'cooldown_active'),
                                (budget['state'] == 'exhausted', 'hourly_budget_exhausted')):
            if condition:
                blocker['code'] = code
                break
    last = max(moments) if moments else None
    return {'schemaVersion': 1, 'auditedAtUtc': now.isoformat(), 'atomicSnapshot': False,
            'processLivenessVerified': False,
            'currentStage': current, 'upstreamBlocker': blocker, 'stages': stages,
            'lastSuccessfulResponseAtUtc': last.isoformat() if last else None,
            'noProgressSeconds': int((now - last).total_seconds()) if last else None,
            'cooldown': cooldown, 'hourlyBudget': budget,
            'nationalComplete': False, 'snapshotVerified': False, 'publishable': False}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=ROOT)
    args = parser.parse_args(argv)
    try:
        result = snapshot(args.root)
    except (ValueError, OSError):
        print(json.dumps({'code': 'snapshot_unavailable', 'publishable': False}))
        return 2
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
