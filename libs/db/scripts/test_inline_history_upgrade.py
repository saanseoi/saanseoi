import importlib.util
from pathlib import Path
import shutil
import sqlite3
import tempfile
import unittest

from inline_history_upgrade import MIGRATION

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('migrate_local', Path(__file__).with_name('migrate-local-sqlite.py'))
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


class InlineHistoryUpgradeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.database = self.root / 'history.sqlite'
        self.migrations = self.root / 'migrations'
        self.migrations.mkdir()
        for path in sorted((ROOT / 'migrations/history').glob('*/migration.sql')):
            if path.parent.name >= MIGRATION.split('/')[0]:
                break
            target = self.migrations / path.parent.name / path.name
            target.parent.mkdir()
            shutil.copyfile(path, target)
        runner.migrate(self.database, self.migrations, self.root / 'backups')
        for name in [MIGRATION, '20261013074724_salty_wrecking_crew/migration.sql']:
            target = self.migrations / name
            target.parent.mkdir()
            shutil.copyfile(ROOT / 'migrations/history' / name, target)

    def tearDown(self):
        self.temp.cleanup()

    def insert(self, db, table, **values):
        # Supply irrelevant required content using its physical SQLite type.
        for _, name, kind, required, default, _ in db.execute(f'PRAGMA table_info("{table}")'):
            if required and default is None and name not in values:
                values[name] = 1 if kind == 'INTEGER' else '{}'
        names = ','.join('"' + name + '"' for name in values)
        db.execute(f'INSERT INTO "{table}" ({names}) VALUES ({",".join("?" for _ in values)})', tuple(values.values()))

    def event(self, db, kind, identity, snapshot, version='hash', operation='upsert'):
        self.insert(db, 'snapshotVersionChanges', recordType=kind, recordId=identity,
                    snapshotId=snapshot, versionHash=version, operation=operation, sourceReleaseId='release')

    def run_upgrade(self):
        return runner.migrate(self.database, self.migrations, self.root / 'backups')

    def test_reused_versions_deletions_and_dictionary_ownership_survive(self):
        with sqlite3.connect(self.database) as db:
            self.insert(db, 'divisions', id='division', snapshotId='root', versionHash='hash', sourceReleaseId='release', identifiers='{"publisher":{"id":"retained"}}')
            self.event(db, 'division', 'division', 'root')
            self.event(db, 'division', 'division', 'reuse')
            self.event(db, 'division', 'division', 'deleted', None, 'delete')
            self.insert(db, 'statsRecords', id='stat', datasetCode='dataset', definitionSetId='definitions', versionHash='stat-hash', sourceReleaseId='release')
            self.event(db, 'statsRecord', 'stat', 'root', 'stat-hash')
            self.insert(db, 'statsDefinitionSets', id='definitions', fieldDefinitionHashes='{"field":"field-hash"}')
            self.insert(db, 'statsFields', datasetCode='dataset', fieldName='field', measureCode='measure', measureVersionHash='measure-hash', versionHash='field-hash', sourceReleaseId='release')
            self.insert(db, 'statsFieldsI18n', datasetCode='dataset', fieldName='field', locale='en', versionHash='field-hash', sourceReleaseId='release')
            self.insert(db, 'statsMeasures', datasetCode='dataset', measureCode='measure', versionHash='measure-hash', sourceReleaseId='release')
            self.insert(db, 'statsMeasuresI18n', datasetCode='dataset', measureCode='measure', locale='en', versionHash='measure-hash', sourceReleaseId='release')
            self.insert(db, 'address2dBuildingNumberLookup', addressId='address', buildingNumber='1', snapshotId='root', versionHash='lookup-hash', sourceReleaseId='release')
            events = db.execute('SELECT snapshotId,recordType,recordId,locale,versionHash,operation,sourceReleaseId FROM snapshotVersionChanges ORDER BY 1,2').fetchall()
        self.assertEqual(len(self.run_upgrade()), 2)
        self.assertEqual(self.run_upgrade(), [])
        with sqlite3.connect(self.database) as db:
            for event in events:
                self.assertIn(event, db.execute('SELECT snapshotId,recordType,recordId,locale,versionHash,operation,sourceReleaseId FROM historyEvents').fetchall())
            self.assertEqual(db.execute("SELECT identifiers FROM divisions WHERE snapshotId='reuse'").fetchone()[0], '{"publisher":{"id":"retained"}}')
            self.assertEqual(db.execute("SELECT snapshotId FROM statsFields").fetchall(), [('root',)])
            self.assertEqual(db.execute("SELECT snapshotId FROM statsMeasuresI18n").fetchall(), [('root',)])
            self.assertNotIn('identifiers', [r[1] for r in db.execute('PRAGMA table_info(divisionAreas)')])
            self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(), [])
            self.assertEqual(db.execute('PRAGMA integrity_check').fetchone(), ('ok',))

    def test_missing_payload_rolls_back_schema_and_receipts(self):
        with sqlite3.connect(self.database) as db:
            self.event(db, 'division', 'missing', 'root')
            receipts = db.execute('SELECT * FROM d1_migrations').fetchall()
        with self.assertRaisesRegex(ValueError, 'local payload matches'):
            self.run_upgrade()
        with sqlite3.connect(self.database) as db:
            self.assertEqual(db.execute('SELECT * FROM d1_migrations').fetchall(), receipts)
            self.assertEqual(db.execute('SELECT count(*) FROM snapshotVersionChanges').fetchone(), (1,))
            self.assertNotIn('operation', [r[1] for r in db.execute('PRAGMA table_info(divisions)')])
            self.assertEqual(db.execute("SELECT count(*) FROM sqlite_schema WHERE name LIKE '__new_%'").fetchone(), (0,))

    def test_unowned_dictionary_is_rejected_without_discarding_it(self):
        with sqlite3.connect(self.database) as db:
            self.insert(db, 'statsMeasures', datasetCode='dataset', measureCode='unowned', versionHash='hash', sourceReleaseId='release')
        with self.assertRaisesRegex(ValueError, 'no verified snapshot owner'):
            self.run_upgrade()
        with sqlite3.connect(self.database) as db:
            self.assertEqual(db.execute('SELECT measureCode FROM statsMeasures').fetchall(), [('unowned',)])

    def test_ambiguous_statistic_ownership_is_rejected(self):
        with sqlite3.connect(self.database) as db:
            self.insert(db, 'divisionStatistics', id='stat', referenceYear=2024,
                        versionHash='hash', sourceReleaseId='release')
        metadata = self.root / 'meta.sqlite'
        with sqlite3.connect(metadata) as db:
            db.executescript("""
                CREATE TABLE snapshots(id, snapshotLineageId, cohortKey);
                CREATE TABLE snapshotLineages(id, resourceType);
                CREATE TABLE snapshotResourceReleases(snapshotId, resourceReleaseId);
                INSERT INTO snapshotLineages VALUES('lineage','divisionStatistic');
                INSERT INTO snapshots VALUES('a','lineage','2024'),('b','lineage','2024');
                INSERT INTO snapshotResourceReleases VALUES('a','release'),('b','release');
            """)
        with self.assertRaisesRegex(ValueError, 'Ambiguous district statistic owner'):
            runner.migrate(self.database, self.migrations, self.root / 'backups', metadata=metadata)
        with sqlite3.connect(self.database) as db:
            self.assertEqual(db.execute('SELECT id FROM divisionStatistics').fetchall(), [('stat',)])


if __name__ == '__main__':
    unittest.main()
