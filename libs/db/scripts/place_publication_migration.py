"""Require a rebuild when publication dependency migrations encounter populated data."""

PUBLICATION_DEPENDENCIES = {'20261017055022_sturdy_chimera/migration.sql', '20261017055029_cool_wallflower/migration.sql'}
MIGRATIONS = PUBLICATION_DEPENDENCIES


def upgrade(db, name, sql, split_statements, metadata=None, history_databases=()):
    existing = {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    dependent_tables = ('places', 'placePublicationState', 'addressPublicationState', 'address2d')
    if any(db.execute(f'SELECT 1 FROM "{table}" LIMIT 1').fetchone()
           for table in dependent_tables if table in existing):
        raise ValueError('Populated Place and Address data requires a reset and reinitialisation. Schema migration was not applied.')
    for statement in split_statements(sql):
        db.execute(statement)
