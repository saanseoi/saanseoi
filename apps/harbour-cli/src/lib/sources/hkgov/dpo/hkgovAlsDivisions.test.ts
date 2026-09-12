import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { currentSchema, metaSchema } from '@repo/db'
import { loadDivisionLookupMaps } from './hkgovAlsDivisions.ts'

test('ALS current Division lookup resolves a prepared scope and retains its latest logical revision', async () => {
  const current = new Database(':memory:')
  const meta = new Database(':memory:')
  try {
    meta.exec(`CREATE TABLE snapshots(id TEXT,snapshotLineageId TEXT,resourceType TEXT,status TEXT,cohortKey TEXT,revision INTEGER);
      CREATE TABLE snapshotLineages(id TEXT,variant TEXT);
      INSERT INTO snapshotLineages VALUES ('division-scope','overture');
      INSERT INTO snapshots VALUES ('revision-1','division-scope','division','published','2026-09',1),('revision-2','division-scope','division','published','2026-09',2);`)
    current.exec(`CREATE TABLE divisionPublicationState(scopeId TEXT,snapshotId TEXT,preparedAt TEXT,publicationToken TEXT);
      INSERT INTO divisionPublicationState VALUES ('division-scope','revision-2','ready','release-2');
      CREATE TABLE divisions(snapshotId TEXT,id TEXT,level INTEGER,category TEXT,class TEXT);
      CREATE TABLE divisionsI18n(snapshotId TEXT,divisionId TEXT,locale TEXT,name TEXT);
      INSERT INTO divisions VALUES ('division-scope','hk',0,'land','country'),('division-scope','central',2,'land','district');
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
  } finally {
    current.close()
    meta.close()
  }
})
