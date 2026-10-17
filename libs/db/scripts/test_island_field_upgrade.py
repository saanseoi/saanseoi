import json
from pathlib import Path
import sqlite3
import unittest

from island_field_upgrade import MIGRATIONS, upgrade


class IslandFieldUpgradeTests(unittest.TestCase):
    def test_only_canonical_paths_change_and_repeat_is_noop(self):
        db = sqlite3.connect(':memory:')
        sources = [dict(properties=['districtId', 'landformId'], property='landformId',
                        recordId='landformId'), dict(property='landformId')]
        for table in ('places', 'address2d'):
            db.execute(f'CREATE TABLE {table}(sources TEXT, versionHash TEXT)')
            db.execute(f'INSERT INTO {table} VALUES (?,?)', (json.dumps(sources), 'retained'))
        self.assertEqual(upgrade(db), 2)
        self.assertEqual(upgrade(db), 0)
        for table in ('places', 'address2d'):
            encoded, version = db.execute(f'SELECT * FROM {table}').fetchone()
            expected = json.loads(json.dumps(sources))
            expected[0]['properties'][1] = 'islandId'
            self.assertEqual(json.loads(encoded), expected)
            self.assertEqual(version, 'retained')
        db.close()


    def test_generated_migrations_preserve_populated_rows(self):
        root = Path(__file__).resolve().parents[1] / 'migrations'
        for family in ('current', 'history'):
            with self.subTest(family=family):
                db = sqlite3.connect(':memory:')
                paths = sorted((root / family).glob('*/migration.sql'))
                migration = next(p for p in paths if p.relative_to(root / family).as_posix() in MIGRATIONS)
                for path in paths:
                    if path == migration:
                        break
                    db.executescript(path.read_text())
                db.execute('PRAGMA foreign_keys=OFF')

                def insert(table, **values):
                    for _, name, kind, required, default, _ in db.execute(f'PRAGMA table_info({table})'):
                        if required and default is None and name not in values:
                            values[name] = 1 if kind in ('INTEGER', 'REAL') else '{}'
                    names = ','.join('"' + name + '"' for name in values)
                    db.execute(f'INSERT INTO {table} ({names}) VALUES ({",".join("?" for _ in values)})', tuple(values.values()))

                if family == 'current':
                    insert('divisions', scopeId='revision', id='island', **{'class': 'islet'})
                for table in ('places', 'address2d'):
                    values = dict(id='record', landformId='island', sources='[{"properties":["landformId"]}]')
                    if family == 'current':
                        values['scopeId'] = 'scope'
                        if table == 'address2d':
                            values['divisionSnapshotId'] = 'revision'
                    else:
                        values.update(snapshotId='snapshot', versionHash='retained', operation='upsert')
                        if table == 'places':
                            values.update(resourceReleaseId='release', geometry='{}', firstSeenMonth='2026-01', lastSeenMonth='2026-01')
                        else:
                            values['granularity'] = 'building'
                    insert(table, **values)
                db.commit()
                db.executescript(migration.read_text())
                self.assertEqual(upgrade(db), 2)
                for table in ('places', 'address2d'):
                    self.assertEqual(db.execute(f'SELECT islandId FROM {table}').fetchone(), ('island',))
                    columns = {r[1] for r in db.execute(f'PRAGMA table_info({table})')}
                    self.assertNotIn('landformId', columns)
                    if family == 'history':
                        self.assertEqual(db.execute(f'SELECT versionHash FROM {table}').fetchone(), ('retained',))
                self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(), [])
                db.close()


if __name__ == '__main__':
    unittest.main()
