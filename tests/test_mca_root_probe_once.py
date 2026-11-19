"""Offline checks for the one-shot MCA root probe scheduler target."""

import runpy
import json
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch


SCRIPT = Path(__file__).resolve().parents[1] / 'scripts' / 'run-mca-root-probe-once.py'


class RootProbeOnceTests(unittest.TestCase):
    def setUp(self):
        self.module = runpy.run_path(str(SCRIPT))

    def test_command_is_one_bounded_serial_first_page_pass(self):
        command = self.module['build_command'](Path(sys.executable))
        self.assertEqual(command[0], sys.executable)
        self.assertEqual(Path(command[1]).name, 'collect-mca-shards.py')
        self.assertEqual(command[command.index('--max-pages-per-area') + 1], '1')
        self.assertEqual(command[command.index('--max-areas') + 1], '32')
        self.assertEqual(command[command.index('--max-requests') + 1], '48')
        self.assertEqual(command[command.index('--interval') + 1], '60')
        self.assertEqual(command[command.index('--attempts') + 1], '2')

    def test_refuses_to_run_before_recorded_429_cooldown_ends(self):
        just_before = datetime(2026, 11, 18, 19, 45, 16, tzinfo=timezone.utc)
        with self.assertRaisesRegex(RuntimeError, 'cooldown'):
            self.module['check_start_time'](just_before)
        self.module['check_start_time'](datetime(2026, 11, 18, 20, 0, tzinfo=timezone.utc))

    def test_offline_audit_command_targets_private_cross_shard_report(self):
        command = self.module['build_audit_command'](Path(sys.executable))
        self.assertEqual(command[0], sys.executable)
        self.assertEqual(Path(command[1]).name, 'audit-mca-shards.py')
        self.assertEqual(command[command.index('--output') + 1],
                         str(self.module['PRIVATE_ROOT'] / 'cross-shard-audit.json'))

    def test_failed_batch_still_runs_offline_audit_and_records_both_codes(self):
        globals_ = self.module['main'].__globals__
        old_root, old_check = globals_['PRIVATE_ROOT'], globals_['check_start_time']
        calls = []
        def fake_run(command, **_):
            calls.append(Path(command[1]).name)
            return SimpleNamespace(returncode=1 if len(calls) == 1 else 0)
        with tempfile.TemporaryDirectory() as temporary:
            globals_['PRIVATE_ROOT'] = Path(temporary)
            globals_['check_start_time'] = lambda *_: None
            try:
                with patch('subprocess.run', side_effect=fake_run):
                    self.assertEqual(self.module['main'](), 1)
                self.assertEqual(calls, ['collect-mca-shards.py', 'audit-mca-shards.py'])
                status = json.loads((Path(temporary) / 'batch-runs' /
                                     'roots-20261119-a.status.json').read_text(encoding='utf-8'))
                self.assertEqual((status['batchExitCode'], status['auditExitCode']), (1, 0))
            finally:
                globals_['PRIVATE_ROOT'], globals_['check_start_time'] = old_root, old_check


if __name__ == '__main__':
    unittest.main()
