import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { readDistrictCoverageAreas } from './districtCoverage'

test('all Stats maps select ready SaanSeoi district land polygons and exclude government, territorial and non-district geometry', async () => {
  const sqlite = new Database(':memory:')
  const db = drizzle({ client: sqlite }) as never
  try {
    sqlite.exec(`
      CREATE TABLE snapshots(
      id,
      snapshotLineageId TEXT NOT NULL,
      status,
      publishedAt,
      createdAt
    );
      CREATE TABLE snapshotLineages (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE,
      regionCode TEXT NOT NULL DEFAULT 'hk',
      resourceType TEXT,
      variant TEXT NOT NULL DEFAULT 'default',
      identityMode TEXT NOT NULL DEFAULT 'persistent',
      primaryDatasetId TEXT,
      versionHash TEXT NOT NULL DEFAULT 'fixture',
      createdAt TEXT NOT NULL DEFAULT '2026-01-01T00:00:00.000Z',
      updatedAt TEXT NOT NULL DEFAULT '2026-01-01T00:00:00.000Z'
    );
      CREATE TABLE divisionAreas(id TEXT PRIMARY KEY, divisionId, geometry, updatedAt, variant, scopeId, isLand, isTerritorial);
      CREATE TABLE divisions(id, class, scopeId);
      CREATE TABLE divisionPublicationState(scopeId, snapshotId, status, preparedAt, publicationToken);
      CREATE TABLE divisionAreaPublicationState(scopeId, snapshotId, status, preparedAt, publicationToken);
      INSERT INTO snapshotLineages (id,resourceType,variant,regionCode) VALUES
        ('simple','divisionArea','saanseoi','hk'),
        ('full','divisionArea','hkgov-censtatd-landclipped:simplified','hk'),
        ('district-lineage','division','saanseoi','hk');
      INSERT INTO snapshots (id, snapshotLineageId, status, publishedAt, createdAt) VALUES
('old', 'simple', 'published', '2016', '2016'),
('selected', 'simple', 'published', '2021', '2021'),
('full', 'full', 'published', '2026', '2026'),
('districts', 'district-lineage', 'published', '2021', '2021');
      INSERT INTO divisionAreas VALUES ('district-land','district','{"type":"Polygon","coordinates":[]}', '2021','saanseoi','stable-scope',1,0), ('district-territorial','district','null','2021','saanseoi','stable-scope',1,1), ('village-land','village','null','2021','saanseoi','stable-scope',1,0);
      INSERT INTO divisions VALUES ('district','district','district-scope'), ('village','village','district-scope');
      INSERT INTO divisionPublicationState VALUES ('district-scope','districts','current','ready','token');
      INSERT INTO divisionAreaPublicationState VALUES ('stable-scope','selected','current','ready','token');
    `)
    expect(
      (await readDistrictCoverageAreas(db, db)).map(row => row.divisionId),
    ).toEqual(['district'])
    sqlite.exec("UPDATE divisionAreaPublicationState SET status='publishing'")
    expect(await readDistrictCoverageAreas(db, db)).toEqual([])
    sqlite.exec(
      "UPDATE divisionAreaPublicationState SET status='current', snapshotId='other'",
    )
    expect(await readDistrictCoverageAreas(db, db)).toEqual([])
  } finally {
    sqlite.close()
  }
})
