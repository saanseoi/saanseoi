"""Apply generated migrations atomically to a local D1 SQLite file.

D1 cannot disable foreign keys inside its implicit transaction. Native SQLite can
set this before BEGIN, preserving children while Drizzle rebuilds parent tables.
Remote migrations deliberately do not use this runner.
"""
import argparse
from datetime import datetime, timezone
from pathlib import Path
import sqlite3
import re

from history_producer_upgrade import MIGRATION as HISTORY_PRODUCER_MIGRATION, upgrade as upgrade_history_producers
from inline_history_upgrade import MIGRATION as INLINE_HISTORY_MIGRATION, upgrade as upgrade_inline_history
from place_storage_upgrade import MIGRATIONS as PLACE_STORAGE_MIGRATIONS, upgrade as upgrade_place_storage


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


def sql_tokens(sql):
    # Preserve quoted string values, but ignore identifier quoting and whitespace.
    tokens = re.findall(r"'(?:''|[^'])*'|\"(?:\"\"|[^\"])*\"|`[^`]*`|\[[^]]*\]|\w+|[^\s]", sql)
    return tuple(token if token.startswith("'") else token.strip('`"[]').lower()
                 for token in tokens)


def table_definition(sql):
    tokens = sql_tokens(sql)
    start = tokens.index('(')
    parts, part, depth = [], [], 0
    for index, token in enumerate(tokens[start + 1:], start + 1):
        if token == ')' and depth == 0:
            parts.append(tuple(part))
            return tuple(sorted(parts)), tuple(token for token in tokens[index + 1:] if token != ';')
        if token == ',' and depth == 0:
            parts.append(tuple(part))
            part = []
            continue
        depth += (token == '(') - (token == ')')
        part.append(token)
    raise ValueError('Unterminated table definition')


def baseline_adoption(db, path):
    sql = path.read_text()
    chunks = list(statements(sql))
    # Only a fresh schema baseline can be adopted. Incremental SQL must execute.
    if not chunks or any(not re.match(r'\s*(?:-->[^\n]*\n\s*)*(?:CREATE\s+(?:TABLE|(?:UNIQUE\s+)?INDEX)|PRAGMA)\b', chunk, re.I)
                         for chunk in chunks):
        return False
    expected = sqlite3.connect(':memory:')
    try:
        expected.executescript(sql)
        objects = expected.execute("SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%'").fetchall()
        if not any(db.execute("SELECT 1 FROM sqlite_master WHERE type=? AND name=?", (kind, name)).fetchone()
                   for kind, name, _ in objects):
            return False
        differences = []
        for kind, name, declaration in objects:
            actual = db.execute('SELECT sql FROM sqlite_master WHERE type=? AND name=?', (kind, name)).fetchone()
            normalise = table_definition if kind == 'table' else sql_tokens
            if actual is None or normalise(actual[0]) != normalise(declaration):
                differences.append(f'{kind} {name}')
            if kind == 'table' and actual is not None:
                # Include extra indexes: UNIQUE indexes can change permitted data.
                indexes = lambda connection: sorted((row[1], row[2], row[3], row[4])
                    for row in connection.execute(f'PRAGMA index_list({quote(name)})'))
                if indexes(db) != indexes(expected):
                    differences.append(f'indexes on {name}')
        if differences:
            raise ValueError(f'Cannot adopt regenerated baseline {path.parent.name}: schema differs for '
                             + ', '.join(differences)
                             + '. Apply a data-preserving schema upgrade first; no baseline receipt was recorded.')
        return True
    finally:
        expected.close()


def migrate(database_path, migrations_dir, backup_dir, table='d1_migrations', metadata=None, history_databases=()):
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
        adopt_baseline = pending[0][1] == sorted(root.rglob('*.sql'))[0] and baseline_adoption(db, pending[0][1])
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
            if adopt_baseline and path == pending[0][1]:
                print(f'Adopting schema-verified baseline {name}', flush=True)
            else:
                print(f'Applying {name}', flush=True)
                if name == INLINE_HISTORY_MIGRATION:
                    upgrade_inline_history(db, path.read_text(), statements, metadata)
                elif name == HISTORY_PRODUCER_MIGRATION:
                    upgrade_history_producers(db, path.read_text(), statements, metadata)
                elif name in PLACE_STORAGE_MIGRATIONS:
                    upgrade_place_storage(db, name, path.read_text(), statements, metadata, history_databases)
                else:
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
    parser.add_argument('--metadata', help='Local META SQLite path for verified HISTORY ownership')
    parser.add_argument('--history', action='append', default=[], help='Local HISTORY SQLite path for retained Place Division revisions')
    args = parser.parse_args()
    migrate(args.database, args.migrations, args.backups, args.table, args.metadata, args.history)
