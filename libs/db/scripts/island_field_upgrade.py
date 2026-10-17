"""Rename canonical island provenance paths alongside generated schema migrations.

Publisher `property` paths and retained content-version identities are evidence and
remain unchanged. Only canonical `sources[].properties` entries are renamed.
"""
import json

MIGRATIONS = {
    '20261017052134_omniscient_may_parker/migration.sql',
    '20261017052150_nasty_reptil/migration.sql',
}


def upgrade(db):
    changed = 0
    for table in ('places', 'address2d'):
        rows = db.execute(f'SELECT rowid, sources FROM "{table}" WHERE sources LIKE ?',
                          ('%landformId%',))
        for rowid, encoded in rows:
            sources = json.loads(encoded)
            if not isinstance(sources, list):
                continue
            modified = False
            for source in sources:
                if not isinstance(source, dict) or not isinstance(source.get('properties'), list):
                    continue
                properties = source['properties']
                if 'landformId' in properties:
                    source['properties'] = ['islandId' if value == 'landformId' else value
                                            for value in properties]
                    modified = True
            if modified:
                db.execute(f'UPDATE "{table}" SET sources=? WHERE rowid=?',
                           (json.dumps(sources, ensure_ascii=False, separators=(',', ':')), rowid))
                changed += 1
    return changed
