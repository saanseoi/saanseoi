import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { currentSchema, metaSchema } from '@repo/db'
import { loadDivisionLookupMaps } from './hkgovAlsDivisions.ts'

test('ALS current Division lookup resolves a prepared scope and retains its latest logical revision', async () => {
  const current = new Database(':memory:')
  const meta = new Database(':memory:')
  try {
    meta.exec(`CREATE TABLE snapshots(id TEXT,snapshotLineageId TEXT,resourceType TEXT,status TEXT,cohortKey TEXT,revision INTEGER,notes TEXT);
      CREATE TABLE snapshotLineages(id TEXT,variant TEXT,regionCode TEXT);
      INSERT INTO snapshotLineages VALUES ('division-scope','overture','hk'),('area-scope','overture','hk');
      INSERT INTO snapshots VALUES ('revision-1','division-scope','division','published','2026-09',1,NULL),('revision-2','division-scope','division','published','2026-09',2,NULL),('area','area-scope','divisionArea','published','2026-09',1,NULL);`)
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
    meta.exec(`INSERT INTO snapshotLineages VALUES ('curated','saanseoi','hk'),('curated-area','saanseoi','hk');
      INSERT INTO snapshots VALUES ('reviewed','curated','division','published','2026-09-01.0',1,'assembly'),('reviewed-area','curated-area','divisionArea','published','2026-09-01.0',1,'assembly');`)
    current.exec(`INSERT INTO divisionPublicationState VALUES ('curated','reviewed','ready','curated');
      INSERT INTO divisionAreaPublicationState VALUES ('curated-area','reviewed-area','ready','curated');
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
    expect(curated.areaSnapshotId).toBe('reviewed-area')
    expect(curated.membership?.resolve({ lng: 0.5, lat: 0.5 }).references.townId).toBe(
      'town',
    )
    meta.exec(
      "UPDATE snapshots SET notes='different-assembly' WHERE id='reviewed-area'",
    )
    await expect(loadDivisionLookupMaps(options)).rejects.toThrow(
      'requires published saanseoi divisionArea',
    )
  } finally {
    current.close()
    meta.close()
  }
})
