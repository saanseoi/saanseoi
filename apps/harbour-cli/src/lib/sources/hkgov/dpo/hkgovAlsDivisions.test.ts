import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { currentSchema, metaSchema } from '@repo/db'
import { loadDivisionLookupMaps } from './hkgovAlsDivisions.ts'

test('ALS current Division lookup resolves a prepared scope and retains its latest logical revision', async () => {
  const current = new Database(':memory:')
  const meta = new Database(':memory:')
  try {
    meta.exec(`CREATE TABLE snapshots(
      id TEXT,
      snapshotLineageId TEXT NOT NULL,
      status TEXT,
      cohortKey TEXT,
      revision INTEGER
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

      INSERT INTO snapshotLineages (id,variant,regionCode) VALUES ('division-scope','overture','hk'),('area-scope','overture','hk');
INSERT OR IGNORE INTO snapshotLineages (id,code,resourceType,regionCode,variant,identityMode,versionHash,createdAt,updatedAt) VALUES ('division-scope','division-scope','division','hk','default','persistent','fixture','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z');
UPDATE snapshotLineages SET resourceType='division' WHERE id='division-scope' AND resourceType IS NULL;
INSERT OR IGNORE INTO snapshotLineages (id,code,resourceType,regionCode,variant,identityMode,versionHash,createdAt,updatedAt) VALUES ('area-scope','area-scope','divisionArea','hk','default','persistent','fixture','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z');
UPDATE snapshotLineages SET resourceType='divisionArea' WHERE id='area-scope' AND resourceType IS NULL;
INSERT INTO snapshots (id, snapshotLineageId, status, cohortKey, revision) VALUES
('revision-1', 'division-scope', 'published', '2026-09', 1),
('revision-2', 'division-scope', 'published', '2026-09', 2),
('area', 'area-scope', 'published', '2026-09', 1);`)
    current.exec(`CREATE TABLE divisionAreas(snapshotId TEXT, divisionId TEXT, geometry TEXT);
      CREATE TABLE divisionAreaPublicationState(scopeId TEXT,snapshotId TEXT,preparedAt TEXT,publicationToken TEXT);
      INSERT INTO divisionAreaPublicationState VALUES ('area-scope','area','ready','release');
      CREATE TABLE divisionPublicationState(scopeId TEXT,snapshotId TEXT,preparedAt TEXT,publicationToken TEXT);
      INSERT INTO divisionPublicationState VALUES ('division-scope','revision-2','ready','release-2');
      CREATE TABLE divisions(snapshotId TEXT,id TEXT,level INTEGER,category TEXT,class TEXT,hierarchies TEXT);
      CREATE TABLE divisionsI18n(snapshotId TEXT,divisionId TEXT,locale TEXT,name TEXT);
      INSERT INTO divisions VALUES ('division-scope','hk',0,'land','country',NULL),('division-scope','central',2,'land','district',NULL);
      INSERT INTO divisionsI18n VALUES ('division-scope','hk','en','China'),('division-scope','central','en','Central and Western');`)
    const options = {
      currentDb: drizzle({ client: current, schema: currentSchema }) as never,
      metaDb: drizzle({ client: meta, schema: metaSchema }) as never,
      cohortKey: '2026-09',
      environment: 'dev' as const,
    }
    const maps = await loadDivisionLookupMaps(options)
    expect(maps.snapshotId).toBe('revision-2')
    expect(maps.countryId).toBe('hk')
    expect([...maps.districtByEn.values()]).toEqual(['central'])
    current.exec('UPDATE divisionPublicationState SET preparedAt = NULL')
    await expect(loadDivisionLookupMaps(options)).rejects.toThrow(
      'No published division snapshot',
    )
    meta.exec(`
      INSERT INTO snapshotLineages (id,variant,regionCode) VALUES ('curated','saanseoi','hk'),('curated-area','saanseoi','hk');
INSERT OR IGNORE INTO snapshotLineages (id,code,resourceType,regionCode,variant,identityMode,versionHash,createdAt,updatedAt) VALUES ('curated','curated','division','hk','default','persistent','fixture','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z');
UPDATE snapshotLineages SET resourceType='division' WHERE id='curated' AND resourceType IS NULL;
INSERT OR IGNORE INTO snapshotLineages (id,code,resourceType,regionCode,variant,identityMode,versionHash,createdAt,updatedAt) VALUES ('curated-area','curated-area','divisionArea','hk','default','persistent','fixture','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z');
UPDATE snapshotLineages SET resourceType='divisionArea' WHERE id='curated-area' AND resourceType IS NULL;
INSERT INTO snapshots (id, snapshotLineageId, status, cohortKey, revision) VALUES
('reviewed', 'curated', 'published', '2026-09-01.0', 1),
('curated-area', 'curated-area', 'published', '2026-09-01.0', 1);`)
    current.exec(`INSERT INTO divisionPublicationState VALUES ('curated','reviewed','ready','curated');
      INSERT INTO divisionAreaPublicationState VALUES ('curated-area','curated-area','ready','curated');
      INSERT INTO divisions VALUES ('curated','town',3,'locality','town','{"full":[]}');
      INSERT INTO divisionsI18n VALUES ('curated','town','en','Reviewed Town');`)
    current.query('INSERT INTO divisionAreas VALUES (?,?,?)').run(
      'curated-area',
      'town',
      JSON.stringify({
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
            [0, 0],
          ],
        ],
      }),
    )
    const curated = await loadDivisionLookupMaps(options)
    expect(curated.snapshotId).toBe('reviewed')
    expect(curated.areaSnapshotId).toBe('curated-area')
    expect(curated.membership?.resolve({ lng: 0.5, lat: 0.5 }).references.townId).toBe(
      'town',
    )
    meta.exec("DELETE FROM snapshots WHERE id='curated-area'")
    await expect(loadDivisionLookupMaps(options)).rejects.toThrow(
      'requires published saanseoi divisionArea',
    )
  } finally {
    current.close()
    meta.close()
  }
})
