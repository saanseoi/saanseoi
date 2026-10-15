import importlib.util
import json
from pathlib import Path
import shutil
import sqlite3
import tempfile
import unittest

from place_storage_upgrade import CURRENT_SPATIAL, HISTORY_SPATIAL

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('migrate_local', Path(__file__).with_name('migrate-local-sqlite.py'))
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


class PlaceStorageUpgradeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.database = self.root / 'database.sqlite'
        self.migrations = self.root / 'migrations'
        self.metadata = None
        self.history_databases = []

    def tearDown(self):
        self.temp.cleanup()

    def prepare(self, family, cutoff):
        self.family = family
        for path in sorted((ROOT / 'migrations' / family).glob('*/migration.sql')):
            if path.parent.name >= cutoff.split('/')[0]:
                break
            self.copy(path)
        self.run_migrations()

    def copy(self, path):
        target = self.migrations / path.parent.name / path.name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(path, target)

    def remaining(self):
        for path in (ROOT / 'migrations' / self.family).glob('*/migration.sql'):
            self.copy(path)

    def run_migrations(self):
        return runner.migrate(self.database, self.migrations, self.root / 'backups',
                              metadata=self.metadata, history_databases=self.history_databases)

    def insert(self, db, table, **values):
        for _, name, kind, required, default, _ in db.execute(f'PRAGMA table_info("{table}")'):
            if required and default is None and name not in values:
                values[name] = 1 if kind in ('INTEGER', 'REAL') else '{}'
        names = ','.join('"' + name + '"' for name in values)
        db.execute(f'INSERT INTO "{table}" ({names}) VALUES ({",".join("?" for _ in values)})', tuple(values.values()))

    def place(self, db, **values):
        self.insert(db, 'places', id='place', lng=114.1, lat=22.3,
                    bbox='{"xmin":114,"ymin":22,"xmax":115,"ymax":23}',
                    wikidataId='Q123', **values)

    def test_populated_current_preserves_point_brand_children_and_exact_division_revision(self):
        self.prepare('current', CURRENT_SPATIAL)
        with sqlite3.connect(self.database) as db:
            self.place(db, scopeId='scope')
            self.insert(db, 'placesI18n', scopeId='scope', placeId='place', locale='en', name='Retained')
            self.insert(db, 'placesCells', scopeId='scope', id='place', h3Level=9, h3Cell='cell')
            self.insert(db, 'divisions', scopeId='revision', id='district', **{'class': 'district'})
            # The same ID has a different class on another branch.
            self.insert(db, 'divisions', scopeId='other', id='district', **{'class': 'town'})
            self.insert(db, 'placesDivision', placeScopeId='scope', placeId='place',
                        divisionId='district', divisionSnapshotId='revision',
                        definition='{"level":2,"locales":[{"locale":"en","name":"District"}]}')
        self.metadata = self.root / 'meta.sqlite'
        self.history_databases = [self.root / 'history.sqlite']
        with sqlite3.connect(self.metadata) as db:
            db.executescript("CREATE TABLE snapshots(id,parentSnapshotId); INSERT INTO snapshots VALUES('ancestor',NULL),('revision','ancestor');")
        with sqlite3.connect(self.history_databases[0]) as db:
            db.executescript("""CREATE TABLE divisions(id,snapshotId,class,hierarchies,operation);
                INSERT INTO divisions VALUES('district','ancestor','district',NULL,'upsert'),('district','other','town',NULL,'upsert');""")
            for identity, kind, paths in [('island', 'major_island', []),
                                          ('islet', 'islet', [[{'id': 'island', 'class': 'major_island'}]]),
                                          ('town-a', 'town', []), ('town-b', 'town', [])]:
                db.execute('INSERT INTO divisions VALUES (?,?,?,?,?)',
                           (identity, 'ancestor', kind, json.dumps({'full': paths}), 'upsert'))
        with sqlite3.connect(self.database) as db:
            for identity in ['island', 'islet', 'town-a', 'town-b']:
                self.insert(db, 'placesDivision', placeScopeId='scope', placeId='place',
                            divisionId=identity, divisionSnapshotId='revision',
                            definition='{"level":null,"locales":[]}')
        self.remaining()
        self.run_migrations()
        self.assertEqual(self.run_migrations(), [])
        with sqlite3.connect(self.database) as db:
            geometry, bounds, identifiers, district, town, definition = db.execute('''
                SELECT p.geometry,p.bbox,p.identifiers,p.districtId,p.townId,d.definition
                FROM places p JOIN placeDivisionDefinitions d ON d.id=p.divisionDefinitionSetId''').fetchone()
            self.assertEqual(json.loads(geometry), {'type': 'Point', 'coordinates': [114.1, 22.3]})
            self.assertEqual(list(json.loads(geometry)), ['type', 'coordinates'])
            self.assertEqual(json.loads(bounds), [114, 22, 115, 23])
            self.assertEqual(json.loads(identifiers), {'wikidata': {'brandId': 'Q123'}})
            self.assertEqual((district, town), ('district', None))
            self.assertEqual(db.execute('SELECT landformId FROM places').fetchone(), ('islet',))
            self.assertEqual(set(json.loads(definition)), {'district', 'islet'})
            self.assertEqual(json.loads(definition)['district']['divisionSnapshotId'], 'revision')
            self.assertEqual(db.execute('SELECT name FROM placesI18n').fetchall(), [('Retained',)])
            self.assertEqual(db.execute('SELECT h3Cell FROM placesCells').fetchall(), [('cell',)])
            self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(), [])
            self.assertEqual(db.execute('PRAGMA integrity_check').fetchone(), ('ok',))
            self.assertEqual(next(r[3] for r in db.execute('PRAGMA table_info(places)') if r[1] == 'geometry'), 1)
            self.assertNotIn('lat', [r[1] for r in db.execute('PRAGMA table_info(places)')])

    def test_populated_history_preserves_upserts_tombstones_and_version_identity(self):
        self.prepare('history', HISTORY_SPATIAL)
        with sqlite3.connect(self.database) as db:
            self.place(db, snapshotId='root', operation='upsert', versionHash='retained-hash',
                       sourceReleaseId='release', resourceReleaseId='release',
                       firstSeenMonth='2025-01', lastSeenMonth='2025-02')
            db.execute("INSERT INTO places(id,snapshotId,operation,versionHash) VALUES('place','deleted','delete',NULL)")
        self.remaining()
        self.run_migrations()
        self.assertEqual(self.run_migrations(), [])
        with sqlite3.connect(self.database) as db:
            geometry, bounds, identifiers, version = db.execute("SELECT geometry,bbox,identifiers,versionHash FROM places WHERE snapshotId='root'").fetchone()
            self.assertEqual(json.loads(geometry)['coordinates'], [114.1, 22.3])
            self.assertEqual(list(json.loads(geometry)), ['type', 'coordinates'])
            self.assertEqual(json.loads(bounds), [114, 22, 115, 23])
            self.assertEqual(json.loads(identifiers), {'wikidata': {'brandId': 'Q123'}})
            self.assertEqual(version, 'retained-hash')
            self.assertEqual(db.execute("SELECT operation,geometry,versionHash FROM places WHERE snapshotId='deleted'").fetchone(), ('delete', None, None))
            self.assertEqual(db.execute("SELECT count(*) FROM historyEvents WHERE recordType='place'").fetchone(), (2,))
            self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(), [])

    def test_invalid_coordinates_roll_back_data_schema_and_receipts(self):
        self.prepare('current', CURRENT_SPATIAL)
        with sqlite3.connect(self.database) as db:
            self.place(db, scopeId='scope')
            db.execute('UPDATE places SET lat=999')
            receipts = db.execute('SELECT name FROM d1_migrations').fetchall()
        self.remaining()
        with self.assertRaises(sqlite3.OperationalError):
            self.run_migrations()
        with sqlite3.connect(self.database) as db:
            self.assertEqual(db.execute('SELECT lat FROM places').fetchone(), (999,))
            self.assertEqual(db.execute('SELECT name FROM d1_migrations').fetchall(), receipts)
            self.assertNotIn('geometry', [r[1] for r in db.execute('PRAGMA table_info(places)')])


if __name__ == '__main__':
    unittest.main()
