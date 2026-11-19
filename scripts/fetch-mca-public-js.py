"""Capture one previously identified MCA public JavaScript asset after cooldown.

Run only after the recorded site-wide cooldown:
    python scripts/fetch-mca-public-js.py

The exact HTTP body and provenance remain in data/private/, never public/.
This tool does not query institution lists, details, or any other asset.
"""

import argparse
import hashlib
import json
import math
import os
import runpy
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import HTTPRedirectHandler, Request, build_opener


PROJECT = Path(__file__).resolve().parents[1]
CORE = runpy.run_path(str(PROJECT / 'scripts' / 'fetch-mca-institutions.py'),
                      run_name='mca_fetch_core')
SITE_ROOT = CORE['ROOT']
CAPTURE_DIR = SITE_ROOT / 'static-js'
ASSET_URL = 'https://yanglao.mca.gov.cn/js/chunk-3d5896b7.22ca4f71.js'
ASSET_NAME = 'chunk-3d5896b7.22ca4f71.js'
COOLDOWN_END_UTC = datetime(2026, 11, 18, 19, 45, 17, tzinfo=timezone.utc)
MAX_ASSET_BYTES = 10_000_000
RateLimiter = CORE['RateLimiter']
FetchError = CORE['FetchError']


class NoRedirect(HTTPRedirectHandler):
    """A redirect must not turn the fixed official URL into another request."""

    def redirect_request(self, request, fp, code, msg, headers, newurl):
        return None


def check_start_time(now):
    if now.tzinfo is None or now.astimezone(timezone.utc) < COOLDOWN_END_UTC:
        raise FetchError('recorded HTTP 429 cooldown active; no site request sent')


def saved_capture(raw_path, metadata_path):
    if not raw_path.exists() and not metadata_path.exists():
        return None
    if not raw_path.is_file() or not metadata_path.is_file():
        raise FetchError('partial static JS capture; no site request sent')
    try:
        raw = raw_path.read_bytes()
        metadata = CORE['load_json'](metadata_path)
    except (OSError, ValueError) as error:
        raise FetchError('invalid static JS capture; no site request sent') from error
    if (not isinstance(metadata, dict) or metadata.get('sourceUrl') != ASSET_URL
            or metadata.get('method') != 'GET' or metadata.get('httpStatus') != 200
            or metadata.get('responseBytes') != len(raw)
            or metadata.get('responseSha256') != hashlib.sha256(raw).hexdigest()):
        raise FetchError('static JS capture mismatch; no site request sent')
    return metadata


def save_raw_bytes(path, raw):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + '.tmp')
    with temporary.open('wb') as stream:
        stream.write(raw)
    os.chmod(temporary, 0o600)
    os.replace(temporary, path)


def capture_asset(output_dir, limiter, timeout, *, opener=None):
    """One paced GET, with no retry and no network on a valid saved capture."""
    raw_path = output_dir / ASSET_NAME
    metadata_path = output_dir / (ASSET_NAME + '.json')
    cached = saved_capture(raw_path, metadata_path)
    if cached is not None:
        return cached

    limiter.wait()
    request = Request(ASSET_URL, method='GET', headers={
        'Accept': 'application/javascript, text/javascript, */*;q=0.1',
        'User-Agent': 'Mozilla/5.0 (compatible; eldercare-source-audit/1.0)',
    })
    opener = opener or build_opener(NoRedirect()).open
    requested_at = CORE['now_utc']()
    started = time.monotonic()
    try:
        with opener(request, timeout=timeout) as response:
            status = response.status
            response_date = response.headers.get('Date')
            content_type = response.headers.get('Content-Type')
            final_url = response.geturl()
            if status != 200 or final_url != ASSET_URL:
                raise FetchError('static JS response status or URL differs; stopped')
            raw = response.read(MAX_ASSET_BYTES + 1)
    except HTTPError as error:
        if error.code == 429:
            retry_after = error.headers.get('Retry-After') if error.headers else None
            limiter.trip('HTTP 429 during static JS capture', retry_after)
        raise FetchError(f'static JS: HTTP {error.code}; stopped') from error
    except (URLError, TimeoutError) as error:
        raise FetchError(f'static JS: {type(error).__name__}; stopped') from error

    fetched_at = CORE['now_utc']()
    response_time_ms = round((time.monotonic() - started) * 1000, 3)
    if not raw or len(raw) > MAX_ASSET_BYTES:
        raise FetchError('static JS empty or oversized; no capture saved')
    if (content_type and 'html' in content_type.lower()) or raw.lstrip().lower().startswith(
            (b'<!doctype html', b'<html')):
        raise FetchError('static JS response is HTML; no capture saved')

    metadata = {
        'schemaVersion': 1, 'sourceUrl': ASSET_URL, 'method': 'GET',
        'requestedAtUtc': requested_at, 'fetchedAtUtc': fetched_at,
        'responseTimeMs': response_time_ms, 'httpStatus': status,
        'responseDate': response_date, 'contentType': content_type,
        'responseBytes': len(raw), 'responseSha256': hashlib.sha256(raw).hexdigest(),
    }
    save_raw_bytes(raw_path, raw)
    CORE['save_json'](metadata_path, metadata)
    return metadata


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--timeout', type=float, default=30)
    args = parser.parse_args()
    if not math.isfinite(args.timeout) or args.timeout <= 0:
        parser.error('--timeout must be a positive finite number')
    check_start_time(datetime.now(timezone.utc))
    with CORE['exclusive_run_lock'](SITE_ROOT):
        CORE['enforce_site_cooldown'](SITE_ROOT)
        limiter = RateLimiter(60, 5, 1,
                              hourly_state_path=SITE_ROOT / 'hourly-request-budget.json')
        try:
            metadata = capture_asset(CAPTURE_DIR, limiter, args.timeout)
            print(json.dumps(metadata, ensure_ascii=False))
        finally:
            if limiter.blocked.is_set():
                CORE['save_json'](SITE_ROOT / 'rate-limit.json', {
                    'reason': limiter.block_reason,
                    'detectedAtUtc': CORE['now_utc'](),
                    'cooldownUntilUtc': limiter.cooldown_until_utc,
                })


if __name__ == '__main__':
    main()
