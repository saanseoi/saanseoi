import sqlite3
import unittest
from place_storage_upgrade import PUBLICATION_DEPENDENCIES, upgrade


class PublicationMigrationTests(unittest.TestCase):
    def test_refuses_populated_places_before_running_generated_ddl(self):
        for migration in PUBLICATION_DEPENDENCIES:
            with self.subTest(migration=migration), sqlite3.connect(':memory:') as db:
                db.execute('CREATE TABLE places(id TEXT)')
                db.execute("INSERT INTO places VALUES ('retained')")
                with self.assertRaisesRegex(ValueError, 'reviewed rebuild'):
                    upgrade(db, migration, 'DROP TABLE places;', lambda sql: [sql])
                self.assertEqual(db.execute('SELECT id FROM places').fetchall(), [('retained',)])

    def test_empty_database_executes_generated_ddl(self):
        for migration in PUBLICATION_DEPENDENCIES:
            with self.subTest(migration=migration), sqlite3.connect(':memory:') as db:
                db.execute('CREATE TABLE places(id TEXT)')
                upgrade(db, migration, 'ALTER TABLE places ADD addressRole TEXT;', lambda sql: [sql])
                self.assertIn('addressRole', [row[1] for row in db.execute('PRAGMA table_info(places)')])

    def test_refuses_existing_dependency_rows_even_with_empty_places(self):
        for table in ('placePublicationState', 'addressPublicationState', 'address2d'):
            with self.subTest(table=table), sqlite3.connect(':memory:') as db:
                db.execute('CREATE TABLE places(id TEXT)')
                db.execute(f'CREATE TABLE "{table}"(id TEXT)')
                db.execute(f'INSERT INTO "{table}" VALUES (?)', ('retained',))
                with self.assertRaisesRegex(ValueError, 'reviewed rebuild'):
                    upgrade(db, next(iter(PUBLICATION_DEPENDENCIES)), 'DROP TABLE places;', lambda sql: [sql])
                self.assertEqual(db.execute('SELECT count(*) FROM places').fetchone()[0], 0)
