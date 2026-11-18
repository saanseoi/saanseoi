import importlib.util
from contextlib import closing
import os
from pathlib import Path
import sqlite3
import tempfile
import time
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('retention', Path(__file__).with_name('local-artefact-retention.py'))
retention = importlib.util.module_from_spec(spec)
spec.loader.exec_module(retention)


class RetentionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.backups = self.root / '.local/d1/migration-backups'
        self.backups.mkdir(parents=True)
        self.cache = self.root / '.local/harbour-sql/normalised-cache'
        self.cache.mkdir(parents=True)

    def backup(self, day, prefix='a', age=20):
        path = self.backups / f'{prefix * 64}-202610{day:02d}T000000000000Z.sqlite'
        with closing(sqlite3.connect(path)) as db:
            db.execute('CREATE TABLE records(id INTEGER PRIMARY KEY, value TEXT)')
            db.execute("INSERT INTO records VALUES (1, 'recoverable')")
            db.commit()
        os.utime(path, (time.time() - age * retention.DAY,) * 2)
        return path

    def test_retains_two_per_database_and_pins_and_grace(self):
        old = self.backup(1)
        pin = self.backup(2)
        Path(str(pin) + '.keep').touch()
        fresh = self.backup(3, age=1)
        newest = [self.backup(4), self.backup(5)]
        other = self.backup(1, prefix='b')
        plan = retention.plan(self.root)
        self.assertEqual([e['path'] for e in plan['remove']], [str(old.relative_to(self.root))])
        self.assertEqual(len(plan['verify']), 2)
        for path in [pin, fresh, *newest, other]:
            self.assertIn(str(path.relative_to(self.root)), plan['protected'])

    def test_corrupt_retained_backup_blocks_all_deletion(self):
        old = self.backup(1)
        self.backup(2)
        self.backup(3).write_bytes(b'not a database')
        with self.assertRaises(sqlite3.DatabaseError):
            retention.apply_plan(self.root, retention.plan(self.root), lambda _: [])
        self.assertTrue(old.exists())

    def test_activity_blocks_all_deletion(self):
        old = self.backup(1)
        self.backup(2)
        self.backup(3)
        with self.assertRaisesRegex(RuntimeError, 'Active'):
            retention.apply_plan(self.root, retention.plan(self.root), lambda _: [{'pid': 42}])
        self.assertTrue(old.exists())

    def test_changed_file_or_new_pin_invalidates_plan(self):
        old = self.backup(1)
        self.backup(2)
        self.backup(3)
        plan = retention.plan(self.root)
        Path(str(old) + '.keep').touch()
        with self.assertRaisesRegex(ValueError, 'plan changed'):
            retention.apply_plan(self.root, plan, lambda _: [])
        self.assertTrue(old.exists())

    def test_symlink_parent_and_nonempty_wal_are_protected(self):
        old = self.backup(1)
        self.backup(2)
        self.backup(3)
        Path(str(old) + '-wal').write_bytes(b'committed pages')
        with self.assertRaisesRegex(ValueError, 'WAL'):
            retention.plan(self.root)
        Path(str(old) + '-wal').unlink()
        old.unlink()
        old.symlink_to(self.backups / 'outside.sqlite')
        with self.assertRaisesRegex(ValueError, 'Symlink'):
            retention.plan(self.root)

    def test_unknown_files_never_selected(self):
        for name in ['latest.sqlite', 'notes.json', 'unrecognised.bin']:
            (self.backups / name).write_bytes(b'keep')
            (self.cache / name).write_bytes(b'keep')
        self.assertEqual(retention.plan(self.root)['remove'], [])

    def test_cache_age_budget_and_grace(self):
        paths = []
        for i, age in enumerate([40, 5, 3, 0]):
            path = self.cache / f'{i:064x}.bin'
            path.write_bytes(b'x' * 10)
            os.utime(path, (time.time() - age * retention.DAY,) * 2)
            paths.append(path)
        with patch.dict(retention.POLICY, normalisedCacheMaxBytes=20):
            plan = retention.plan(self.root, 'cache')
        self.assertEqual([e['path'] for e in plan['remove']], [str(p.relative_to(self.root)) for p in paths[:2]])

    def test_apply_respects_the_automatic_cache_writer_lock(self):
        with closing(sqlite3.connect(self.cache / 'lock.sqlite')) as db:
            db.execute('BEGIN IMMEDIATE')
            with patch.object(retention, 'ROOT', self.root), patch('sys.argv', [
                'retention', '--apply', '--scope', 'cache',
            ]):
                with self.assertRaises(sqlite3.OperationalError):
                    retention.main()

    def test_apply_preserves_verified_recovery_and_writes_receipt(self):
        old = self.backup(1)
        survivors = [self.backup(2), self.backup(3)]
        wal = Path(str(old) + '-wal')
        wal.touch()
        receipt = retention.apply_plan(self.root, retention.plan(self.root), lambda _: [])
        self.assertTrue(receipt.is_file())
        self.assertFalse(old.exists())
        self.assertFalse(wal.exists())
        self.assertTrue(all(p.exists() for p in survivors))
        self.assertEqual(retention.plan(self.root)['remove'], [])


if __name__ == '__main__':
    unittest.main()
