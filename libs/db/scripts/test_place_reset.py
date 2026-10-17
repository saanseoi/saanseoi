"""Exercise generated schema replay and reset against disposable SQLite files."""
import importlib.util
from pathlib import Path
import shutil
import sqlite3
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('migrate_local', ROOT / 'scripts/migrate-local-sqlite.py')
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


class PlaceResetTests(unittest.TestCase):
    def test_existing_schema_reset_matches_fresh_migrations(self):
        for family in ('current', 'history'):
            for reset in (family, 'all'):
                with self.subTest(family=family, reset=reset), tempfile.TemporaryDirectory() as tmp:
                    root = Path(tmp)
                    migrations = ROOT / 'migrations' / family
                    old = root / 'old'
                    for path in sorted(migrations.glob('*/migration.sql')):
                        if path.parent.name >= '20261017055000':
                            break
                        target = old / path.parent.name / path.name
                        target.parent.mkdir(parents=True, exist_ok=True)
                        shutil.copyfile(path, target)
                    database = root / 'reset.sqlite'
                    runner.migrate(database, old, root / 'backups')
                    with sqlite3.connect(database) as db:
                        db.execute("INSERT INTO placeDivisionDefinitions(id,definition) VALUES ('retained','{}')")
                        db.commit()
                        db.executescript((ROOT / 'scripts/sql' / f'drop-{reset}-db.sql').read_text())
                        self.assertEqual(db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").fetchall(), [])
                    runner.migrate(database, migrations, root / 'backups')
                    fresh = root / 'fresh.sqlite'
                    runner.migrate(fresh, migrations, root / 'backups')
                    with sqlite3.connect(database) as db, sqlite3.connect(fresh) as expected:
                        schema = "SELECT type,name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name"
                        self.assertEqual(db.execute(schema).fetchall(), expected.execute(schema).fetchall())
                        tables = {r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
                        self.assertNotIn('placeDivisionDefinitions', tables)
                        self.assertNotIn('placesDivision', tables)
                        columns = lambda table: {r[1] for r in db.execute(f'PRAGMA table_info({table})')}
                        self.assertIn('addressRole', columns('places'))
                        self.assertNotIn('divisionDefinitionSetId', columns('places'))
                        self.assertNotIn('addressSnapshotId', columns('places'))
                        if family == 'current':
                            self.assertTrue({'divisionSnapshotId', 'addressSnapshotId', 'supplementaryAddressSnapshotId'} <= columns('placePublicationState'))
                            self.assertIn('divisionSnapshotId', columns('addressPublicationState'))
                        self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(), [])
                        self.assertEqual(db.execute('PRAGMA integrity_check').fetchone(), ('ok',))
                    self.assertEqual(runner.migrate(database, migrations, root / 'backups'), [])
