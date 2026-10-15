from contextlib import closing
import importlib.util
from pathlib import Path
import sqlite3
import tempfile
import unittest

from history_producer_upgrade import MIGRATION, upgrade

ROOT = Path(__file__).resolve().parents[1] / 'migrations' / 'history'
spec = importlib.util.spec_from_file_location('local_migration_runner', Path(__file__).with_name('migrate-local-sqlite.py'))
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


class HistoryProducerUpgradeTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.db = sqlite3.connect(':memory:')
        for path in sorted(ROOT.glob('*/migration.sql')):
            if str(path.relative_to(ROOT)) != MIGRATION:
                self.db.executescript(path.read_text())
        self.db.execute('PRAGMA foreign_keys=OFF')
        self.meta_path = Path(self.temp.name) / 'meta.sqlite'
        with closing(sqlite3.connect(self.meta_path)) as meta, meta:
            meta.executescript('''CREATE TABLE datasets(id,code);
                CREATE TABLE resourceReleaseDetails(id,datasetId,resourceType);
                CREATE TABLE snapshotResourceReleases(snapshotId,resourceReleaseId,role);
                INSERT INTO datasets VALUES('a','dataset-a'),('b','dataset-b');
                INSERT INTO resourceReleaseDetails VALUES('release-a','a','divisionArea'),('release-b','b','divisionArea');
                INSERT INTO snapshotResourceReleases VALUES('mixed','release-a','primary'),('mixed','release-b','primary'),('single','release-a','primary');''')
        self.db.executescript('''INSERT INTO divisionAreas(id,snapshotId,divisionId,variant,type,versionHash,sourceReleaseId,geometry) VALUES
            ('a','mixed','division','censtatd','land','a1','release-a','{"type":"Polygon","coordinates":[]}'),
            ('b','mixed','division','censtatd','land','b1','release-b','{"type":"Polygon","coordinates":[]}'),
            ('c','single','division','overture','land','c1','release-a','{"type":"Polygon","coordinates":[]}');
            INSERT INTO statsMeasures(datasetCode,measureCode,snapshotId,versionHash,sourceReleaseId) VALUES
              ('dataset-a','count','mixed','ma','release-a'),('dataset-b','count','mixed','mb','release-b');''')

    def tearDown(self):
        self.db.close()
        self.temp.cleanup()

    def apply(self, metadata=True):
        upgrade(self.db, (ROOT / MIGRATION).read_text(), runner.statements, self.meta_path if metadata else None)

    def test_retains_mixed_dataset_ownership_and_leaves_single_inputs_unqualified(self):
        payloads = self.db.execute('SELECT id,versionHash,geometry FROM divisionAreas ORDER BY id').fetchall()
        self.apply()
        self.assertEqual(payloads, self.db.execute('SELECT id,versionHash,geometry FROM divisionAreas ORDER BY id').fetchall())
        self.assertEqual([('a','dataset-a'),('b','dataset-b'),('c',None)], self.db.execute('SELECT id,producerDatasetCode FROM divisionAreas ORDER BY id').fetchall())
        self.assertNotIn('sourceReleaseId', [row[1] for row in self.db.execute('PRAGMA table_info(divisionAreas)')])
        self.assertEqual([('dataset-a',),('dataset-b',)], self.db.execute("SELECT producerDatasetCode FROM historyEvents WHERE recordType='statsMeasure' ORDER BY producerDatasetCode").fetchall())
        self.assertEqual('ok',self.db.execute('PRAGMA integrity_check').fetchone()[0])

    def test_requires_metadata_before_removing_ownership(self):
        with self.assertRaisesRegex(ValueError,'requires --metadata'):
            self.apply(False)
        self.assertIn('sourceReleaseId', [row[1] for row in self.db.execute('PRAGMA table_info(divisionAreas)')])
        self.assertNotIn('producerDatasetCode', [row[1] for row in self.db.execute('PRAGMA table_info(divisionAreas)')])

    def test_reapplies_conversion_without_losing_existing_dataset_ownership(self):
        self.apply()
        rows = self.db.execute('SELECT * FROM divisionAreas ORDER BY id').fetchall()
        self.apply()
        self.assertEqual(rows, self.db.execute('SELECT * FROM divisionAreas ORDER BY id').fetchall())
        self.assertEqual('ok', self.db.execute('PRAGMA integrity_check').fetchone()[0])

    def test_fills_preexisting_discriminator_columns_before_removing_releases(self):
        for table in ['divisionAreas', 'divisionBoundaries']:
            self.db.execute(f'ALTER TABLE {table} ADD producerDatasetCode TEXT')
        self.apply()
        self.assertEqual([('a','dataset-a'),('b','dataset-b'),('c',None)], self.db.execute('SELECT id,producerDatasetCode FROM divisionAreas ORDER BY id').fetchall())

    def test_rejects_incompatible_preexisting_discriminator(self):
        self.db.execute('ALTER TABLE divisionAreas ADD producerDatasetCode INTEGER')
        with self.assertRaisesRegex(ValueError, 'incompatible producerDatasetCode'):
            self.apply()

    def test_rejects_a_retained_owner_that_metadata_cannot_reproduce(self):
        self.db.execute("UPDATE divisionAreas SET sourceReleaseId='release-b' WHERE id='c'")
        with self.assertRaisesRegex(ValueError,'not an unambiguous primary producer'):
            self.apply()
        self.assertNotIn('producerDatasetCode', [row[1] for row in self.db.execute('PRAGMA table_info(divisionAreas)')])

    def test_rejects_competing_editions_of_the_same_dataset(self):
        with closing(sqlite3.connect(self.meta_path)) as meta, meta:
            meta.execute("INSERT INTO resourceReleaseDetails VALUES('competing','a','divisionArea')")
            meta.execute("INSERT INTO snapshotResourceReleases VALUES('mixed','competing','primary')")
        with self.assertRaisesRegex(ValueError,'competing HISTORY producers'):
            self.apply()
        self.assertNotIn('producerDatasetCode', [row[1] for row in self.db.execute('PRAGMA table_info(divisionAreas)')])


if __name__ == '__main__':
    unittest.main()
