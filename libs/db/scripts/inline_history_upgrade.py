"""Data conversion for the generated inline-HISTORY schema transition.

DDL remains owned by Drizzle. This local upgrade replaces its data-copy statements:
old journals define snapshot events; retained statistic references define dictionary
ownership. Every payload and event must survive before the transaction can commit.
"""
import re
import sqlite3
from pathlib import Path

MIGRATION = '20261013063049_daffy_mordo/migration.sql'


def quote(name):
    return '"' + name.replace('"', '""') + '"'


def columns(db, table):
    return db.execute(f'PRAGMA table_info({quote(table)})').fetchall()


def upgrade(db, sql, split_statements, metadata=None):
    chunks = list(split_statements(sql))
    declarations = {}
    for chunk in chunks:
        match = re.search(r'CREATE TABLE `__new_(\w+)`', chunk)
        if match:
            declarations[match[1]] = chunk
    view = next(chunk for chunk in chunks if 'CREATE VIEW `historyEvents`' in chunk)
    types = dict((table, kind) for kind, table in re.findall(
        r"SELECT snapshotId, '(\w+)' AS recordType,.*?FROM \"(\w+)\"", view))
    if set(declarations) != set(types):
        raise ValueError('Inline HISTORY migration tables do not match its event view.')
    known = set(types.values())
    unknown = {r[0] for r in db.execute('SELECT DISTINCT recordType FROM snapshotVersionChanges')} - known
    if unknown:
        raise ValueError(f'Unknown retained HISTORY event types: {sorted(unknown)}')
    for declaration in declarations.values():
        db.execute(declaration)
    definitions = {}
    for table, kind in types.items():
        info = columns(db, '__new_' + table)
        keys = [r[1] for r in sorted(info, key=lambda r: r[5])
                if r[5] and r[1] not in ('snapshotId', 'locale')]
        locale = 'locale' if any(r[1] == 'locale' for r in info) else None
        record_id = ('r.' + quote(keys[0]) if len(keys) == 1 else
                     'json_array(' + ','.join('r.' + quote(k) for k in keys) + ')')
        join = f'e.recordId={record_id} AND e.versionHash=r.versionHash'
        if locale:
            join += ' AND e.locale=r.locale'
        definitions[table] = (kind, keys, locale, join)
        # An owner row is a reference to an immutable old payload, not a guess
        # based on isCurrent, timestamp order or a publisher release alone.
        db.execute(f'CREATE TEMP TABLE {quote("owners_" + table)} '
                   '(oldRowId INTEGER, snapshotId TEXT, PRIMARY KEY(oldRowId,snapshotId))')
        db.execute(f'INSERT INTO {quote("owners_" + table)} SELECT r.rowid,e.snapshotId '
                   f'FROM {quote(table)} r JOIN snapshotVersionChanges e ON {join} '
                   "WHERE e.recordType=? AND e.operation='upsert'", (kind,))
        expected = db.execute("SELECT count(*) FROM snapshotVersionChanges WHERE recordType=? AND operation='upsert'", (kind,)).fetchone()[0]
        found = db.execute(f'SELECT count(*) FROM {quote("owners_" + table)}').fetchone()[0]
        if expected != found:
            raise ValueError(f'{table}: {expected} upsert events but {found} local payload matches; cross-shard recovery required.')
        if any(r[1] == 'snapshotId' for r in columns(db, table)):
            db.execute(f'INSERT INTO {quote("owners_" + table)} SELECT r.rowid,r.snapshotId '
                       f'FROM {quote(table)} r WHERE NOT EXISTS '
                       f'(SELECT 1 FROM {quote("owners_" + table)} o WHERE o.oldRowId=r.rowid)')

    def copy_payloads(table):
        names = [r[1] for r in columns(db, '__new_' + table)]
        old = {r[1] for r in columns(db, table)}
        kind, _, _, join = definitions[table]
        values = []
        for name in names:
            if name == 'snapshotId':
                values.append('o.snapshotId')
            elif name == 'operation':
                values.append("'upsert'")
            elif name in ('sourceReleaseId', 'createdAt', 'updatedAt'):
                values.append(f'coalesce(e.{quote(name)},r.{quote(name)})')
            elif name in old:
                values.append('r.' + quote(name))
            else:
                raise ValueError(f'Cannot derive {table}.{name}')
        db.execute(f'INSERT INTO {quote("__new_" + table)} ({",".join(map(quote,names))}) '
                   f'SELECT {",".join(values)} FROM {quote(table)} r '
                   f'JOIN {quote("owners_" + table)} o ON o.oldRowId=r.rowid '
                   f'LEFT JOIN snapshotVersionChanges e ON {join} AND e.snapshotId=o.snapshotId '
                   "AND e.recordType=? AND e.operation='upsert'", (kind,))

    # Observations own exact field-definition sets, which own measure versions.
    copy_payloads('statsRecords')
    dictionary_queries = {
        'statsFields': '''SELECT DISTINCT f.rowid,r.snapshotId FROM statsFields f
            JOIN __new_statsRecords r ON r.datasetCode=f.datasetCode
            JOIN statsDefinitionSets d ON d.id=r.definitionSetId
            JOIN json_each(d.fieldDefinitionHashes) j ON j.key=f.fieldName AND j.value=f.versionHash''',
        'statsFieldsI18n': '''SELECT DISTINCT l.rowid,f.snapshotId FROM statsFieldsI18n l
            JOIN __new_statsFields f ON f.datasetCode=l.datasetCode AND f.fieldName=l.fieldName AND f.versionHash=l.versionHash''',
        'statsMeasures': '''SELECT DISTINCT m.rowid,f.snapshotId FROM statsMeasures m
            JOIN __new_statsFields f ON f.datasetCode=m.datasetCode AND f.measureCode=m.measureCode AND f.measureVersionHash=m.versionHash''',
        'statsMeasuresI18n': '''SELECT DISTINCT l.rowid,m.snapshotId FROM statsMeasuresI18n l
            JOIN __new_statsMeasures m ON m.datasetCode=l.datasetCode AND m.measureCode=l.measureCode AND m.versionHash=l.versionHash''',
    }
    for table, query in dictionary_queries.items():
        db.execute(f'INSERT OR IGNORE INTO {quote("owners_" + table)} {query}')
        copy_payloads(table)

    # District compatibility observations have an explicit resource-release and
    # reference-year association in META. Multiple candidates are never accepted.
    if db.execute('SELECT count(*) FROM divisionStatistics').fetchone()[0]:
        if metadata is None:
            raise ValueError('Populated divisionStatistics requires --metadata for verified snapshot ownership.')
        with sqlite3.connect(Path(metadata).resolve().as_uri() + '?mode=ro', uri=True) as meta:
            meta.execute('BEGIN')
            for rowid, release, year in db.execute('SELECT rowid,sourceReleaseId,referenceYear FROM divisionStatistics'):
                candidates = meta.execute('''SELECT DISTINCT s.id FROM snapshots s
                    JOIN snapshotLineages l ON l.id=s.snapshotLineageId
                    JOIN snapshotResourceReleases r ON r.snapshotId=s.id
                    WHERE r.resourceReleaseId=? AND s.cohortKey=? AND l.resourceType='divisionStatistic' ''',
                    (release, str(year))).fetchall()
                if len(candidates) != 1:
                    raise ValueError(f'Ambiguous district statistic owner: {release}/{year}: {candidates}')
                db.execute('INSERT OR IGNORE INTO owners_divisionStatistics VALUES (?,?)', (rowid, candidates[0][0]))
    copied = {'statsRecords', *dictionary_queries}
    for table in declarations:
        if table not in copied:
            copy_payloads(table)
        # No unreferenced content is silently discarded (including unsupported
        # statsValuesI18n content, whose ownership must be supplied by its journal).
        missing = db.execute(f'SELECT count(*) FROM {quote(table)} r WHERE NOT EXISTS '
                             f'(SELECT 1 FROM {quote("owners_" + table)} o WHERE o.oldRowId=r.rowid)').fetchone()[0]
        if missing:
            raise ValueError(f'{table}: {missing} payloads have no verified snapshot owner.')
        kind, keys, locale, _ = definitions[table]
        names = keys + ([locale] if locale else []) + ['snapshotId','operation','versionHash','sourceReleaseId','isCurrent','createdAt','updatedAt']
        identity = ['e.recordId'] if len(keys) == 1 else [f"json_extract(e.recordId,'$[{i}]')" for i in range(len(keys))]
        values = identity + (['e.locale'] if locale else []) + ['e.snapshotId',"'delete'",'NULL','e.sourceReleaseId','0','e.createdAt','e.updatedAt']
        db.execute(f'INSERT INTO {quote("__new_" + table)} ({",".join(map(quote,names))}) '
                   f'SELECT {",".join(values)} FROM snapshotVersionChanges e '
                   "WHERE e.recordType=? AND e.operation='delete'", (kind,))
        print(f'  {table}: {db.execute(f"SELECT count(*) FROM {quote(table)}").fetchone()[0]} payloads preserved in '
              f'{db.execute(f"SELECT count(*) FROM {quote("__new_" + table)}").fetchone()[0]} inline events', flush=True)
    for table in declarations:
        db.execute(f'DROP TABLE {quote(table)}')
        db.execute(f'ALTER TABLE {quote("__new_" + table)} RENAME TO {quote(table)}')
    for chunk in chunks:
        if re.search(r'CREATE (?:UNIQUE )?INDEX ', chunk):
            db.execute(chunk)
    db.execute(view)
    # Verify all original event identities, hashes and operations, including deletes
    # and repeated selections of an older payload in a later snapshot.
    fields = 'snapshotId,recordType,recordId,locale,versionHash,operation,sourceReleaseId'
    missing = db.execute(f'SELECT {fields} FROM snapshotVersionChanges EXCEPT SELECT {fields} FROM historyEvents LIMIT 1').fetchone()
    if missing:
        raise ValueError(f'Inline HISTORY conversion lost an event: {missing}')
    db.execute('DROP TABLE snapshotVersionChanges')
    for table in declarations:
        db.execute(f'DROP TABLE {quote("owners_" + table)}')
