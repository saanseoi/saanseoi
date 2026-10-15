import { defineRelations } from 'drizzle-orm'
import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { join } from 'node:path'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { currentSchema, historySchema, sourceSchema } from '@repo/db'
import { normaliseDivisionAreaGeometryRow } from '@repo/core/pipeline/services/divisions/divisionGeometry'
import { loadMigrationSql } from '../../../../../../libs/core/src/testing/metaFixtures'
import { createLocalExecBinding } from '../../dbCache/localDbCache'
import type { LocalAddressDbContext } from '../../dbCache/localDbCacheTypes'
import { writeGeometryRows } from './processLocalDivisionGeometrySqlUploadRows'

for (const sourceName of ['overture', 'hkgov-censtatd'] as const)
  test(`${sourceName} geometry current writes skip unchanged values, retain cohorts and delete only removed records`, async () => {
    const current = new Database(':memory:')
    const history = new Database(':memory:')
    const source = new Database(':memory:')
    const meta = new Database(':memory:')
    for (const [db, family] of [
      [current, 'current'],
      [history, 'history'],
      [source, 'source'],
    ] as const)
      db.exec(
        loadMigrationSql(
          join(import.meta.dir, '../../../../../../libs/db/migrations'),
          [family],
        ),
      )
    meta.exec(`CREATE TABLE snapshots(id TEXT PRIMARY KEY,parentSnapshotId TEXT); CREATE TABLE snapshotResourceReleases(snapshotId,resourceReleaseId,role); CREATE TRIGGER fixtureProducer AFTER INSERT ON snapshots BEGIN INSERT INTO snapshotResourceReleases VALUES(NEW.id,NEW.id,'primary'); END;
      CREATE TABLE dataShards(id TEXT PRIMARY KEY,bindingName TEXT);
      CREATE TABLE snapshotShardAssignments(snapshotId TEXT,dataShardId TEXT);
      INSERT INTO dataShards VALUES('history','DB_HISTORY');`)
    const historyDb = drizzle({
      client: history,
      relations: defineRelations(historySchema),
    })
    const context = {
      currentDb: drizzle({
        client: current,
        relations: defineRelations(currentSchema),
      }),
      historyDb,
      historyTargets: [{ bindingName: 'DB_HISTORY', db: historyDb }],
      historyBinding: createLocalExecBinding(history, 'DB_HISTORY'),
      metaDb: drizzle({ client: meta }),
      sourceDb: drizzle({ client: source, relations: defineRelations(sourceSchema) }),
    } as unknown as LocalAddressDbContext
    current.exec(`CREATE TABLE writes(operation TEXT,id TEXT);
    CREATE TRIGGER writes_insert AFTER INSERT ON divisionAreas BEGIN INSERT INTO writes VALUES('insert',NEW.id); END;
    CREATE TRIGGER writes_update AFTER UPDATE ON divisionAreas BEGIN INSERT INTO writes VALUES('update',NEW.id); END;
    CREATE TRIGGER writes_delete AFTER DELETE ON divisionAreas BEGIN INSERT INTO writes VALUES('delete',OLD.id); END;`)
    const row = (id: string, edge = 115) => {
      const item = normaliseDivisionAreaGeometryRow(
        {
          id,
          division_id: 'division',
          class: 'land',
          ...(sourceName === 'hkgov-censtatd'
            ? {
                source_record_id: id,
                source_assertion_geometry: {
                  type: 'Polygon',
                  coordinates: [
                    [
                      [114, 22],
                      [edge, 22],
                      [edge, 23],
                      [114, 22],
                    ],
                  ],
                },
                source_properties: { dcClass: 'district' },
                source_geometry: {
                  type: 'Polygon',
                  coordinates: [
                    [
                      [114, 22],
                      [edge, 22],
                      [edge, 23],
                      [114, 22],
                    ],
                  ],
                },
              }
            : {}),
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [114, 22],
                [edge, 22],
                [edge, 23],
                [114, 22],
              ],
            ],
          },
        },
        sourceName,
        {
          datasetCode:
            'ds-hk-hkgov-censtatd-division-statistic-land-area-population-density-district',
        },
      )
      if (!item) throw new Error('Invalid geometry fixture')
      // Publication fixtures use readable identities; producer identity is tested separately.
      item.canonical.id = id
      return item
    }
    const write = async (
      snapshotId: string,
      parentSnapshotId: string | null,
      rows: ReturnType<typeof row>[],
      cohortKey = '2026',
    ) => {
      current.exec('DELETE FROM writes')
      const result = await writeGeometryRows(context, 'divisionArea', rows, {
        datasetCode: 'dataset',
        source: sourceName,
        variant: 'variant',
        resourceReleaseId: snapshotId,
        releaseCode: snapshotId,
        sourceVersion: snapshotId,
        snapshotId,
        snapshotLineageId: 'lineage',
        parentSnapshotId,
        cohortKey,
      })
      meta.query('INSERT INTO snapshots VALUES(?,?)').run(snapshotId, parentSnapshotId)
      meta
        .query('INSERT INTO snapshotShardAssignments VALUES(?,?)')
        .run(snapshotId, 'history')
      return {
        ...result,
        writes: current
          .query('SELECT operation,id FROM writes ORDER BY operation,id')
          .all(),
      }
    }
    try {
      expect((await write('first', null, [row('a'), row('b')])).writes).toEqual([
        { operation: 'insert', id: 'a' },
        { operation: 'insert', id: 'b' },
      ])
      if (sourceName === 'hkgov-censtatd')
        source.exec("UPDATE hkgovCenstatdGeometry SET sourceGeometry=X''")
      const unchanged = await write('reissue', 'first', [row('a'), row('b')])
      if (sourceName === 'hkgov-censtatd')
        expect(
          source
            .query(
              'SELECT count(*) AS n FROM hkgovCenstatdGeometry WHERE length(sourceGeometry)=0',
            )
            .get(),
        ).toEqual({ n: 0 })
      expect(unchanged.writes).toEqual([])
      expect(unchanged.currentChanges.changedCurrentIds).toEqual([])
      expect(unchanged.churn.unchanged).toBe(2)
      const revised = await write('revision', 'reissue', [row('a', 116), row('c')])
      expect(revised.writes).toEqual([
        { operation: 'delete', id: 'b' },
        { operation: 'insert', id: 'c' },
        { operation: 'update', id: 'a' },
      ])
      expect(revised.currentChanges.changedCurrentIds).toEqual(['a', 'c'])
      expect(revised.currentChanges.removedCurrentIds).toEqual(['b'])
      expect((await write('new-cohort', null, [row('a')], '2027')).writes).toEqual([
        { operation: 'insert', id: 'a' },
      ])
      expect(current.query('SELECT count(*) AS n FROM divisionAreas').get()).toEqual({
        n: 3,
      })
      if (sourceName === 'hkgov-censtatd') {
        expect(
          source
            .query(
              'SELECT DISTINCT typeof(sourceGeometry) AS storage FROM hkgovCenstatdGeometry',
            )
            .all(),
        ).toEqual([{ storage: 'blob' }])
        expect(
          source
            .query(
              `SELECT datasetCode,count(*) AS versions,max(isCurrent) AS current
               FROM hkgovCenstatdStatistics WHERE sourceRecordId='a'
               GROUP BY datasetCode`,
            )
            .all(),
        ).toEqual([{ datasetCode: 'dataset', versions: 4, current: 1 }])
        const derive = async (population: number, engineVersion = '1') => {
          const item = row('a')
          item.source.properties = { population }
          item.source.derivation = {
            method: 'simplified',
            engineVersion,
            toleranceMetres: 10,
          }
          await writeGeometryRows(context, 'divisionArea', [item], {
            datasetCode: 'dataset',
            source: sourceName,
            variant: 'variant',
            resourceReleaseId: 'new-cohort',
            releaseCode: 'new-cohort',
            sourceVersion: '2027',
            snapshotId: 'new-cohort',
            snapshotLineageId: 'lineage',
            parentSnapshotId: null,
            cohortKey: '2027',
            transform: 'simplified',
            skipCanonicalMaterialisation: true,
          })
        }
        await derive(100)
        await derive(200)
        expect(
          source
            .query('SELECT count(*) AS n FROM hkgovCenstatdGeometryDerivatives')
            .get(),
        ).toEqual({ n: 1 })
        await derive(200, '2')
        expect(
          source
            .query('SELECT count(*) AS n FROM hkgovCenstatdGeometryDerivatives')
            .get(),
        ).toEqual({ n: 2 })
      }
    } finally {
      current.close()
      history.close()
      source.close()
      meta.close()
    }
  })
