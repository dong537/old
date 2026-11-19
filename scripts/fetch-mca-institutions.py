"""Freeze public MCA institution API responses privately, with resumable audits.

List usage: python scripts/fetch-mca-institutions.py list --area-code 440000000000 --max-pages 3
Detail usage: python scripts/fetch-mca-institutions.py details --area-code 440000000000 --max-details 2
The responses can contain contact details and must never be copied to public/."""

import argparse
import base64
import hashlib
import json
import math
import os
import random
import re
import threading
import time
import uuid
from concurrent.futures import FIRST_COMPLETED, ThreadPoolExecutor, wait
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

API_BASE = 'https://yanglao.mca.gov.cn/ylxxptapi/ylfwpt/ylfw/'
CLOCK_URL = 'https://yanglao.mca.gov.cn/'
PUBLIC_KEY = 'fc7bf098ad854022aa9a4b95261a03b6'  # Published in the site's JavaScript.
ROOT = Path(__file__).resolve().parents[1] / 'data' / 'private' / 'mca-institutions-2026-11-18'
LIST_PATH = 'queryOrganizationDataList'
DETAIL_PATHS = ('orgBaseDetail', 'yangLaoOrgDetail')
HOURLY_REQUEST_LIMIT = 60
HOURLY_WINDOW_SECONDS = 3600


def now_utc():
    return datetime.now(timezone.utc).isoformat()


class FetchError(RuntimeError):
    pass


class BudgetExhausted(FetchError):
    """The configured ceiling prevents any further site request in this run."""


@contextmanager
def exclusive_run_lock(root):
    """Keep independent area jobs from exceeding the shared site's request budget."""
    root.mkdir(parents=True, exist_ok=True)
    stream = (root / 'collector.lock').open('a+b')
    try:
        if os.name == 'nt':
            import msvcrt
            if stream.seek(0, os.SEEK_END) == 0:
                stream.write(b'0')
                stream.flush()
            stream.seek(0)
            msvcrt.locking(stream.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(stream.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError as error:
        stream.close()
        raise FetchError('another MCA collector is already running') from error
    try:
        yield
    finally:
        if os.name == 'nt':
            stream.seek(0)
            msvcrt.locking(stream.fileno(), msvcrt.LK_UNLCK, 1)
        else:
            fcntl.flock(stream.fileno(), fcntl.LOCK_UN)
        stream.close()


class RateLimiter:
    def __init__(self, interval, jitter=0, max_requests=None, hourly_state_path=None):
        self.interval = interval
        self.jitter = jitter
        self.max_requests = max_requests
        self.hourly_state_path = Path(hourly_state_path) if hourly_state_path is not None else None
        self.hourly_resume_at_utc = None
        self.requests_started = 0
        self.requests_reserved = 0
        self.exhausted = threading.Event()
        # The first request also waits, including after another process releases the site lock.
        self.next_at = time.monotonic() + interval + random.uniform(0, jitter)
        self.lock = threading.Lock()
        self.blocked = threading.Event()
        self.block_reason = None
        self.cooldown_until_utc = None

    def _record_hourly_request(self):
        if self.hourly_state_path is None:
            return
        now = datetime.now(timezone.utc)
        starts = []
        if self.hourly_state_path.exists():
            try:
                state = load_json(self.hourly_state_path)
                if (not isinstance(state, dict) or state.get('schemaVersion') != 1
                        or state.get('windowSeconds') != HOURLY_WINDOW_SECONDS
                        or state.get('limit') != HOURLY_REQUEST_LIMIT
                        or not isinstance(state.get('requestStartedAtUtc'), list)):
                    raise ValueError('invalid hourly budget schema')
                for value in state['requestStartedAtUtc']:
                    if not isinstance(value, str):
                        raise ValueError('invalid hourly request timestamp')
                    started = datetime.fromisoformat(value)
                    if started.tzinfo is None or started > now:
                        raise ValueError('invalid hourly request timestamp')
                    starts.append(started.astimezone(timezone.utc))
            except (OSError, ValueError, TypeError) as error:
                raise FetchError('invalid persisted hourly request budget; no request sent') from error
        cutoff = now - timedelta(seconds=HOURLY_WINDOW_SECONDS)
        recent = sorted(started for started in starts if started > cutoff)
        if len(recent) >= HOURLY_REQUEST_LIMIT:
            self.hourly_resume_at_utc = (recent[0] + timedelta(seconds=HOURLY_WINDOW_SECONDS)).isoformat()
            self.exhausted.set()
            raise BudgetExhausted(f'hourly request budget exhausted; resume after {self.hourly_resume_at_utc}')
        try:
            save_json(self.hourly_state_path, {
                'schemaVersion': 1, 'windowSeconds': HOURLY_WINDOW_SECONDS,
                'limit': HOURLY_REQUEST_LIMIT,
                'requestStartedAtUtc': [started.isoformat() for started in (*recent, now)],
            })
        except OSError as error:
            raise FetchError('unable to persist hourly request budget; no request sent') from error
        if len(recent) + 1 == HOURLY_REQUEST_LIMIT:
            self.hourly_resume_at_utc = (recent[0] + timedelta(seconds=HOURLY_WINDOW_SECONDS)).isoformat()
            self.exhausted.set()

    def trip(self, reason, retry_after=None):
        seconds = 3600
        if retry_after:
            value = str(retry_after).strip()
            if value.isdigit():
                seconds = max(seconds, int(value))
            else:
                try:
                    retry_at = parsedate_to_datetime(value)
                    if retry_at.tzinfo is not None:
                        seconds = max(seconds, math.ceil((retry_at - datetime.now(timezone.utc)).total_seconds()))
                except (TypeError, ValueError):
                    pass
        with self.lock:
            self.block_reason = reason
            self.cooldown_until_utc = (datetime.now(timezone.utc) + timedelta(seconds=seconds)).isoformat()
            self.blocked.set()

    def wait(self):
        if self.blocked.is_set():
            raise FetchError('rate-limit circuit open; no further requests sent')
        with self.lock:
            if self.exhausted.is_set() and self.hourly_resume_at_utc:
                raise BudgetExhausted(f'hourly request budget exhausted; resume after {self.hourly_resume_at_utc}')
            if (self.max_requests is not None
                    and self.requests_started + self.requests_reserved >= self.max_requests):
                self.exhausted.set()
                raise BudgetExhausted('request budget exhausted; no further requests sent')
            self.requests_reserved += 1
            current = time.monotonic()
            sleep_for = max(0.0, self.next_at - current)
            self.next_at = max(current, self.next_at) + self.interval + random.uniform(0, self.jitter)
        try:
            if sleep_for:
                time.sleep(sleep_for)
            with self.lock:
                if self.blocked.is_set():
                    raise FetchError('rate-limit circuit open; no further requests sent')
                self._record_hourly_request()
                self.requests_started += 1
        finally:
            with self.lock:
                self.requests_reserved -= 1


class ServerClock:
    """Calibrate request timestamps against the site's HTTP Date, not the host clock."""

    def __init__(self, ttl_seconds=300):
        self.ttl_seconds = ttl_seconds
        self.offset_ms = None
        self.head_offset_ms = None
        self.synced_at_monotonic = None
        self.lock = threading.Lock()

    def timestamp_ms(self, limiter=None, refresh=True):
        with self.lock:
            # A serial request may wait one full pacing interval before it is
            # sent. Refresh now if that wait could expire the calibration;
            # otherwise the already-accounted request slot would be unused.
            pacing_horizon = 0
            if refresh and limiter is not None:
                pacing_horizon = (max(0, getattr(limiter, 'interval', 0))
                                  + max(0, getattr(limiter, 'jitter', 0)) + 5)
            stale = (self.synced_at_monotonic is None or
                     time.monotonic() - self.synced_at_monotonic
                     + pacing_horizon >= self.ttl_seconds)
            if stale:
                if not refresh:
                    raise FetchError('server clock expired during request wait; no POST sent')
                self._refresh(limiter)
            return str(int(time.time() * 1000 + self.offset_ms))

    def force_refresh(self, limiter=None):
        """Recalibrate after an explicit timestamp-expired response."""
        with self.lock:
            self._refresh(limiter)

    def observe_response_date(self, date_header, started_at, received_at):
        """Renew a HEAD-calibrated clock from a consistent successful API response."""
        if (not isinstance(date_header, str) or not date_header
                or not isinstance(started_at, (int, float))
                or not isinstance(received_at, (int, float))
                or not math.isfinite(started_at) or not math.isfinite(received_at)
                or not 0 <= received_at - started_at <= 5):
            return False
        try:
            server_date = parsedate_to_datetime(date_header)
            if server_date.tzinfo is None:
                return False
            observed_ms = int((server_date.timestamp() + 0.5
                               - (started_at + received_at) / 2) * 1000)
        except (TypeError, ValueError, OverflowError, IndexError):
            return False
        if abs(observed_ms) > 60_000:
            return False
        with self.lock:
            # Keep the independent HEAD offset as an anchor so a cached or
            # intermediary Date cannot shift the signing clock cumulatively.
            if (self.head_offset_ms is None or self.offset_ms is None
                    or abs(observed_ms - self.head_offset_ms) > 3_000):
                return False
            self.offset_ms = observed_ms
            self.synced_at_monotonic = time.monotonic()
            return True

    def _refresh(self, limiter=None):
        request = Request(CLOCK_URL, method='HEAD', headers={
            'Cache-Control': 'no-cache',
            'User-Agent': 'Mozilla/5.0 (compatible; eldercare-source-audit/1.0)',
        })
        if limiter is not None:
            limiter.wait()
        before = time.time()
        try:
            with urlopen(request, timeout=10) as response:
                date_header = response.headers.get('Date')
                status = response.status
        except HTTPError as error:
            if error.code == 429 and limiter is not None:
                retry_after = error.headers.get('Retry-After') if error.headers else None
                limiter.trip('HTTP 429 during clock calibration', retry_after)
            raise FetchError(f'server clock calibration failed: HTTP {error.code}') from error
        except (URLError, TimeoutError) as error:
            raise FetchError(f'server clock calibration failed: {type(error).__name__}') from error
        after = time.time()
        if status != 200 or not date_header or after - before > 5:
            raise FetchError('server clock calibration failed: invalid or slow HTTP Date response')
        try:
            server_date = parsedate_to_datetime(date_header)
            if server_date.tzinfo is None:
                raise ValueError('HTTP Date has no timezone')
        except (TypeError, ValueError) as error:
            raise FetchError('server clock calibration failed: invalid HTTP Date') from error
        # HTTP Date has one-second precision; use its second midpoint and local RTT midpoint.
        offset_ms = int((server_date.timestamp() + 0.5 - (before + after) / 2) * 1000)
        if abs(offset_ms) > 60_000:
            raise FetchError('server clock calibration failed: host time differs by over 60 seconds')
        self.offset_ms = offset_ms
        self.head_offset_ms = offset_ms
        self.synced_at_monotonic = time.monotonic()


SERVER_CLOCK = ServerClock()


def signed_headers(timestamp=None):
    if timestamp is None:
        timestamp = SERVER_CLOCK.timestamp_ms()
    nonce = str(uuid.uuid4())
    signature = hashlib.md5((PUBLIC_KEY + 'ylfwxxpt' + timestamp + nonce).encode()).hexdigest()
    return {
        'X-Auth-Key': PUBLIC_KEY, 'X-Auth-Timestamp': timestamp,
        'X-Auth-Nonce': nonce, 'X-Auth-Signature': signature,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
        'Origin': 'https://yanglao.mca.gov.cn',
        'Referer': 'https://yanglao.mca.gov.cn/?#/index/institutionList',
        'User-Agent': 'Mozilla/5.0 (compatible; eldercare-source-audit/1.0)',
    }


def request_json(endpoint, params, limiter, timeout, attempts, *, preserve_raw=False):
    url = API_BASE + endpoint
    clock_retry_used = False
    for attempt in range(1, attempts + 1):
        SERVER_CLOCK.timestamp_ms(limiter)
        limiter.wait()
        # Sign after the POST's pacing delay; signing before it can expire.
        try:
            timestamp = SERVER_CLOCK.timestamp_ms(None, False)
        except FetchError as error:
            if str(error) != 'server clock expired during request wait; no POST sent':
                raise
            # A long pacing wait can consume the clock TTL. Recalibrate once,
            # then reserve a fresh POST slot; both requests count toward budget.
            SERVER_CLOCK.timestamp_ms(limiter)
            limiter.wait()
            timestamp = SERVER_CLOCK.timestamp_ms(None, False)
        requested_at = now_utc()
        headers = signed_headers(timestamp)
        request = Request(url, data=urlencode(params).encode(), headers=headers, method='POST')
        try:
            request_started_at = time.time()
            with urlopen(request, timeout=timeout) as response:
                raw = response.read()
                status = response.status
                response_date = response.headers.get('Date') if hasattr(response, 'headers') else None
            response_received_at = time.time()
            payload = json.loads(raw)
            if not isinstance(payload, dict) or payload.get('code') != 0:
                code = payload.get('code') if isinstance(payload, dict) else 'invalid'
                message = payload.get('msg') if isinstance(payload, dict) else None
                if not isinstance(message, str):
                    message = ''
                diagnostic = {
                    'schemaVersion': 1, 'requestedAtUtc': requested_at,
                    'endpoint': endpoint, 'params': params, 'httpStatus': status,
                    'signedTimestampMs': headers['X-Auth-Timestamp'], 'responseDate': response_date,
                    'responseSha256': hashlib.sha256(raw).hexdigest(),
                    'businessCode': code if isinstance(code, (str, int)) else type(code).__name__,
                    'message': ''.join(char if char.isprintable() else ' ' for char in message)[:160],
                }
                stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
                save_json(ROOT / 'errors' / f'{stamp}-{uuid.uuid4().hex[:8]}.json', diagnostic)
                if code == 1 and message.strip() == '请求已过期' and not clock_retry_used and attempt < attempts:
                    clock_retry_used = True
                    SERVER_CLOCK.force_refresh(limiter)
                    continue
                raise FetchError(f'{endpoint}: business code {payload.get("code") if isinstance(payload, dict) else "invalid"}')
            observe = getattr(SERVER_CLOCK, 'observe_response_date', None)
            if status == 200 and observe is not None:
                observe(response_date, request_started_at, response_received_at)
            wrapper = {
                'schemaVersion': 1, 'fetchedAtUtc': now_utc(),
                'request': {'url': url, 'method': 'POST', 'params': params},
                'httpStatus': status, 'responseSha256': hashlib.sha256(raw).hexdigest(),
                'response': payload,
            }
            if preserve_raw:
                wrapper['requestedAtUtc'] = requested_at
                wrapper['responseDate'] = response_date
                wrapper['signedTimestampMs'] = timestamp
                wrapper['rawBodyBase64'] = base64.b64encode(raw).decode('ascii')
            return wrapper
        except HTTPError as error:
            if error.code == 429:
                retry_after = error.headers.get('Retry-After') if error.headers else None
                limiter.trip('HTTP 429; Retry-After=' + str(retry_after), retry_after)
                raise FetchError(f'{endpoint}: HTTP 429; rate-limit circuit opened') from error
            retryable = 500 <= error.code <= 599
            reason = f'{endpoint}: HTTP {error.code}'
        except (URLError, TimeoutError, json.JSONDecodeError) as error:
            retryable = True
            reason = f'{endpoint}: {type(error).__name__}: {error}'
        if not retryable or attempt == attempts:
            raise FetchError(reason)
        time.sleep(min(30.0, 2 ** (attempt - 1)))
    raise AssertionError('unreachable')


def save_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + '.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    os.chmod(temporary, 0o600)
    os.replace(temporary, path)


def load_json(path):
    return json.loads(path.read_text(encoding='utf-8'))


def enforce_site_cooldown(root):
    """A 429 is site-wide; changing area code must not evade its cooldown."""
    paths = [root / 'rate-limit.json', *root.glob('area-*/rate-limit.json')]
    now = datetime.now(timezone.utc)
    for path in paths:
        if not path.exists():
            continue
        until = datetime.fromisoformat(load_json(path)['cooldownUntilUtc'])
        if until.tzinfo is None:
            raise FetchError(f'invalid rate-limit timestamp in {path}')
        if now < until:
            raise FetchError(f'rate-limit cooldown active until {until.isoformat()}')


def page_params(page, area_code, check_sort=False):
    params = {'current': page, 'size': 10}
    if area_code:
        params['areaCode'] = area_code
    if check_sort:
        params['checkSort'] = 1
    return params


def checked_page(wrapper, page, area_code, check_sort=False):
    if wrapper.get('request', {}).get('params') != page_params(page, area_code, check_sort):
        raise FetchError(f'page {page}: saved query differs from this run')
    response = wrapper.get('response')
    if not isinstance(response, dict) or response.get('code') != 0:
        raise FetchError(f'page {page}: invalid business code')
    data = response.get('data')
    if wrapper.get('httpStatus') != 200 or not isinstance(data, dict):
        raise FetchError(f'page {page}: invalid saved response')
    records = data.get('records')
    if not isinstance(records, list) or int(data.get('current', -1)) != page:
        raise FetchError(f'page {page}: missing records or wrong page number')
    if not isinstance(data.get('total'), int) or not isinstance(data.get('size'), int):
        raise FetchError(f'page {page}: missing total or server page size')
    if len(records) > data['size'] or data['size'] < 1:
        raise FetchError(f'page {page}: invalid page length')
    for record in records:
        if not isinstance(record, dict) or not isinstance(record.get('axbe0001'), str) or not record['axbe0001']:
            raise FetchError(f'page {page}: missing institution ID')
    return data


def fetch_page(page, area_code, folder, limiter, timeout, attempts,
               check_sort=False, preserve_raw=False):
    wrapper = request_json(LIST_PATH, page_params(page, area_code, check_sort),
                           limiter, timeout, attempts, preserve_raw=preserve_raw)
    checked_page(wrapper, page, area_code, check_sort)
    save_json(folder / 'pages' / f'{page:05d}.json', wrapper)
    return page


def audit_pages(folder, area_code, total, page_size, expected_pages, failures, check_sort=False):
    seen = set()
    duplicate_ids = []
    total_drift_pages = []
    invalid_page_lengths = []
    saved_pages = []
    record_count = 0
    for page in range(1, expected_pages + 1):
        path = folder / 'pages' / f'{page:05d}.json'
        if not path.exists():
            continue
        data = checked_page(load_json(path), page, area_code, check_sort)
        saved_pages.append(page)
        if data['total'] != total or data['size'] != page_size:
            total_drift_pages.append(page)
        expected_length = min(page_size, max(0, total - (page - 1) * page_size))
        if len(data['records']) != expected_length:
            invalid_page_lengths.append(page)
        for record in data['records']:
            identifier = record['axbe0001']
            if identifier in seen:
                duplicate_ids.append(identifier)
            seen.add(identifier)
            record_count += 1
    missing_pages = [page for page in range(1, expected_pages + 1) if page not in set(saved_pages)]
    page_audit_reconciled = (
        not (missing_pages or failures or duplicate_ids or total_drift_pages or invalid_page_lengths)
        and record_count == total
    )
    # Offset pages have shown unstable ordering. Matching totals in one pass
    # do not establish an immutable, complete source snapshot.
    return {
        'savedPages': len(saved_pages), 'missingPages': missing_pages,
        'failedPages': failures, 'recordRows': record_count, 'uniqueIds': len(seen),
        'duplicateIds': duplicate_ids[:100], 'duplicateIdCount': len(duplicate_ids),
        'totalDriftPages': total_drift_pages, 'invalidPageLengths': invalid_page_lengths,
        'pageAuditReconciled': page_audit_reconciled,
        'complete': False, 'completionBlocker': 'no stable snapshot or unique ordering',
    }


def compare_saved_passes(first_folder, second_folder, area_code, check_sort=False):
    """Compare two private captures without making network requests or exposing row data."""
    if first_folder.resolve() == second_folder.resolve():
        raise FetchError('comparison requires two distinct capture folders')
    captures = []
    for folder in (first_folder, second_folder):
        manifest = load_json(folder / 'manifest.json')
        total = manifest.get('total')
        size = manifest.get('serverPageSize')
        expected = manifest.get('expectedPages')
        if (not isinstance(total, int) or total < 0 or not isinstance(size, int) or size < 1
                or not isinstance(expected, int) or expected != math.ceil(total / size)):
            raise FetchError(f'{folder}: invalid manifest pagination')
        audit = audit_pages(folder, area_code, total, size, expected, {}, check_sort)
        page_ids = {}
        for page in range(1, expected + 1):
            path = folder / 'pages' / f'{page:05d}.json'
            if path.exists():
                data = checked_page(load_json(path), page, area_code, check_sort)
                page_ids[page] = [row['axbe0001'] for row in data['records']]
        identifiers = {identifier for ids in page_ids.values() for identifier in ids}
        captures.append((manifest, audit, page_ids, identifiers))
    first, second = captures
    same_total = first[0]['total'] == second[0]['total']
    same_page_sets = (first[2].keys() == second[2].keys()
                      and all(set(first[2][page]) == set(second[2][page]) for page in first[2]))
    same_page_order = (first[2].keys() == second[2].keys()
                       and all(first[2][page] == second[2][page] for page in first[2]))
    reconciled = first[1]['pageAuditReconciled'] and second[1]['pageAuditReconciled']
    return {
        'first': {key: first[1][key] for key in ('savedPages', 'recordRows', 'uniqueIds', 'duplicateIdCount', 'pageAuditReconciled')},
        'second': {key: second[1][key] for key in ('savedPages', 'recordRows', 'uniqueIds', 'duplicateIdCount', 'pageAuditReconciled')},
        'sameTotal': same_total, 'allPageIdSetsEqual': same_page_sets,
        'allPageOrderEqual': same_page_order,
        'uniqueIdIntersection': len(first[3] & second[3]),
        'matchingCachedPageIds': reconciled and same_total and same_page_sets,
        'snapshotVerified': False,
    }


def collect_list(args, folder, limiter):
    first_path = folder / 'pages' / '00001.json'
    if first_path.exists():
        first = load_json(first_path)
    else:
        fetch_page(1, args.area_code, folder, limiter, args.timeout, args.attempts, args.check_sort)
        first = load_json(first_path)
    data = checked_page(first, 1, args.area_code, args.check_sort)
    total, page_size = data['total'], data['size']
    expected_pages = math.ceil(total / page_size)
    target_pages = min(expected_pages, args.max_pages or expected_pages)
    failures = {}
    pages = [page for page in range(2, target_pages + 1) if not (folder / 'pages' / f'{page:05d}.json').exists()]
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        remaining = iter(pages)
        pending = {}
        def submit_next():
            page = next(remaining, None)
            if page is not None:
                pending[pool.submit(fetch_page, page, args.area_code, folder, limiter, args.timeout, args.attempts, args.check_sort)] = page
        for _ in range(args.workers):
            submit_next()
        completed = 0
        while pending:
            done, _ = wait(pending, return_when=FIRST_COMPLETED)
            for future in done:
                page = pending.pop(future)
                if not future.cancelled():
                    try:
                        future.result()
                    except BudgetExhausted:
                        pass
                    except FetchError as error:
                        if 'rate-limit circuit open; no further requests' not in str(error):
                            failures[str(page)] = str(error)
                    except Exception as error:
                        failures[str(page)] = f'{type(error).__name__}: {error}'
                completed += 1
                if not limiter.blocked.is_set() and not limiter.exhausted.is_set():
                    submit_next()
                if completed % 25 == 0 or limiter.blocked.is_set():
                    print(json.dumps({'scope': folder.name, 'processedThisRun': completed, 'plannedThisRun': len(pages), 'failures': len(failures), 'rateLimited': limiter.blocked.is_set()}, ensure_ascii=False), flush=True)
            if limiter.blocked.is_set():
                for future in pending:
                    future.cancel()
    audit = audit_pages(folder, args.area_code, total, page_size, expected_pages, failures, args.check_sort)
    manifest = {
        'schemaVersion': 1, 'sourceUrl': API_BASE + LIST_PATH,
        'scope': folder.name, 'filters': {'areaCode': args.area_code or None, 'ahae0635': None,
                                           **({'checkSort': 1} if args.check_sort else {})},
        'firstFetchedAtUtc': first['fetchedAtUtc'], 'auditedAtUtc': now_utc(),
        'total': total, 'serverPageSize': page_size, 'expectedPages': expected_pages,
        'requestedThroughPage': target_pages, 'rateLimited': limiter.blocked.is_set(),
        'requestBudgetReached': limiter.exhausted.is_set(),
        'requestsThisRun': limiter.requests_started, 'requestBudget': limiter.max_requests,
        'hourlyBudgetResumeAtUtc': limiter.hourly_resume_at_utc,
        'rateLimitCooldownUntilUtc': limiter.cooldown_until_utc, **audit,
    }
    save_json(folder / 'manifest.json', manifest)
    print(json.dumps({key: manifest[key] for key in ('scope', 'total', 'serverPageSize', 'expectedPages', 'savedPages', 'recordRows', 'uniqueIds', 'duplicateIdCount', 'totalDriftPages', 'complete', 'requestBudgetReached', 'hourlyBudgetResumeAtUtc')}, ensure_ascii=False), flush=True)
    if (failures or limiter.blocked.is_set() or audit['invalidPageLengths']
            or audit['totalDriftPages'] or audit['duplicateIdCount']):
        raise FetchError(
            f'{len(failures)} pages failed; rate limit={limiter.blocked.is_set()}; '
            f'invalid page lengths={audit["invalidPageLengths"]}; '
            f'total drift={audit["totalDriftPages"]}; '
            f'duplicate IDs={audit["duplicateIdCount"]}; see manifest.json'
        )


def checked_detail_endpoint(name, identifier, wrapper):
    if not isinstance(wrapper, dict):
        raise FetchError(f'{name}: saved detail is not an object')
    request = wrapper.get('request')
    if not isinstance(request, dict) or request.get('params') != {'axbe0001': identifier}:
        raise FetchError(f'{name}: request ID mismatch')
    response = wrapper.get('response')
    if (wrapper.get('httpStatus') != 200 or not isinstance(response, dict)
            or type(response.get('code')) is not int or response['code'] != 0):
        raise FetchError(f'{name}: unsuccessful detail response')
    data = response.get('data')
    if not isinstance(data, dict):
        raise FetchError(f'{name}: detail data missing')
    if data.get('axbe0001') is not None and data['axbe0001'] != identifier:
        raise FetchError(f'{name}: response ID mismatch')


def collect_detail(identifier, folder, limiter, timeout, attempts, *, preserve_raw=False):
    if not re.fullmatch(r'[A-Za-z0-9_-]{7,64}', identifier):
        raise FetchError(f'invalid institution ID: {identifier!r}')
    response = {}
    for name in DETAIL_PATHS:
        checkpoint = folder / 'detail-checkpoints' / identifier / f'{name}.json'
        if checkpoint.exists():
            wrapper = load_json(checkpoint)
        else:
            if preserve_raw:
                wrapper = request_json(name, {'axbe0001': identifier}, limiter, timeout,
                                       attempts, preserve_raw=True)
            else:
                wrapper = request_json(name, {'axbe0001': identifier}, limiter, timeout,
                                       attempts)
        checked_detail_endpoint(name, identifier, wrapper)
        if preserve_raw:
            try:
                raw = base64.b64decode(wrapper['rawBodyBase64'], validate=True)
                raw_response = json.loads(raw)
            except (KeyError, TypeError, ValueError) as error:
                raise FetchError(f'{name}: raw detail response missing or invalid') from error
            if (raw_response != wrapper['response']
                    or hashlib.sha256(raw).hexdigest() != wrapper['responseSha256']):
                raise FetchError(f'{name}: raw detail response differs from checkpoint')
        if not checkpoint.exists():
            save_json(checkpoint, wrapper)
        response[name] = wrapper
    save_json(folder / 'details' / f'{identifier}.json', {
        'schemaVersion': 1, 'institutionId': identifier, 'fetchedAtUtc': now_utc(), 'endpoints': response,
    })
    return identifier


def collect_details(args, folder, limiter):
    manifest_path = folder / 'manifest.json'
    if not manifest_path.exists():
        raise FetchError('list manifest missing; run list first')
    manifest = load_json(manifest_path)
    identifiers = []
    seen = set()
    for page in range(1, manifest['expectedPages'] + 1):
        path = folder / 'pages' / f'{page:05d}.json'
        if not path.exists():
            continue
        data = checked_page(load_json(path), page, args.area_code, args.check_sort)
        for record in data['records']:
            identifier = record['axbe0001']
            if identifier not in seen:
                identifiers.append(identifier)
                seen.add(identifier)
    target_ids = identifiers[:args.max_details] if args.max_details else identifiers
    pending = [identifier for identifier in target_ids if not (folder / 'details' / f'{identifier}.json').exists()]
    failures = {}
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        remaining = iter(pending)
        active = {}
        def submit_next():
            identifier = next(remaining, None)
            if identifier is not None:
                active[pool.submit(collect_detail, identifier, folder, limiter, args.timeout, args.attempts)] = identifier
        for _ in range(args.workers):
            submit_next()
        while active:
            done, _ = wait(active, return_when=FIRST_COMPLETED)
            for future in done:
                identifier = active.pop(future)
                if not future.cancelled():
                    try:
                        future.result()
                    except BudgetExhausted:
                        pass
                    except FetchError as error:
                        if 'rate-limit circuit open; no further requests' not in str(error):
                            failures[identifier] = str(error)
                    except Exception as error:
                        failures[identifier] = f'{type(error).__name__}: {error}'
                if not limiter.blocked.is_set() and not limiter.exhausted.is_set():
                    submit_next()
            if limiter.blocked.is_set():
                for future in active:
                    future.cancel()
    manifest['detailAudit'] = {
        'auditedAtUtc': now_utc(), 'listUniqueIdsAvailable': len(identifiers),
        'requestedThroughIdCount': len(target_ids),
        'saved': sum((folder / 'details' / f'{identifier}.json').exists() for identifier in identifiers),
        'failedIds': failures, 'rateLimited': limiter.blocked.is_set(),
        'requestBudgetReached': limiter.exhausted.is_set(),
        'requestsThisRun': limiter.requests_started, 'requestBudget': limiter.max_requests,
        'hourlyBudgetResumeAtUtc': limiter.hourly_resume_at_utc,
        'rateLimitCooldownUntilUtc': limiter.cooldown_until_utc,
    }
    manifest['detailAudit']['complete'] = manifest['complete'] and manifest['detailAudit']['saved'] == len(identifiers) and not failures
    save_json(manifest_path, manifest)
    print(json.dumps({'scope': folder.name, **manifest['detailAudit']}, ensure_ascii=False), flush=True)
    if failures or limiter.blocked.is_set():
        raise FetchError(f'{len(failures)} detail requests failed; rate limit={limiter.blocked.is_set()}; see manifest.json')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode', choices=('list', 'details', 'compare'))
    parser.add_argument('--area-code', default='', help='12-digit province sbcode; omit only for national audit')
    parser.add_argument('--max-pages', type=int, default=3, help='default 3 for a bounded probe; 0 fetches all')
    parser.add_argument('--max-details', type=int, default=2, help='default 2 for a bounded probe; 0 fetches every saved ID')
    parser.add_argument('--check-sort', action='store_true', help='use checkSort=1 in an isolated private list cache')
    parser.add_argument('--capture-id', default='', help='distinct label for an independent collection round')
    parser.add_argument('--compare-folder', type=Path, help='second private capture folder for offline comparison')
    parser.add_argument('--interval', type=float, default=45.0, help='minimum 45 seconds between every site request, including clock HEAD')
    parser.add_argument('--jitter', type=float, default=5.0, help='extra random seconds between requests')
    parser.add_argument('--workers', type=int, default=1, help='one serial worker only')
    parser.add_argument('--max-requests', type=int, default=60, help='maximum 60 site requests in this run, including HEAD and retries')
    parser.add_argument('--timeout', type=float, default=30.0)
    parser.add_argument('--attempts', type=int, default=4)
    args = parser.parse_args()
    if args.area_code and not re.fullmatch(r'[0-9]{12}', args.area_code):
        parser.error('--area-code must be a 12-digit sbcode')
    if (not math.isfinite(args.interval) or args.interval < 45
            or not math.isfinite(args.jitter) or args.jitter < 0
            or args.workers != 1 or args.attempts < 1 or args.max_pages < 0
            or args.max_details < 0 or not 1 <= args.max_requests <= HOURLY_REQUEST_LIMIT):
        parser.error('interval >= 45, jitter >= 0, workers = 1, attempts >= 1, request budget 1..60 required')
    if args.capture_id and not re.fullmatch(r'[a-zA-Z0-9-]{1,40}', args.capture_id):
        parser.error('--capture-id must contain 1-40 ASCII letters, digits or hyphens')
    scope = 'area-' + args.area_code if args.area_code else 'area-national'
    if args.check_sort:
        scope += '-check-sort-1'
    if args.capture_id:
        scope += '-capture-' + args.capture_id
    if args.mode == 'compare':
        if args.compare_folder is None:
            parser.error('compare requires --compare-folder')
        print(json.dumps(compare_saved_passes(ROOT / scope, args.compare_folder, args.area_code, args.check_sort), ensure_ascii=False))
        return
    if args.compare_folder is not None:
        parser.error('--compare-folder is only valid with compare')
    with exclusive_run_lock(ROOT):
        enforce_site_cooldown(ROOT)
        folder = ROOT / scope
        folder.mkdir(parents=True, exist_ok=True)
        cooldown_path = ROOT / 'rate-limit.json'
        limiter = RateLimiter(args.interval, args.jitter, args.max_requests,
                              hourly_state_path=ROOT / 'hourly-request-budget.json')
        try:
            if args.mode == 'list':
                collect_list(args, folder, limiter)
            else:
                collect_details(args, folder, limiter)
        finally:
            if limiter.blocked.is_set():
                save_json(cooldown_path, {
                    'reason': limiter.block_reason, 'detectedAtUtc': now_utc(),
                    'cooldownUntilUtc': limiter.cooldown_until_utc,
                })


if __name__ == '__main__':
    main()
