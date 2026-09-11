#!/usr/bin/env python3
"""Prepare a complete D1 SQL bundle. No remote writes: prints guarded import commands."""
import argparse
import contextlib
import hashlib
import hmac
import json
import math
import shutil
from datetime import datetime, timezone
from pathlib import Path
import re
import shlex
import sqlite3
import sys
import tempfile
import uuid

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / 'apps/harbour-api/wrangler.jsonc'
BINDING = re.compile(r'DB_(?:META|CURRENT|(?:HISTORY|SOURCE)_[A-Z]{2}_(?:BEFORE|\d{4}))$')
LIMIT = 90_000
TRANSIENT = {'harbourSqlDeliveryReceipts'}
MAX_D1_ROW_BYTES = 2_000_000
MAX_D1_IMPORT_BYTES = 5_000_000_000
MAX_D1_DATABASE_BYTES = 10_000_000_000


def ident(value):
    return '"' + value.replace('"', '""') + '"'


def literal(value):
    if value is None:
        return 'NULL'
    if isinstance(value, bytes):
        return "X'" + value.hex() + "'"
    if isinstance(value, str):
        if '\x00' in value:
            return 'CAST(' + literal(value.encode()) + ' AS TEXT)'
        return "'" + value.replace("'", "''") + "'"
    if isinstance(value, float) and not math.isfinite(value):
        raise ValueError('Non-finite SQLite number cannot be exported')
    return str(value)


def digest(path):
    with open(path, 'rb') as f:
        return hashlib.file_digest(f, 'sha256').hexdigest()


def write_json(path, value):
    path.write_text(json.dumps(value, indent=2) + '\n')


def targets(config):
    raw = json.loads(Path(config).read_text())
    entries = raw.get('env', {}).get('production', {}).get('d1_databases', raw.get('d1_databases', []))
    result = {r['binding']: r for r in entries if BINDING.fullmatch(r['binding'])}
    if len(result) != len(entries) or not {'DB_META', 'DB_CURRENT'} <= result.keys():
        raise ValueError('Target config must contain only the complete application D1 binding set')
    ids = [r.get('database_id') for r in result.values()]
    if any(not x for x in ids) or len(set(ids)) != len(ids):
        raise ValueError('Every destination needs a distinct database_id')
    for database_id in ids:
        uuid.UUID(database_id)
    return result


def local_paths():
    raw = json.loads(CONFIG.read_text())
    entries = raw.get('env', {}).get('preview', {}).get('d1_databases', raw['d1_databases'])
    key = hashlib.sha256(b'miniflare-D1DatabaseObject').digest()
    result = {}
    for r in entries:
        if not BINDING.fullmatch(r['binding']):
            continue
        name = r.get('preview_database_id', r.get('database_id', r['binding']))
        a = hmac.new(key, name.encode(), 'sha256').digest()[:16]
        b = hmac.new(key, a, 'sha256').digest()[:16]
        result[r['binding']] = ROOT / '.local/d1/dev/v3/d1/miniflare-D1DatabaseObject' / ((a+b).hex()+'.sqlite')
    return result


def connect(path, mode='ro'):
    return sqlite3.connect(Path(path).resolve().as_uri() + '?mode=' + mode, uri=True, timeout=0)


def table_names(db):
    return [r[0] for r in db.execute("SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name")]


def transient(name):
    return name in TRANSIENT or name.lower().startswith((
        'staging', 'ssaddressimport', 'zzaddressimport',
    ))


def blockers(db):
    rules = {
        'releases': ('uploading', 'staged', 'processing', 'failed'),
        'sourceReleases': ('uploading', 'staged', 'processing', 'failed'),
        'snapshots': ('draft',),
        'apiReleaseSets': ('draft',),
        'ingestRuns': ('queued', 'running'),
    }
    names = table_names(db)
    issues = []
    for table, statuses in rules.items():
        if table not in names:
            issues.append(f'Missing required metadata table {table}')
            continue
        for status, count in db.execute(f'SELECT status,count(*) FROM {ident(table)} GROUP BY status'):
            if status in statuses:
                issues.append(f'{table}: {count} {status}')
    return issues


def assert_integrity(db):
    result = db.execute('PRAGMA integrity_check').fetchall()
    if result != [('ok',)]:
        raise ValueError(f'SQLite integrity check failed: {result[:10]}')
    violations = db.execute('PRAGMA foreign_key_check').fetchmany(10)
    if violations:
        raise ValueError(f'Foreign key violations: {violations}')


def assert_current_publications(db):
    names = table_names(db)
    for table in names:
        if table.endswith('PublicationState'):
            if db.execute(f"SELECT 1 FROM {ident(table)} WHERE status <> 'current' LIMIT 1").fetchone():
                raise ValueError(f'Incomplete current publication: {table}')
    if 'address2d' not in names:
        return
    if 'addressPublicationState' not in names:
        raise ValueError('Missing Address publication state')
    if db.execute('''SELECT 1 FROM address2d a LEFT JOIN addressPublicationState p ON p.scopeId=a.snapshotId
        WHERE p.snapshotId IS NULL OR p.preparedAt IS NULL LIMIT 1''').fetchone():
        raise ValueError('Address current rows do not belong to a completed publication')
    if db.execute('''SELECT 1 FROM address2d a WHERE NOT EXISTS
        (SELECT 1 FROM address2dI18n i WHERE i.snapshotId=a.snapshotId AND i.addressId=a.id
         AND trim(coalesce(i.formattedAddress,'') || coalesce(i.buildingName,'') || coalesce(i.estateName,'') || coalesce(i.streetName,'')) <> '') LIMIT 1''').fetchone():
        raise ValueError('Empty Address current row')


def retain_address_membership(output, paths):
    """Keep acknowledged local evidence with the exact database set it describes."""
    root = paths['DB_META'].parent / 'address-membership'
    result = []
    if not root.exists():
        return result
    for source in sorted(root.glob('*/*.json')):
        relative = Path('address-membership') / source.relative_to(root)
        destination = output / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, destination)
        result.append({'file': str(relative), 'sha256': digest(destination)})
    return result


def remap_meta(db, destinations):
    rows = db.execute('SELECT id,bindingName FROM dataShards').fetchall()
    if {r[1] for r in rows} != destinations.keys():
        raise ValueError('dataShards bindings must exactly match the complete destination set')
    for row_id, binding in rows:
        target = destinations[binding]
        # Keep internal IDs: release/snapshot assignments refer to these IDs.
        version = hashlib.sha256(json.dumps(target, sort_keys=True).encode()).hexdigest()
        db.execute('UPDATE dataShards SET environment=?,databaseName=?,databaseId=?,versionHash=? WHERE id=?',
                   ('production', target['database_name'], target['database_id'], version, row_id))
    db.commit()


def emit_dump(db, path):
    schema = db.execute("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE sql IS NOT NULL ORDER BY name").fetchall()
    # FTS shadow storage is an implementation detail. Rebuild the index from its
    # logical documents once; copying both documents and shadow rows corrupts it.
    shadows = {row[1] for row in db.execute('PRAGMA table_list') if row[2] == 'shadow'}
    tables = [(name, sql) for kind, name, _, sql in schema
              if kind == 'table' and name not in shadows and not name.startswith(('sqlite_', '_cf_')) and not transient(name)]
    kept = {name for name, _ in tables}
    for name, sql in tables:
        if 'VIRTUAL TABLE' in sql.upper():
            if not re.search(r'\bUSING\s+fts5\s*\(', sql, re.I) or re.search(r'\bcontent\s*=', sql, re.I):
                raise ValueError(f'Virtual table needs an explicit D1 export strategy: {name}')
    counts = {}
    object_keys = set()
    with path.open('x') as output:
        def emit(sql):
            sql = sql.rstrip().rstrip(';') + ';\n'
            if len(sql.encode()) > LIMIT:
                raise ValueError(f'SQL statement exceeds {LIMIT} bytes: {sql[:100]}')
            output.write(sql)
        emit('PRAGMA defer_foreign_keys=ON')
        # This guard executes inside the import itself, not just a separate preflight.
        emit('CREATE TABLE __ss_bootstrap_guard (n INTEGER CHECK(n=0))')
        emit("INSERT INTO __ss_bootstrap_guard SELECT count(*) FROM sqlite_schema WHERE type='table' AND name NOT GLOB 'sqlite_*' AND name NOT GLOB '_cf_*' AND name <> '__ss_bootstrap_guard'")
        emit('DROP TABLE __ss_bootstrap_guard')
        for _, sql in tables:
            emit(sql)
        # FK parent keys may depend on separately declared UNIQUE indexes.
        for kind, _, table, sql in schema:
            if kind == 'index' and table in kept:
                emit(sql)
        emit('CREATE TABLE __ss_bootstrap_payload (id INTEGER PRIMARY KEY, value BLOB)')
        for name, sql in tables:
            columns = [r[1] for r in db.execute(f'PRAGMA table_xinfo({ident(name)})') if r[6] == 0]
            aliases = [a for a in ('rowid', '_rowid_', 'oid') if a not in {c.lower() for c in columns}]
            if 'WITHOUT ROWID' not in sql.upper():
                if not aliases:
                    raise ValueError(f'Cannot preserve hidden rowid for {name}')
                columns = [aliases[0]] + columns
            fields = ','.join(map(ident, columns))
            counts[name] = 0
            for row in db.execute(f'SELECT {fields} FROM {ident(name)}'):
                # Include a conservative allowance for SQLite record headers.
                row_bytes = sum(len(v.encode()) if isinstance(v, str) else len(v) if isinstance(v, bytes) else 8 for v in row) + 16 * len(row)
                if row_bytes > MAX_D1_ROW_BYTES:
                    raise ValueError(f'D1 row size exceeds {MAX_D1_ROW_BYTES} bytes: {name}')
                values = [literal(v) for v in row]
                prefix = f'INSERT INTO {ident(name)} ({fields}) VALUES ('
                statement = prefix + ','.join(values) + ')'
                if len(statement.encode()) > LIMIT:
                    # Assemble unusually large payloads before inserting the final row.
                    for i, value in enumerate(row):
                        if not isinstance(value, (str, bytes)) or len(values[i]) < 1024:
                            continue
                        data = value.encode() if isinstance(value, str) else value
                        emit(f'INSERT INTO __ss_bootstrap_payload VALUES ({i},X\'\')')
                        for start in range(0, len(data), 30_000):
                            emit(f'UPDATE __ss_bootstrap_payload SET value=CAST(value || {literal(data[start:start+30_000])} AS BLOB) WHERE id={i}')
                        expr = f'(SELECT value FROM __ss_bootstrap_payload WHERE id={i})'
                        values[i] = f'CAST({expr} AS TEXT)' if isinstance(value, str) else expr
                    statement = prefix + ','.join(values) + ')'
                    emit(statement)
                    emit('DELETE FROM __ss_bootstrap_payload')
                else:
                    emit(statement)
                counts[name] += 1
                for column, value in zip(columns, row):
                    if column == 'rawObjectKey' and value:
                        object_keys.add(value)
        emit('DROP TABLE __ss_bootstrap_payload')
        # Preserve the high-water mark even if the largest AUTOINCREMENT row was deleted.
        if 'sqlite_sequence' in table_names(db):
            emit('DELETE FROM sqlite_sequence')
            for name, seq in db.execute('SELECT name,seq FROM sqlite_sequence'):
                if name in kept:
                    emit(f'INSERT INTO sqlite_sequence VALUES ({literal(name)},{seq})')
        for kind, _, table, sql in schema:
            if kind in ('trigger', 'view') and (table in kept or kind == 'view'):
                emit(sql)
        # Do not turn deferral off: the transaction commit must enforce all constraints.
    if path.stat().st_size > MAX_D1_IMPORT_BYTES:
        raise ValueError(f'D1 import file exceeds {MAX_D1_IMPORT_BYTES} bytes: {path.name}')
    return counts, sorted(object_keys)


def statements(path):
    pending = ''
    with path.open() as file:
        for line in file:
            pending += line
            if sqlite3.complete_statement(pending):
                yield pending
                pending = ''
    if pending.strip():
        raise ValueError('Truncated SQL file')


def restore_check(path, expected):
    with tempfile.TemporaryDirectory(prefix='ss-bootstrap-verify-') as directory:
        with contextlib.closing(sqlite3.connect(Path(directory) / 'restore.sqlite')) as db:
            db.execute('PRAGMA foreign_keys=ON')
            db.execute('BEGIN')
            for sql in statements(path):
                db.execute(sql)
            db.commit()
            assert_integrity(db)
            actual = {name: db.execute(f'SELECT count(*) FROM {ident(name)}').fetchone()[0] for name in expected}
            if actual != expected:
                raise ValueError('Restore table counts differ from source')


def verify(bundle, restore=True):
    manifest = json.loads((bundle / 'manifest.json').read_text())
    if manifest.get('format') != 1:
        raise ValueError('Unsupported bootstrap manifest')
    expected = {item['binding']: item['target'] for item in manifest['databases']}
    if targets(bundle / 'wrangler.json') != expected:
        raise ValueError('Destination config differs from sealed manifest')
    for item in manifest['databases']:
        path = bundle / item['file']
        if path.parent.resolve() != bundle.resolve() or digest(path) != item['sha256']:
            raise ValueError(f'Checksum/path mismatch: {item["binding"]}')
        if restore:
            print(f'Verifying {item["binding"]}', flush=True, file=sys.stderr)
            restore_check(path, item['tables'])
        if item.get('mirrorFile'):
            mirror = bundle / item['mirrorFile']
            if mirror.parent.resolve() != bundle.resolve() or digest(mirror) != item['mirrorSha256']:
                raise ValueError(f'Mirror checksum/path mismatch: {item["binding"]}')
    for item in manifest.get('mirrorArtefacts', []):
        path = bundle / item['file']
        if not path.resolve().is_relative_to(bundle.resolve()) or digest(path) != item['sha256']:
            raise ValueError('Mirror membership checksum/path mismatch')
    return manifest


def prepare(output, config):
    destinations = targets(config)
    paths = local_paths()
    if paths.keys() != destinations.keys():
        raise ValueError('Local and destination binding sets differ')
    # Hold write reservations across all databases, including backup. Other writers
    # fail fast; operators must stop ingestion/Workers before running preparation.
    with contextlib.ExitStack() as stack:
        locks = []
        for binding, path in sorted(paths.items()):
            db = stack.enter_context(contextlib.closing(connect(path, 'rw')))
            db.execute('BEGIN IMMEDIATE')
            locks.append(db)
        with contextlib.closing(connect(paths['DB_META'])) as meta:
            issues = blockers(meta)
        if (paths['DB_META'].parent / 'pending-sql-delivery.json').exists():
            issues.append('Unfinished SQL delivery still owns the local mirror')
        if issues:
            raise ValueError('Local database set is not ready:\n' + '\n'.join(issues))
        output.mkdir(parents=True, exist_ok=False)
        manifest = {'format': 1, 'environment': 'production', 'databases': [],
                    'publicationReady': False,
                    'remaining': ['Verify R2 artefacts and cross-shard API results before switching Worker bindings.']}
        for binding in sorted(paths, key=lambda b: (b == 'DB_META', b == 'DB_CURRENT', b)):
            print(f'Preparing {binding}', flush=True)
            snapshot = output / (binding + '.sqlite')
            with contextlib.closing(connect(paths[binding])) as source, contextlib.closing(sqlite3.connect(snapshot)) as db:
                source.backup(db)
                assert_integrity(db)
                if binding == 'DB_CURRENT':
                    assert_current_publications(db)
                if db.execute('PRAGMA page_count').fetchone()[0] * db.execute('PRAGMA page_size').fetchone()[0] > MAX_D1_DATABASE_BYTES:
                    raise ValueError(f'D1 database exceeds {MAX_D1_DATABASE_BYTES} bytes: {binding}')
                for table in table_names(db):
                    if transient(table) and db.execute(f'SELECT 1 FROM {ident(table)} LIMIT 1').fetchone():
                        if table not in TRANSIENT:
                            raise ValueError(f'Nonempty staging table {binding}.{table}')
                if binding == 'DB_META':
                    remap_meta(db, destinations)
                    assert_integrity(db)
                sql = output / (binding + '.sql')
                counts, keys = emit_dump(db, sql)
                restore_check(sql, counts)
                manifest['databases'].append({'binding': binding, 'target': destinations[binding],
                    'file': sql.name, 'sha256': digest(sql), 'bytes': sql.stat().st_size,
                    'tables': counts, 'rawObjectKeys': keys})
                # Mirror the imported persistent schema, without native delivery receipts.
                for name in table_names(db):
                    if transient(name):
                        db.execute(f'DROP TABLE {ident(name)}')
                db.commit()
            manifest['databases'][-1].update({'mirrorFile': snapshot.name, 'mirrorSha256': digest(snapshot)})
        manifest['mirrorArtefacts'] = retain_address_membership(output, paths)
        write_json(output / 'manifest.json', manifest)
        # Standalone config pins IDs and avoids accidentally using changed live bindings.
        write_json(output / 'wrangler.json', {'name': 'ss-bootstrap', 'd1_databases': list(destinations.values())})
        print(f'Sealed D1 bundle: {output}. Production publication still needs artefact and API checks.')


def seed_mirror(bundle, cache_dir):
    manifest = verify(bundle, restore=False)
    expected = {item['binding']: item['target'] for item in manifest['databases']}
    configured = targets(CONFIG)
    if {key: row['database_id'] for key, row in configured.items()} != {key: row['database_id'] for key, row in expected.items()}:
        raise ValueError('Configure the verified bootstrap destination bindings before seeding their mirror')
    verified = json.loads((bundle / 'verified-imports.json').read_text())
    if any(verified.get(item['binding']) != item['sha256'] for item in manifest['databases']):
        raise ValueError('Every imported shard must pass its sealed verification before seeding the mirror')
    if cache_dir.exists():
        raise ValueError('Mirror destination already exists; no replacement is allowed')
    staging = cache_dir.with_name(cache_dir.name + '.bootstrap-' + uuid.uuid4().hex)
    staging.mkdir(parents=True)
    try:
        files = {}
        for item in manifest['databases']:
            if not item.get('mirrorFile'):
                raise ValueError('The bundle has no retained mirror; prepare a complete bundle')
            filename = item['binding'] + '.sqlite'
            shutil.copyfile(bundle / item['mirrorFile'], staging / filename)
            files[item['binding']] = str(cache_dir / filename)
        for item in manifest.get('mirrorArtefacts', []):
            destination = staging / item['file']
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(bundle / item['file'], destination)
        config = (ROOT / 'apps/harbour-cli/src/lib/dbCache/localDbCacheConfig.ts').read_text()
        version = int(re.search(r'DB_CACHE_MANIFEST_VERSION = (\d+)', config).group(1))
        write_json(staging / 'manifest.json', {'cacheVersion': version, 'target': 'production',
            'preparedAt': datetime.now(timezone.utc).isoformat(), 'files': files})
        staging.rename(cache_dir)
    finally:
        if staging.exists():
            shutil.rmtree(staging)
    print(f'Seeded complete production mirror: {cache_dir}')


def commands(bundle):
    manifest = verify(bundle, restore=False)
    expected = {item['binding']: item['target'] for item in manifest['databases']}
    if targets(bundle / 'wrangler.json') != expected:
        raise ValueError('Destination config differs from sealed manifest')
    print('\n# Fish commands. Keep destination Workers and ingestion stopped throughout import.')
    print('# Every SQL file refuses a target containing application tables; no overwrite option.')
    script = str(Path(__file__).resolve())
    print(' '.join(map(shlex.quote, ['python3', script, 'check-bundle', '--output', str(bundle)])) + '; or exit 1')
    # Check ALL destinations before the first upload, as well as each in-file guard.
    for item in manifest['databases']:
        args = ['bunx', 'wrangler', 'd1', 'execute', item['binding'], '--remote', '--config', str(bundle / 'wrangler.json'), '--command', "SELECT count(*) AS existing FROM sqlite_schema WHERE type='table' AND name NOT GLOB 'sqlite_*' AND name NOT GLOB '_cf_*'", '--json']
        check = ['python3', script, 'check-empty']
        print(' '.join(map(shlex.quote, args)) + ' | ' + ' '.join(map(shlex.quote, check)) + '; or exit 1')
    for item in manifest['databases']:
        args = ['bunx', 'wrangler', 'd1', 'execute', item['binding'], '--remote', '--config', str(bundle / 'wrangler.json'), '--file', str(bundle / item['file']), '--yes']
        print(' '.join(map(shlex.quote, args)) + '; or exit 1')
        counts = ' UNION ALL '.join(f'SELECT {literal(name)} AS table_name, count(*) AS rows FROM {ident(name)}' for name in item['tables'])
        args = ['bunx', 'wrangler', 'd1', 'execute', item['binding'], '--remote', '--config', str(bundle / 'wrangler.json'), '--command', counts + '; PRAGMA foreign_key_check; PRAGMA quick_check;', '--json']
        check = ['python3', script, 'check-import', '--output', str(bundle), '--binding', item['binding']]
        print(' '.join(map(shlex.quote, args)) + ' | ' + ' '.join(map(shlex.quote, check)) + '; or exit 1')
    print('# Inspect each verification result: zero FK violations and quick_check=ok.')
    print('# Do not switch live bindings until R2 and cross-shard API checks pass.')



def plan(output, label):
    if not label or not re.fullmatch(r'[a-z0-9-]{1,24}', label):
        raise ValueError('--label must be 1-24 lowercase letters, digits or hyphens')
    output.mkdir(parents=True, exist_ok=False)
    entries = []
    commands = ['# Run in fish. Copy each returned database_id into targets.json.']
    for binding, item in targets(CONFIG).items():
        name = item['database_name'].removesuffix('-prod') + '-bootstrap-' + label
        entries.append({'binding': binding, 'database_name': name, 'database_id': None})
        commands.append(' '.join(map(shlex.quote, ['bunx', 'wrangler', 'd1', 'create', name, '--location', 'apac', '--config', str(CONFIG), '--update-config=false'])) + '; or exit 1')
    write_json(output / 'targets.json', {'name': 'ss-bootstrap', 'd1_databases': entries})
    (output / 'create.fish').write_text('\n'.join(commands) + '\n')
    print(f'Prepared {len(entries)} creation commands and target mappings in {output}')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['plan', 'status', 'prepare', 'verify', 'commands', 'check-bundle', 'check-empty', 'check-import', 'seed-mirror'])
    parser.add_argument('--output', type=Path)
    parser.add_argument('--binding')
    parser.add_argument('--label')
    parser.add_argument('--target-config', type=Path, default=CONFIG)
    parser.add_argument('--cache-dir', type=Path, default=ROOT / '.local/harbour-sql/db-cache/production')
    parser.add_argument('--writers-stopped', action='store_true', help='Confirm ingestion and local Workers are stopped before locking all shards')
    args = parser.parse_args()
    if args.command == 'check-empty':
        results = json.load(sys.stdin)
        if not isinstance(results, list) or len(results) != 1 or results[0].get('success') is not True or results[0].get('results') != [{'existing': 0}]:
            raise ValueError('Destination is populated or empty-target check failed')
        return 0
    if args.command == 'status':
        paths = local_paths()
        print(json.dumps({k: {'path': str(v), 'exists': v.exists()} for k, v in paths.items()}, indent=2))
        with contextlib.closing(connect(paths['DB_META'])) as db:
            issues = blockers(db)
        print('\n'.join(issues) if issues else 'No incomplete metadata states found. Full preparation still validates each shard.')
        return 1 if issues else 0
    if not args.output:
        parser.error('--output is required')
    bundle = args.output.resolve()
    if args.command == 'plan':
        plan(bundle, args.label)
        return 0
    if args.command == 'check-import':
        manifest = json.loads((bundle / 'manifest.json').read_text())
        expected = next(item['tables'] for item in manifest['databases'] if item['binding'] == args.binding)
        results = json.load(sys.stdin)
        if not isinstance(results, list) or len(results) != 3 or not all(r.get('success') is True for r in results):
            raise ValueError('Remote validation query failed')
        if {r['table_name']: r['rows'] for r in results[0]['results']} != expected or results[1]['results'] or results[2]['results'] != [{'quick_check': 'ok'}]:
            raise ValueError('Remote row counts, foreign keys or integrity failed validation')
        print(f'{args.binding}: row counts, foreign keys and quick_check passed')
        checkpoint = bundle / 'verified-imports.json'
        verified = json.loads(checkpoint.read_text()) if checkpoint.exists() else {}
        verified[args.binding] = next(item['sha256'] for item in manifest['databases'] if item['binding'] == args.binding)
        write_json(checkpoint, verified)
        return 0
    if args.command == 'prepare':
        if not args.writers_stopped:
            parser.error('Stop local ingestion and Workers, then pass --writers-stopped')
        prepare(bundle, args.target_config)
    elif args.command == 'seed-mirror':
        seed_mirror(bundle, args.cache_dir.resolve())
    elif args.command in ('verify', 'check-bundle'):
        verify(bundle, restore=args.command == 'verify')
    else:
        commands(bundle)
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (ValueError, sqlite3.Error, OSError, KeyError, TypeError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
