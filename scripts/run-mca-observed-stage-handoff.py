"""Advance one audited MCA page/detail batch per periodic invocation.

This local scheduler sends no request itself. Each child rechecks the shared
site lock, cooldown and hourly ledger. A nonclean child or stale running state
blocks automatic retry; no private observation becomes a published snapshot.
"""

from __future__ import annotations

import json
import hashlib
import os
from datetime import datetime, timezone
from pathlib import Path
import runpy
import subprocess
import sys


PROJECT = Path(__file__).resolve().parents[1]
ROOT = PROJECT / 'data' / 'private' / 'mca-institutions-2026-11-18'
FIRST_DIR = ROOT / 'national-area-first-pages-20261119'
FIRST_AUTO = runpy.run_path(
    str(PROJECT / 'scripts' / 'run-mca-area-first-pages-auto.py'),
    run_name='mca_stage_first_auto')
STAGE_HANDOFF = runpy.run_path(
    str(PROJECT / 'scripts' / 'run-mca-stage-handoff.py'),
    run_name='mca_observed_stage_ceiling')
FOLLOWUP_AUTO = runpy.run_path(
    str(PROJECT / 'scripts' / 'run-mca-area-followup-auto.py'),
    run_name='mca_stage_followup_auto')
DETAIL_AUTO = runpy.run_path(
    str(PROJECT / 'scripts' / 'run-mca-observed-details-auto.py'),
    run_name='mca_stage_detail_auto')
PROBE = runpy.run_path(
    str(PROJECT / 'scripts' / 'probe-mca-level3-children.py'),
    run_name='mca_stage_level3_probe')
OVERLAY = runpy.run_path(
    str(PROJECT / 'scripts' / 'collect-mca-level4-observed.py'),
    run_name='mca_stage_level4_observed')
NORMALIZER = runpy.run_path(
    str(PROJECT / 'scripts' / 'normalize-mca-observed-private.py'),
    run_name='mca_stage_private_normalizer')
FETCHER = FOLLOWUP_AUTO['COLLECTOR']['FETCHER']
RUNS = ROOT / 'batch-runs'
STATUS_NAME = 'observed-stage-handoff.status.json'
STOP_NAME = 'observed-stage-handoff.stop'
TREE_FAILURE_REASON = 'upstream area tree failed or rate limited'
next_available_utc = PROBE['TREE_AUTO']['next_available_utc']


def now_utc():
    return datetime.now(timezone.utc).isoformat()


def save_status(root, value):
    runs = root / 'batch-runs'
    runs.mkdir(parents=True, exist_ok=True)
    path = runs / STATUS_NAME
    temporary = path.with_suffix('.json.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + chr(10),
                         encoding='utf-8')
    os.chmod(temporary, 0o600)
    os.replace(temporary, path)


def read_status(root):
    path = root / 'batch-runs' / STATUS_NAME
    if not path.exists():
        return None
    value = json.loads(path.read_text(encoding='utf-8'))
    if not isinstance(value, dict):
        raise RuntimeError('prior handoff status invalid')
    return value


def tree_failure_state(root):
    """Report an upstream failure without treating an unfinished tree as failed."""
    path = root / 'area-tree-20261119' / 'manifest.json'
    if not path.exists():
        return None, False
    manifest = json.loads(path.read_text(encoding='utf-8'))
    if not isinstance(manifest, dict):
        raise RuntimeError('area tree manifest invalid')
    if manifest.get('lastError') is not None or manifest.get('rateLimited') is True:
        return TREE_FAILURE_REASON, False
    if manifest.get('rateLimited') is not False:
        raise RuntimeError('area tree manifest lacks rate-limit state')
    return None, True


def private_status(phase, *, stage=None, reason=None, child_exit=None,
                   level4_count=None, normalization=None):
    status = {
        'schemaVersion': 1, 'phase': phase, 'checkedAtUtc': now_utc(),
        'stage': stage, 'reason': reason, 'childExitCode': child_exit,
        'nationalComplete': False, 'snapshotVerified': False,
        'publishable': False,
        'knownLevel4NodeCount': level4_count,
        'coverageGaps': ([{'kind': 'level-four-child-scope-not-enumerated',
                           'count': level4_count}]
                         if level4_count else []),
    }
    if normalization is not None:
        status['normalization'] = normalization
    return status


def first_ready():
    """Wait for a finished, immutable first-page chain and reaudited caches."""
    try:
        with FOLLOWUP_AUTO['COLLECTOR']['CONTROLLER_LOCK'](RUNS):
            handoff_path = ROOT / 'batch-runs' / 'stage-handoff.status.json'
            if not handoff_path.exists():
                return False, 'first-page handoff has not finished'
            handoff = json.loads(handoff_path.read_text(encoding='utf-8'))
            if not isinstance(handoff, dict):
                raise RuntimeError('first-page handoff status invalid')
            if handoff.get('phase') in ('waiting', 'running'):
                return False, 'first-page handoff is still in progress'
            if (handoff.get('phase') != 'finished'
                    or handoff.get('firstPageExitCode') != 0):
                raise RuntimeError('first-page handoff failed or disagrees')
            ceiling = STAGE_HANDOFF['first_page_batch_ceiling'](
                handoff.get('seedCount'))
            if handoff.get('firstPageBatchCeiling') != ceiling:
                raise RuntimeError('first-page handoff batch ceiling differs from seed count')
            _next, complete, source_sha = FIRST_AUTO['resume_state'](
                FIRST_DIR, 'firstpage-20261119-auto', ceiling)
            if not complete:
                return False, 'all official-area first pages are not cached'
            seed, checked_sha, observations, _first_sha = (
                FOLLOWUP_AUTO['COLLECTOR']['first_page_inputs'](
                    FOLLOWUP_AUTO['COLLECTOR']['SEED_PATH'],
                    FOLLOWUP_AUTO['COLLECTOR']['TREE_DIR'], FIRST_DIR))
            if (seed.get('seedCount') != handoff['seedCount']
                    or checked_sha != source_sha or not observations):
                raise RuntimeError('first-page chain and audited source differ')
    except RuntimeError as error:
        if str(error) == 'another tree controller is running':
            return False, 'another MCA collection stage is active'
        raise
    return True, 'official-area first pages audited'


def probe_stage():
    """Enumerate level-three children before accepting the area seed scope."""
    with PROBE['TREE_AUTO']['controller_lock'](ROOT / 'batch-runs'):
        plan = PROBE['source_plan'](PROBE['TREE'])
        cache = PROBE['scan_cache'](plan, PROBE['PROBE'])
        runs = PROBE['PROBE'] / 'batch-runs'
        paths = sorted(runs.glob('batch-*.status.json')) if runs.exists() else []
        next_number = len(paths) + 1
        if cache['pendingParents']:
            PROBE['prior_batch'](PROBE['PROBE'], plan, cache, next_number)
            return False, next_number, len(plan['parents']), cache['level4NodeCount']
        if plan['parents']:
            try:
                PROBE['prior_batch'](PROBE['PROBE'], plan, cache, next_number)
            except RuntimeError as error:
                if str(error) != 'level-three probe already complete':
                    raise
            else:
                raise RuntimeError('level-three probe cache lacks terminal batch')
        if not cache['allLevel3ChildrenEnumerated']:
            raise RuntimeError('level-three child probe has no terminal evidence')
        return True, next_number, len(plan['parents']), cache['level4NodeCount']


def overlay_seed_stage(level4_count):
    """Distinguish terminal zero from unknown and freeze a verified overlay."""
    state = OVERLAY['BUILDER']['preflight'](
        OVERLAY['TREE'], OVERLAY['ROOT'] / 'area-level3-probe-20261119')
    if state['status'] != 'ready' or state['level4NodeCount'] != level4_count:
        raise RuntimeError('terminal level-four source disagrees with probe stage')
    if level4_count == 0:
        return True, 0
    derived = OVERLAY['BUILDER']['build_overlay'](
        OVERLAY['TREE'], OVERLAY['ROOT'] / 'area-level3-probe-20261119')
    if derived['level4NodeCount'] != level4_count:
        raise RuntimeError('level-four count changed during source audit')
    path = OVERLAY['OVERLAY_PATH']
    if not path.exists():
        return False, derived['seedCount']
    supplied, _sha = OVERLAY['load_overlay_seeds'](path, OVERLAY['TREE'])
    if supplied != derived:
        raise RuntimeError('versioned level-four seed changed since probe')
    return True, supplied['seedCount']


def overlay_page_stage(mode):
    if mode == 'first':
        return OVERLAY['first_state']()
    return OVERLAY['page_state'](mode)


def overlay_detail_stage():
    return OVERLAY['detail_state']()


def page_stage(mode):
    """Return complete, next batch number, selected-area count."""
    if mode not in ('small', 'large'):
        raise ValueError('invalid page mode')
    output = (FOLLOWUP_AUTO['OUTPUT_DIR'] if mode == 'small'
              else FOLLOWUP_AUTO['LARGE_OUTPUT_DIR'])
    prefix = ('followup-20261119-auto' if mode == 'small'
              else 'largepage-20261119-auto')
    descendant_path = (OVERLAY['OVERLAY_PATH']
                       if OVERLAY['OVERLAY_PATH'].is_file() else None)
    check = ((lambda: FOLLOWUP_AUTO['preflight_mode'](
        mode, output, descendant_path)) if descendant_path is not None else
        FOLLOWUP_AUTO['preflight'] if mode == 'small' else
        FOLLOWUP_AUTO['preflight_large'])
    seed_sha, first_sha, total, count = check()
    next_number, complete, old_seed, old_first, old_total, old_count = (
        FOLLOWUP_AUTO['resume_state'](output, prefix, 9999, mode))
    if old_seed is not None and (
            seed_sha, first_sha, total, count) != (
            old_seed, old_first, old_total, old_count):
        raise RuntimeError(f'{mode}: audited cache and batch chain differ')
    if old_seed is None and count:
        raise RuntimeError(f'{mode}: cache exists without audited batch chain')
    if count == total and total > 0 and not complete:
        raise RuntimeError(f'{mode}: all pages present but final batch unverified')
    if complete and count != total:
        raise RuntimeError(f'{mode}: complete batch has missing pages')
    return count == total, next_number, total


def detail_stage():
    """Return completion only for the fixed union of observed list IDs."""
    descendant_path = (OVERLAY['OVERLAY_PATH']
                       if OVERLAY['OVERLAY_PATH'].is_file() else None)
    source_sha, total, count = (DETAIL_AUTO['preflight']()
                                if descendant_path is None else
                                DETAIL_AUTO['preflight'](descendant_path))
    next_number, complete, old_sha, old_total, old_count = (
        DETAIL_AUTO['resume_state'](
            DETAIL_AUTO['OUTPUT_DIR'], 'detail-20261119-auto', 5000))
    if old_sha is not None and (source_sha, total, count) != (
            old_sha, old_total, old_count):
        raise RuntimeError('detail queue or cache differs from audited batch chain')
    if old_sha is None and count:
        raise RuntimeError('detail cache exists without audited batch chain')
    if count == total and total > 0 and not complete:
        raise RuntimeError('all details present but final batch unverified')
    if complete and count != total:
        raise RuntimeError('complete detail batch has missing IDs')
    return count == total, next_number, total


def command_for(stage, next_number):
    if stage == 'private-normalization':
        return [sys.executable,
                str(PROJECT / 'scripts' / 'normalize-mca-observed-private.py')]
    if not 1 <= next_number <= 5000:
        raise RuntimeError('configured batch ceiling reached; manual review required')
    if stage == 'level3-probe':
        return [sys.executable,
                str(PROJECT / 'scripts' / 'probe-mca-level3-children.py'),
                '--execute', '--batch-number', str(next_number),
                '--max-parents', '20', '--max-requests', '20',
                '--interval', '60', '--jitter', '10']
    if stage == 'level4-seeds':
        return [sys.executable,
                str(PROJECT / 'scripts/build-mca-level4-overlay-seeds.py'),
                '--write']
    if stage in ('level4-first', 'level4-small',
                 'level4-large', 'level4-details'):
        return [sys.executable,
                str(PROJECT / 'scripts/collect-mca-level4-observed.py'),
                '--stage', stage.removeprefix('level4-'),
                '--batch-number', str(next_number)]
    if stage == 'small-pages':
        command = [sys.executable,
                str(PROJECT / 'scripts' / 'run-mca-area-followup-auto.py'),
                '--batch-prefix', 'followup-20261119-auto',
                '--max-batches', str(next_number)]
        if OVERLAY['OVERLAY_PATH'].is_file():
            command.append('--official-descendants-overlay-v1')
        return command
    if stage == 'large-pages':
        command = [sys.executable,
                str(PROJECT / 'scripts' / 'run-mca-area-followup-auto.py'),
                '--batch-prefix', 'largepage-20261119-auto',
                '--max-batches', str(next_number), '--page-mode', 'large']
        if OVERLAY['OVERLAY_PATH'].is_file():
            command.append('--official-descendants-overlay-v1')
        return command
    if stage == 'observed-details':
        command = [sys.executable,
                str(PROJECT / 'scripts' / 'run-mca-observed-details-auto.py'),
                '--batch-prefix', 'detail-20261119-auto',
                '--max-batches', str(next_number)]
        if OVERLAY['OVERLAY_PATH'].is_file():
            command.append('--official-descendants-overlay-v1')
        return command
    raise ValueError('invalid stage')


def defer_for_capacity(root, stage, level4_count):
    """Defer a saturated site to the next tick without launching a waiter.

    This is a read-only scheduling hint, not a reservation. The collector
    still owns the shared ledger and rechecks it under the existing lock.
    """
    now = datetime.now(timezone.utc)
    available = next_available_utc(root, now)
    if available <= now:
        return False
    save_status(root, private_status(
        'waiting', stage=stage,
        reason=f'shared hourly budget exhausted; next capacity at {available.isoformat()}; retry next scheduled invocation',
        level4_count=level4_count))
    return True


def add_identity_digest(digest, identifier):
    raw = identifier.encode('utf-8')
    digest.update(len(raw).to_bytes(4, 'big'))
    digest.update(raw)


def normalization_source(root):
    """Recheck every saved source batch before accepting a derived artifact."""
    report, _stages, owner, queue, metadata, expected = (
        NORMALIZER['verified_chain'](root))
    target = 'mergedItems' if owner.name == NORMALIZER['OVERLAY'] else 'items'
    ids, count = hashlib.sha256(), 0
    for key, value, kind in NORMALIZER['GATE']['queue_members'](queue):
        if key == target and kind == 'item':
            add_identity_digest(ids, value['institutionId'])
            count += 1
    if count != expected:
        raise RuntimeError('private normalization source count changed')
    return {
        'sourceInputFileSetSha256': report['inputFileSetSha256'],
        'sourceInventorySha256': metadata['sourceInventorySha256'],
        'sourceIdsSha256': ids.hexdigest(),
        'recordCount': expected,
    }


def normalized_output_digest(root, source, trusted_digest=None):
    """Parse the entire private output; reject truncation and stale provenance."""
    path = root / NORMALIZER['OUTPUT_NAME']
    if not path.is_file():
        raise RuntimeError('private normalized artifact missing')
    values, arrays = {}, set()
    count, previous, ids = 0, '', hashlib.sha256()
    for key, value, kind in NORMALIZER['GATE']['queue_members'](path):
        if kind == 'array':
            arrays.add(key)
        elif kind == 'value':
            values[key] = value
        elif key == 'records':
            if (not isinstance(value, dict)
                    or set(value) != {'mcaId', 'fields', 'listCoverage',
                                      'listObservationCount'}
                    or not isinstance(value.get('mcaId'), str)
                    or value['mcaId'] <= previous
                    or not isinstance(value.get('fields'), dict)
                    or not isinstance(value.get('listCoverage'), dict)
                    or type(value.get('listObservationCount')) is not int
                    or value['listObservationCount'] < 1):
                raise RuntimeError('private normalized artifact invalid')
            previous = value['mcaId']
            add_identity_digest(ids, previous)
            count += 1
        elif key == 'sourceBatches':
            if (not isinstance(value, dict)
                    or not isinstance(value.get('stage'), str)
                    or type(value.get('detailCount')) is not int
                    or type(value.get('batchCount')) is not int):
                raise RuntimeError('private normalized artifact invalid')
        else:
            raise RuntimeError('private normalized artifact invalid')
    if (arrays != {'records', 'sourceBatches'}
            or values.get('schemaVersion') != 1
            or values.get('scope') != 'verified_observed_mca_private_evidence'
            or any(values.get(flag) is not False for flag in
                   ('publishable', 'nationalComplete', 'snapshotVerified'))
            or values.get('sourceInputFileSetSha256') != source['sourceInputFileSetSha256']
            or values.get('sourceInventorySha256') != source['sourceInventorySha256']
            or ids.hexdigest() != source['sourceIdsSha256']
            or type(values.get('recordCount')) is not int
            or values['recordCount'] != source['recordCount']
            or count != source['recordCount']):
        raise RuntimeError('private normalized artifact or source mismatch')
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(65536), b''):
            digest.update(chunk)
    result = digest.hexdigest()
    if trusted_digest is not None and result != trusted_digest:
        raise RuntimeError('private normalized artifact changed')
    return result


def main(argv=None, *, root=ROOT, runner=None):
    if argv:
        raise ValueError('stage handoff accepts no arguments')
    runner = runner or subprocess.run
    runs = root / 'batch-runs'
    level4_count = None
    active_stage = None
    try:
        with FETCHER['exclusive_run_lock'](runs / 'observed-stage-lock'):
            prior = read_status(root)
            if prior is not None:
                level4_count = prior.get('knownLevel4NodeCount')
            tree_failure, tree_manifest_clean = tree_failure_state(root)
            recoverable_tree_block = (
                prior is not None and prior.get('phase') == 'blocked'
                and prior.get('stage') == 'area-tree'
                and prior.get('reason') == TREE_FAILURE_REASON)
            if prior is not None and (prior.get('phase') == 'running' or (
                    prior.get('phase') == 'blocked'
                    and not (recoverable_tree_block and tree_manifest_clean))):
                reason = (tree_failure if recoverable_tree_block and tree_failure
                          else 'prior running or blocked stage requires manual audit')
                save_status(root, private_status(
                    'blocked', stage=prior.get('stage'),
                    reason=reason,
                    level4_count=level4_count))
                return 2
            if tree_failure:
                save_status(root, private_status(
                    'blocked', stage='area-tree', reason=tree_failure,
                    level4_count=level4_count))
                return 2
            if (prior is not None and prior.get('stage') == 'private-normalization'
                    and prior.get('phase') in ('waiting', 'finished')):
                active_stage = 'private-normalization'
                source = normalization_source(root)
                saved = prior.get('normalization')
                if (not isinstance(saved, dict)
                        or any(saved.get(key) != value for key, value in source.items())
                        or prior['phase'] == 'waiting'
                        and prior.get('childExitCode') != 0):
                    raise RuntimeError('private normalization source or child state changed')
                digest = normalized_output_digest(
                    root, source, saved.get('outputSha256')
                    if prior['phase'] == 'finished' else None)
                if normalization_source(root) != source:
                    raise RuntimeError('private normalization source changed during verification')
                if prior['phase'] == 'waiting':
                    save_status(root, private_status(
                        'finished', stage='private-normalization',
                        reason='verified private observed evidence; national coverage not verified',
                        level4_count=level4_count,
                        normalization={**source, 'outputSha256': digest}))
                return 0
            if (runs / STOP_NAME).exists():
                save_status(root, private_status(
                    'waiting', reason='stop file present',
                    level4_count=level4_count))
                return 0
            ready, reason = first_ready()
            if not ready:
                save_status(root, private_status('waiting', stage='first-pages',
                                                 reason=reason,
                                                 level4_count=level4_count))
                return 0
            probe_complete, probe_number, probe_total, level4_count = probe_stage()
            if not probe_complete:
                stage, next_number, total = (
                    'level3-probe', probe_number, probe_total)
                if defer_for_capacity(root, stage, level4_count):
                    return 0
                command = command_for(stage, next_number)
                save_status(root, private_status(
                    'running', stage=stage,
                    reason=f'one bounded batch; selected={total}',
                    level4_count=level4_count))
                log_path = runs / f'observed-stage.{stage}.{next_number:04d}.log'
                with log_path.open('x', encoding='utf-8') as log:
                    child = runner(command, cwd=PROJECT, check=False,
                                   timeout=3600, stdout=log,
                                   stderr=subprocess.STDOUT)
                if child.returncode in (0, 1):
                    save_status(root, private_status(
                        'waiting', stage=stage,
                        reason='probe batch finished; reauditing next invocation',
                        child_exit=child.returncode,
                        level4_count=level4_count))
                    return 0
                save_status(root, private_status(
                    'blocked', stage=stage,
                    reason='probe batch failed; manual audit required',
                    child_exit=child.returncode,
                    level4_count=level4_count))
                return 2
            overlay_ready, coded_count = overlay_seed_stage(level4_count)
            if not overlay_ready:
                stage, next_number = 'level4-seeds', 1
                command = command_for(stage, next_number)
                save_status(root, private_status(
                    'running', stage=stage,
                    reason=f'freeze audited overlay; coded={coded_count}',
                    level4_count=level4_count))
                log_path = runs / 'observed-stage.level4-seeds.0001.log'
                with log_path.open('x', encoding='utf-8') as log:
                    child = runner(command, cwd=PROJECT, check=False,
                                   timeout=3600, stdout=log,
                                   stderr=subprocess.STDOUT)
                if child.returncode == 0:
                    save_status(root, private_status(
                        'waiting', stage=stage,
                        reason='overlay seed written; reauditing next invocation',
                        child_exit=0, level4_count=level4_count))
                    return 0
                save_status(root, private_status(
                    'blocked', stage=stage,
                    reason='overlay seed build failed; manual audit required',
                    child_exit=child.returncode,
                    level4_count=level4_count))
                return 2
            stages = []
            if coded_count:
                stages.extend((
                    ('level4-first', lambda: overlay_page_stage('first')),
                    ('level4-small', lambda: overlay_page_stage('small')),
                    ('level4-large', lambda: overlay_page_stage('large')),
                ))
            stages.extend((
                ('small-pages', lambda: page_stage('small')),
                ('large-pages', lambda: page_stage('large')),
                ('observed-details', detail_stage),
            ))
            if coded_count:
                stages.append(('level4-details', overlay_detail_stage))
            for stage, probe in stages:
                complete, next_number, total = probe()
                if complete:
                    continue
                if defer_for_capacity(root, stage, level4_count):
                    return 0
                command = command_for(stage, next_number)
                save_status(root, private_status(
                    'running', stage=stage,
                    reason=f'one bounded batch; selected={total}',
                    level4_count=level4_count))
                log_path = runs / f'observed-stage.{stage}.{next_number:04d}.log'
                with log_path.open('x', encoding='utf-8') as log:
                    # Old auto controllers already time their collector child;
                    # an outer timeout could orphan it during a capacity wait.
                    # The level-four command is itself one bounded collector.
                    child = runner(command, cwd=PROJECT, check=False,
                                   timeout=(3600 if stage.startswith('level4-')
                                            else None), stdout=log,
                                   stderr=subprocess.STDOUT)
                accepted = ((0, 1) if stage.startswith('level4-') else (0, 4))
                if child.returncode in accepted:
                    save_status(root, private_status(
                        'waiting', stage=stage,
                        reason='batch finished; reauditing next invocation',
                        child_exit=child.returncode,
                        level4_count=level4_count))
                    return 0
                save_status(root, private_status(
                    'blocked', stage=stage,
                    reason='child failed or stopped; manual audit required',
                    child_exit=child.returncode,
                    level4_count=level4_count))
                return 2
            active_stage = 'private-normalization'
            source = normalization_source(root)
            output = root / NORMALIZER['OUTPUT_NAME']
            if output.exists():
                digest = normalized_output_digest(root, source)
                if normalization_source(root) != source:
                    raise RuntimeError('private normalization source changed during verification')
                save_status(root, private_status(
                    'finished', stage=active_stage,
                    reason='verified private observed evidence; national coverage not verified',
                    level4_count=level4_count,
                    normalization={**source, 'outputSha256': digest}))
                return 0
            save_status(root, private_status(
                'running', stage=active_stage,
                reason='derive private evidence from verified saved source',
                level4_count=level4_count, normalization=source))
            command = command_for(active_stage, 1)
            log_path = runs / 'observed-stage.private-normalization.log'
            with log_path.open('x', encoding='utf-8') as log:
                child = runner(command, cwd=PROJECT, check=False,
                               timeout=3600, stdout=log,
                               stderr=subprocess.STDOUT)
            if child.returncode == 0:
                save_status(root, private_status(
                    'waiting', stage=active_stage,
                    reason='private normalization exited cleanly; verify artifact next invocation',
                    child_exit=0, level4_count=level4_count,
                    normalization=source))
                return 0
            save_status(root, private_status(
                'blocked', stage=active_stage,
                reason='private normalization failed; manual audit required',
                child_exit=child.returncode, level4_count=level4_count,
                normalization=source))
            return 2
    except FETCHER['FetchError'] as error:
        if 'another MCA collector is already running' in str(error):
            # A second scheduler must not overwrite the active one's running
            # status: that would mask an interrupted child on the next tick.
            return 0
        save_status(root, private_status('blocked', reason=str(error),
                                         level4_count=level4_count))
        return 2
    except (RuntimeError, OSError, ValueError, TypeError, KeyError,
            subprocess.SubprocessError) as error:
        if (isinstance(error, RuntimeError)
                and str(error) == 'another tree controller is running'):
            save_status(root, private_status('waiting',
                                             reason='another MCA stage is active',
                                             level4_count=level4_count))
            return 0
        save_status(root, private_status(
            'blocked', stage=active_stage,
            reason=f'{type(error).__name__}: {error}',
            level4_count=level4_count))
        return 2


if __name__ == '__main__':
    raise SystemExit(main())
