"""Apply generated migrations atomically to a local D1 SQLite file.

D1 cannot disable foreign keys inside its implicit transaction. Native SQLite can
set this before BEGIN, preserving children while Drizzle rebuilds parent tables.
Remote migrations deliberately do not use this runner.
"""
import argparse
from datetime import datetime, timezone
from pathlib import Path
import sqlite3


def quote(identifier):
    return '"' + identifier.replace('"', '""') + '"'


def statements(sql):
    pending = ''
    for character in sql:
        pending += character
        if character == ';' and sqlite3.complete_statement(pending):
            yield pending
            pending = ''
    if pending.strip():
        yield pending


def migrate(database_path, migrations_dir, backup_dir, table='d1_migrations'):
    database_path = Path(database_path)
    database_path.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(database_path, timeout=30, isolation_level=None)
    try:
        db.execute('PRAGMA foreign_keys=OFF')
        db.execute('BEGIN IMMEDIATE')
        db.execute(f'CREATE TABLE IF NOT EXISTS {quote(table)} '
                   '(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, '
                   'applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL)')
        applied = {row[0] for row in db.execute(f'SELECT name FROM {quote(table)}')}
        root = Path(migrations_dir)
        if not root.is_dir():
            raise ValueError(f'Migration directory does not exist: {root}')
        pending = [(path.relative_to(root).as_posix(), path)
                   for path in sorted(root.rglob('*.sql'))
                   if path.relative_to(root).as_posix() not in applied]
        if not pending:
            db.commit()
            print(f'No migrations to apply: {database_path.name}', flush=True)
            return []
        if db.execute('PRAGMA foreign_key_check').fetchone():
            raise ValueError('Existing foreign-key violations; database was not migrated.')
        # BEGIN IMMEDIATE excludes other writers. A separate read connection backs
        # up the committed database, including its WAL, without copying live files.
        backup_dir = Path(backup_dir)
        backup_dir.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
        backup = backup_dir / f'{database_path.stem}-{stamp}.sqlite'
        with sqlite3.connect(database_path) as reader, sqlite3.connect(backup) as saved:
            reader.backup(saved)
        print(f'Backup: {backup}', flush=True)
        for name, path in pending:
            print(f'Applying {name}', flush=True)
            for statement in statements(path.read_text()):
                db.execute(statement)
            db.execute(f'INSERT INTO {quote(table)} (name) VALUES (?)', (name,))
        violations = db.execute('PRAGMA foreign_key_check').fetchmany(10)
        if violations:
            raise ValueError(f'Migrations produced foreign-key violations: {violations}')
        db.commit()
        print(f'Applied {len(pending)} migrations; foreign-key check passed.', flush=True)
        return [name for name, _ in pending]
    except BaseException:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('database')
    parser.add_argument('migrations')
    parser.add_argument('backups')
    parser.add_argument('--table', default='d1_migrations')
    args = parser.parse_args()
    migrate(args.database, args.migrations, args.backups, args.table)
