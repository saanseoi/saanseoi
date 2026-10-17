"""Convert retained Places data alongside the generated local schema migrations.

The generated DDL owns the destination schema; these hooks supply data that
Drizzle cannot derive, under the runner's backup and atomic transaction.
"""
import hashlib
from contextlib import closing
import json
import math
from pathlib import Path
import re
import sqlite3

CURRENT_SPATIAL = '20261014183554_clean_morbius/migration.sql'
HISTORY_SPATIAL = '20261014182916_flippant_young_avengers/migration.sql'
CURRENT_DIVISIONS = '20261015030749_thankful_rocket_racer/migration.sql'
PUBLICATION_DEPENDENCIES = {'20261017055022_sturdy_chimera/migration.sql', '20261017055029_cool_wallflower/migration.sql'}
MIGRATIONS = {CURRENT_SPATIAL, HISTORY_SPATIAL, CURRENT_DIVISIONS, *PUBLICATION_DEPENDENCIES}

FIELDS = dict(country='countryId', area='areaId', district='districtId',
              town='townId', rural_area='ruralAreaId', macrohood='macrohoodId',
              neighbourhood='neighbourhoodId', village='villageId',
              microhood='microhoodId', hamlet='hamletId', major_island='landformId',
              minor_island='landformId', islet='landformId')


def quote(name):
    return '"' + name.replace('"', '""') + '"'


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False)


def point(lng, lat):
    if (not all(type(n) in (int, float) and math.isfinite(n) for n in (lng, lat))
            or abs(lng) > 180 or abs(lat) > 90):
        raise ValueError('Invalid retained Place coordinates; migration rolled back.')
    return json.dumps(dict(type='Point', coordinates=[lng, lat]), separators=(',', ':'))


def bbox(value):
    if value is None:
        return None
    value = json.loads(value)
    if isinstance(value, dict):
        value = [value.get(k) for k in ('xmin', 'ymin', 'xmax', 'ymax')]
    if (not isinstance(value, list) or len(value) != 4
            or not all(type(n) in (int, float) and math.isfinite(n) for n in value)
            or value[0] > value[2] or value[1] > value[3]
            or any(abs(value[i]) > (180 if i % 2 == 0 else 90) for i in range(4))):
        raise ValueError('Invalid retained Place bbox; migration rolled back.')
    return canonical(value)


def identifiers(value):
    return canonical({'wikidata': {'brandId': value}}) if value else None


def rebuild_with_geometry(db, split_statements):
    """Add the generated NOT NULL column while filling it in the same copy."""
    declaration = db.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='places'").fetchone()[0]
    objects = db.execute("SELECT sql FROM sqlite_master WHERE tbl_name='places' AND type IN ('index','trigger') AND sql IS NOT NULL").fetchall()
    # Do not rename the original: SQLite would rewrite children's foreign keys.
    declaration = re.sub(r'CREATE TABLE\s+(?:`places`|"places"|\[places\]|places)',
                         'CREATE TABLE __place_geometry_upgrade', declaration, count=1, flags=re.I)
    start = declaration.index('(')
    declaration = declaration[:start + 1] + 'geometry text NOT NULL,' + declaration[start + 1:]
    db.execute(declaration)
    columns = [r[1] for r in db.execute('PRAGMA table_info(places)')]
    names = ','.join(map(quote, columns))
    db.execute(f'INSERT INTO __place_geometry_upgrade ({names},geometry) '
               f'SELECT {names},upgrade_place_point(lng,lat) FROM places')
    db.execute('DROP TABLE places')
    db.execute('ALTER TABLE __place_geometry_upgrade RENAME TO places')
    for (sql,) in objects:
        for statement in split_statements(sql):
            db.execute(statement)


def seed_division_definitions(db):
    conflict = db.execute('''SELECT divisionSnapshotId,divisionId FROM placesDivision
        GROUP BY divisionSnapshotId,divisionId HAVING count(DISTINCT definition)>1 LIMIT 1''').fetchone()
    if conflict:
        raise ValueError(f'Conflicting retained Place Division definitions: {conflict}')
    db.execute('''INSERT INTO placeDivisionDefinitions
        SELECT DISTINCT divisionSnapshotId,divisionId,definition FROM placesDivision''')


def retained_divisions(db, metadata, history_databases):
    snapshots = [r[0] for r in db.execute('SELECT DISTINCT divisionSnapshotId FROM placesDivision')]
    if not snapshots:
        return {}
    if not metadata or not history_databases:
        raise ValueError('Place Division conversion requires local META and HISTORY paths for exact revision classes.')
    with closing(sqlite3.connect(Path(metadata).resolve().as_uri() + '?mode=ro', uri=True)) as meta:
        parents = dict(meta.execute('SELECT id,parentSnapshotId FROM snapshots'))
    plans = {}
    for snapshot in snapshots:
        chain, cursor = [], snapshot
        while cursor is not None:
            if cursor not in parents or cursor in chain:
                raise ValueError(f'Missing or cyclic Division snapshot ancestry: {cursor}')
            chain.append(cursor)
            cursor = parents[cursor]
        plans[snapshot] = list(reversed(chain))
    selected = canonical(sorted({s for chain in plans.values() for s in chain}))
    events = {}
    for path in history_databases:
        with closing(sqlite3.connect(Path(path).resolve().as_uri() + '?mode=ro', uri=True)) as history:
            for snapshot, identity, kind, hierarchies, operation in history.execute('''
                SELECT snapshotId,id,class,hierarchies,operation FROM divisions
                WHERE snapshotId IN (SELECT value FROM json_each(?))''', (selected,)):
                key = snapshot, identity
                value = kind, hierarchies, operation
                if key in events and events[key] != value:
                    raise ValueError(f'Conflicting Division history at {key}')
                events[key] = value
    by_snapshot = {}
    for (snapshot, identity), event in events.items():
        by_snapshot.setdefault(snapshot, []).append((identity, *event))
    classes = {}
    for target, chain in plans.items():
        state = {}
        for snapshot in chain:
            for identity, kind, hierarchies, operation in by_snapshot.get(snapshot, []):
                if operation == 'delete':
                    state.pop(identity, None)
                else:
                    state[identity] = kind, json.loads(hierarchies or '{}').get('full', [])
        classes.update({(target, identity): kind for identity, kind in state.items()})
    return classes


def division_sets(db, metadata, history_databases):
    """Map retained memberships only; never infer a new geographic association."""
    # A Division ID can change class across releases. Replay immutable ancestry
    # rather than classifying retained links against today's serving rows.
    divisions = retained_divisions(db, metadata, history_databases)
    # Each old link retains its exact snapshot pointer and localised definition.
    rows = db.execute('''SELECT l.placeScopeId,l.placeId,l.divisionId,l.divisionSnapshotId,d.definition
        FROM placesDivision l JOIN placeDivisionDefinitions d
        ON d.divisionSnapshotId=l.divisionSnapshotId AND d.divisionId=l.divisionId
        ORDER BY l.placeScopeId,l.placeId,l.divisionId''')
    db.execute('CREATE TEMP TABLE upgraded_place_divisions(scopeId,placeId,id,definition,scalars,PRIMARY KEY(scopeId,placeId))')
    previous, group = None, []

    def finish(key, links):
        if key is None:
            return
        candidates = {}
        definitions = {}
        for identity, snapshot, raw in links:
            if (snapshot, identity) not in divisions:
                raise ValueError(f'Missing retained Division class: {identity}; reingestion required.')
            field = FIELDS.get(divisions[snapshot, identity][0])
            if not field:
                continue
            candidates.setdefault(field, []).append(identity)
            value = json.loads(raw)
            definitions[identity] = dict(divisionSnapshotId=snapshot, level=value['level'],
                                        locales=sorted(value['locales'], key=lambda v: v['locale']))
        # Match the resolver's most-specific island rule using every canonical
        # ancestry path, without choosing an arbitrary candidate on an overlap.
        islands = candidates.get('landformId', [])
        snapshots = {identity: snapshot for identity, snapshot, _ in links}
        for identity in list(islands):
            if any(other != identity and divisions[snapshots[other], other][1]
                   and all(any(entry['id'] == identity for entry in path)
                           for path in divisions[snapshots[other], other][1])
                   for other in islands):
                islands.remove(identity)
        scalars = {field: ids[0] for field, ids in candidates.items() if len(ids) == 1}
        selected = {identity: definitions[identity] for identity in scalars.values()}
        definition = canonical(selected)
        identity = hashlib.sha256(definition.encode()).hexdigest()
        db.execute('INSERT INTO upgraded_place_divisions VALUES (?,?,?,?,?)',
                   (*key, identity, definition, canonical(scalars)))

    for scope, place, identity, snapshot, definition in rows:
        key = scope, place
        if key != previous:
            finish(previous, group)
            previous, group = key, []
        group.append((identity, snapshot, definition))
    finish(previous, group)


def upgrade(db, name, sql, split_statements, metadata=None, history_databases=()):
    for function, count, callback in [('upgrade_place_point', 2, point),
                                       ('upgrade_place_bbox', 1, bbox),
                                       ('upgrade_place_identifiers', 1, identifiers)]:
        db.create_function(function, count, callback, deterministic=True)
    original_count = db.execute('SELECT count(*) FROM places').fetchone()[0]
    if name in PUBLICATION_DEPENDENCIES:
        existing = {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        dependent_tables = ('places', 'placePublicationState', 'addressPublicationState', 'address2d')
        if any(db.execute(f'SELECT 1 FROM "{table}" LIMIT 1').fetchone()
               for table in dependent_tables if table in existing):
            raise ValueError('Publication dependencies require a reviewed rebuild of populated Place and Address projections, receipts and history; schema migration was not applied.')
    if name == CURRENT_DIVISIONS:
        division_sets(db, metadata, history_databases)
    for statement in split_statements(sql):
        clean = re.sub(r'-->[^\n]*\n', '', statement).strip()
        if name == CURRENT_SPATIAL and clean.startswith('ALTER TABLE `places` ADD `geometry`'):
            rebuild_with_geometry(db, split_statements)
            continue
        if name == HISTORY_SPATIAL and clean.startswith('INSERT INTO `__new_places`'):
            # Drizzle's generated copy omits newly added columns.
            statement = statement.replace('`id`,', '`geometry`, `identifiers`, `id`,')
        if name == CURRENT_DIVISIONS and clean.startswith('INSERT INTO `__new_placeDivisionDefinitions`'):
            db.execute('''INSERT INTO __new_placeDivisionDefinitions(id,definition)
                SELECT DISTINCT id,definition FROM upgraded_place_divisions''')
            continue
        if name == CURRENT_DIVISIONS and clean.startswith('DROP TABLE `placesDivision`'):
            fields = sorted(set(FIELDS.values()))
            assignments = ','.join(f'{quote(field)}=json_extract(u.scalars,\'$.{field}\')' for field in fields)
            db.execute(f'''UPDATE places SET divisionDefinitionSetId=u.id,{assignments}
                FROM upgraded_place_divisions u WHERE places.scopeId=u.scopeId AND places.id=u.placeId''')
        db.execute(statement)
        if name == CURRENT_SPATIAL and clean.startswith('CREATE TABLE `placeDivisionDefinitions`'):
            seed_division_definitions(db)
        if name in (CURRENT_SPATIAL, HISTORY_SPATIAL) and clean.startswith('ALTER TABLE `places` ADD `identifiers`'):
            if name == HISTORY_SPATIAL:
                db.execute("UPDATE places SET geometry=upgrade_place_point(lng,lat) WHERE operation='upsert'")
            db.execute('UPDATE places SET bbox=upgrade_place_bbox(bbox),identifiers=upgrade_place_identifiers(wikidataId)')
    if db.execute('SELECT count(*) FROM places').fetchone()[0] != original_count:
        raise ValueError('Places migration changed the retained row count.')
    if name == CURRENT_DIVISIONS:
        db.execute('DROP TABLE upgraded_place_divisions')
