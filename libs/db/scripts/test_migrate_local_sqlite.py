import importlib.util
from pathlib import Path
import sqlite3
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('migrate_local', Path(__file__).with_name('migrate-local-sqlite.py'))
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


class LocalMigrationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.database = self.root / 'database.sqlite'
        self.migrations = self.root / 'migrations'
        self.migrations.mkdir()
        self.backups = self.root / 'backups'
        with sqlite3.connect(self.database) as db:
            db.executescript('''PRAGMA journal_mode=WAL;
              CREATE TABLE parent(id TEXT PRIMARY KEY, value TEXT);
              CREATE TABLE child(id TEXT PRIMARY KEY, parentId TEXT REFERENCES parent(id) ON DELETE CASCADE);
              INSERT INTO parent VALUES ('p','retained');
              INSERT INTO child VALUES ('c','p');''')

    def tearDown(self):
        self.temp.cleanup()

    def write(self, name, sql):
        path = self.migrations / name / 'migration.sql'
        path.parent.mkdir()
        path.write_text(sql)

    def run_migrations(self):
        return runner.migrate(self.database, self.migrations, self.backups)

    def test_parent_rebuild_preserves_children_and_is_idempotent(self):
        self.write('001', '''PRAGMA foreign_keys=OFF;
          CREATE TABLE replacement(id TEXT PRIMARY KEY, value TEXT);
          INSERT INTO replacement SELECT * FROM parent;
          DROP TABLE parent;
          ALTER TABLE replacement RENAME TO parent;
          PRAGMA foreign_keys=ON;''')
        self.assertEqual(self.run_migrations(), ['001/migration.sql'])
        self.assertEqual(self.run_migrations(), [])
        with sqlite3.connect(self.database) as db:
            self.assertEqual(db.execute('SELECT * FROM child').fetchall(), [('c','p')])
            self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(), [])
            self.assertEqual(db.execute('SELECT name FROM d1_migrations').fetchall(), [('001/migration.sql',)])
        backup, = self.backups.glob('*.sqlite')
        with sqlite3.connect(backup) as db:
            self.assertEqual(db.execute('SELECT * FROM parent').fetchall(), [('p','retained')])
            self.assertEqual(db.execute("SELECT name FROM sqlite_master WHERE name='d1_migrations'").fetchall(), [])

    def test_failed_batch_rolls_back_schema_data_and_receipts(self):
        self.write('001', "ALTER TABLE parent ADD extra TEXT; UPDATE parent SET value='changed';")
        self.write('002', "INSERT INTO child VALUES ('bad','missing');")
        with self.assertRaisesRegex(ValueError, 'foreign-key violations'):
            self.run_migrations()
        with sqlite3.connect(self.database) as db:
            self.assertEqual(db.execute('SELECT * FROM parent').fetchall(), [('p','retained')])
            self.assertEqual(db.execute('SELECT * FROM child').fetchall(), [('c','p')])
            self.assertEqual(db.execute("SELECT name FROM sqlite_master WHERE name='d1_migrations'").fetchall(), [])

    def test_statements_preserve_triggers_and_semicolons_in_values(self):
        self.write('001', '''CREATE TRIGGER capture AFTER INSERT ON parent BEGIN
          INSERT INTO child VALUES (NEW.id, NEW.id);
          UPDATE parent SET value='semi;colon' WHERE id=NEW.id;
          END;
          INSERT INTO parent VALUES ('new','initial');''')
        self.run_migrations()
        with sqlite3.connect(self.database) as db:
            self.assertEqual(db.execute("SELECT value FROM parent WHERE id='new'").fetchone(), ('semi;colon',))


if __name__ == '__main__':
    unittest.main()
