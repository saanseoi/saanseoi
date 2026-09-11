import importlib.util
from pathlib import Path
import sqlite3
import json
import contextlib
import io
import shutil
import subprocess
from unittest.mock import patch
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('bootstrap', Path(__file__).with_name('d1-bootstrap.py'))
bootstrap = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bootstrap)


class BootstrapTests(unittest.TestCase):
    def test_fts_exports_logical_documents_without_shadow_tables(self):
        with tempfile.TemporaryDirectory() as directory:
            db = sqlite3.connect(':memory:')
            self.addCleanup(db.close)
            db.execute('CREATE VIRTUAL TABLE addressSearchFts USING fts5(scopeId UNINDEXED, formattedAddress)')
            db.execute("INSERT INTO addressSearchFts(rowid,scopeId,formattedAddress) VALUES(42,'hk','Model Housing Estate')")
            path = Path(directory) / 'search.sql'
            counts, _ = bootstrap.emit_dump(db, path)
            self.assertEqual(counts, {'addressSearchFts': 1})
            bootstrap.restore_check(path, counts)
            restored = sqlite3.connect(':memory:')
            self.addCleanup(restored.close)
            restored.execute('BEGIN')
            for sql in bootstrap.statements(path):
                restored.execute(sql)
            restored.commit()
            self.assertEqual(restored.execute("SELECT rowid,scopeId FROM addressSearchFts WHERE addressSearchFts MATCH 'housing'").fetchall(), [(42, 'hk')])
            self.assertNotIn('CREATE TABLE "addressSearchFts_data"', path.read_text())

    def test_address_staging_and_oversized_rows_are_rejected(self):
        self.assertTrue(bootstrap.transient('ssAddressImportResolvedRows'))
        self.assertTrue(bootstrap.transient('zzAddressImportResolvedI18n'))
        with tempfile.TemporaryDirectory() as directory:
            db = sqlite3.connect(':memory:')
            self.addCleanup(db.close)
            db.execute('CREATE TABLE payload(id INTEGER PRIMARY KEY, value TEXT)')
            db.execute('INSERT INTO payload VALUES(1,?)', ('x' * bootstrap.MAX_D1_ROW_BYTES,))
            with self.assertRaisesRegex(ValueError, 'D1 row size'):
                bootstrap.emit_dump(db, Path(directory) / 'oversized.sql')

    def test_roundtrip_cycles_large_payloads_rowids_and_triggers(self):
        with tempfile.TemporaryDirectory() as directory:
            db = sqlite3.connect(':memory:')
            self.addCleanup(db.close)
            db.executescript('''
                CREATE TABLE parent(id TEXT, child TEXT REFERENCES child(id));
                CREATE UNIQUE INDEX parent_id ON parent(id);
                CREATE TABLE child(id TEXT PRIMARY KEY, parent TEXT REFERENCES parent(id), value TEXT, bytes BLOB);
                CREATE TABLE audit(n INTEGER);
                CREATE TABLE increment(id INTEGER PRIMARY KEY AUTOINCREMENT);
                INSERT INTO increment DEFAULT VALUES;
                INSERT INTO increment DEFAULT VALUES;
                DELETE FROM increment WHERE id=2;
                CREATE TABLE stagingExample(id INTEGER);
                CREATE TABLE harbourSqlDeliveryReceipts(id INTEGER);
                INSERT INTO harbourSqlDeliveryReceipts VALUES(1);
                INSERT INTO parent(rowid,id,child) VALUES(42,'p','c');
                CREATE TRIGGER tracked AFTER INSERT ON child BEGIN INSERT INTO audit VALUES(1); END;
            ''')
            payload = '中\x00\n\'"é' * 30_000
            blob = bytes(range(256)) * 500
            db.execute('INSERT INTO child VALUES(?,?,?,?)', ('c', 'p', payload, blob))
            path = Path(directory) / 'dump.sql'
            counts, _ = bootstrap.emit_dump(db, path)
            bootstrap.restore_check(path, counts)
            restored = sqlite3.connect(':memory:')
            self.addCleanup(restored.close)
            restored.execute('PRAGMA foreign_keys=ON')
            restored.execute('BEGIN')
            for sql in bootstrap.statements(path):
                self.assertLessEqual(len(sql.encode()), bootstrap.LIMIT)
                restored.execute(sql)
            restored.commit()
            self.assertEqual(restored.execute('SELECT value,bytes FROM child').fetchone(), (payload, blob))
            self.assertEqual(restored.execute('SELECT rowid FROM parent').fetchone(), (42,))
            self.assertEqual(restored.execute('SELECT count(*) FROM audit').fetchone(), (1,))
            self.assertEqual(restored.execute('SELECT seq FROM sqlite_sequence').fetchone(), (2,))
            self.assertNotIn('stagingExample', bootstrap.table_names(restored))
            with self.assertRaises(sqlite3.Error):
                for sql in bootstrap.statements(path):
                    restored.execute(sql)

    def test_unresolved_foreign_key_fails_restore(self):
        with tempfile.TemporaryDirectory() as directory:
            db = sqlite3.connect(':memory:')
            self.addCleanup(db.close)
            db.executescript('CREATE TABLE p(id INTEGER PRIMARY KEY); CREATE TABLE c(id INTEGER REFERENCES p(id)); INSERT INTO c VALUES(1);')
            path = Path(directory) / 'dump.sql'
            counts, _ = bootstrap.emit_dump(db, path)
            with self.assertRaises(sqlite3.IntegrityError):
                bootstrap.restore_check(path, counts)

    def test_without_rowid_and_generated_columns(self):
        with tempfile.TemporaryDirectory() as directory:
            db = sqlite3.connect(':memory:')
            self.addCleanup(db.close)
            db.executescript('CREATE TABLE t(a TEXT PRIMARY KEY, b TEXT GENERATED ALWAYS AS (a || a)) WITHOUT ROWID; INSERT INTO t(a) VALUES("x");')
            path = Path(directory) / 'dump.sql'
            counts, _ = bootstrap.emit_dump(db, path)
            bootstrap.restore_check(path, counts)

    def test_complete_bundle_and_checksum_guards(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            paths = {}
            entries = []
            for i, binding in enumerate(('DB_META', 'DB_CURRENT')):
                path = root / (binding + '.sqlite')
                paths[binding] = path
                entries.append({'binding': binding, 'database_name': binding.lower(),
                                'database_id': f'00000000-0000-4000-8000-{i:012d}'})
                with contextlib.closing(sqlite3.connect(path)) as db, db:
                    if binding == 'DB_META':
                        for table in ('releases', 'sourceReleases', 'snapshots', 'apiReleaseSets', 'ingestRuns'):
                            db.execute(f'CREATE TABLE {table}(status TEXT)')
                        db.execute('CREATE TABLE dataShards(id TEXT,bindingName TEXT,environment TEXT,databaseName TEXT,databaseId TEXT,versionHash TEXT)')
                        for name in paths.keys() | {'DB_CURRENT'}:
                            db.execute('INSERT INTO dataShards VALUES(?,?,?,?,?,?)', (name,name,'preview','old','old','old'))
                    else:
                        db.executescript('CREATE TABLE records(id INTEGER PRIMARY KEY, value TEXT); INSERT INTO records VALUES(10,"hello");')
            config = root / 'targets.json'
            config.write_text(json.dumps({'d1_databases': entries}))
            bundle = root / 'bundle'
            with patch.object(bootstrap, 'local_paths', return_value=paths):
                bootstrap.prepare(bundle, config)
            manifest = bootstrap.verify(bundle)
            commands = io.StringIO()
            with contextlib.redirect_stdout(commands):
                bootstrap.commands(bundle)
            if shutil.which('fish'):
                subprocess.run(['fish', '--no-execute'], input=commands.getvalue(), text=True, check=True)
            self.assertEqual([r['binding'] for r in manifest['databases']], ['DB_CURRENT', 'DB_META'])
            with contextlib.closing(sqlite3.connect(paths['DB_META'])) as source:
                self.assertEqual(source.execute('SELECT DISTINCT environment FROM dataShards').fetchall(), [('preview',)])
            with contextlib.closing(sqlite3.connect(paths['DB_META'])) as source, source:
                source.execute("INSERT INTO releases VALUES('processing')")
            with patch.object(bootstrap, 'local_paths', return_value=paths), self.assertRaises(ValueError):
                bootstrap.prepare(root / 'not-ready', config)
            self.assertFalse((root / 'not-ready').exists())
            # A changed target mapping must be rejected before command generation.
            original = (bundle / 'wrangler.json').read_text()
            changed = json.loads(original)
            changed['d1_databases'][0]['database_id'] = '11111111-1111-4111-8111-111111111111'
            (bundle / 'wrangler.json').write_text(json.dumps(changed))
            with self.assertRaises(ValueError):
                bootstrap.verify(bundle, restore=False)
            (bundle / 'wrangler.json').write_text(original)
            with (bundle / 'DB_CURRENT.sql').open('a') as sql:
                sql.write('-- altered')
            with self.assertRaises(ValueError):
                bootstrap.verify(bundle, restore=False)

    def test_remap_preserves_assignment_identity(self):
        db = sqlite3.connect(':memory:')
        self.addCleanup(db.close)
        db.executescript('CREATE TABLE dataShards(id TEXT,bindingName TEXT,environment TEXT,databaseName TEXT,databaseId TEXT,versionHash TEXT); INSERT INTO dataShards VALUES("local-id","DB_META","preview","old","old-id","hash");')
        bootstrap.remap_meta(db, {'DB_META': {'database_id': 'new-id', 'database_name': 'new'}})
        self.assertEqual(db.execute('SELECT id,environment,databaseId FROM dataShards').fetchone(), ('local-id', 'production', 'new-id'))
        with self.assertRaises(ValueError):
            bootstrap.remap_meta(db, {})


if __name__ == '__main__':
    unittest.main()
