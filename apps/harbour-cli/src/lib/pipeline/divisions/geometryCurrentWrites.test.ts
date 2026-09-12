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
    meta.exec(`CREATE TABLE snapshots(id TEXT PRIMARY KEY,parentSnapshotId TEXT);
      CREATE TABLE dataShards(id TEXT PRIMARY KEY,bindingName TEXT);
      CREATE TABLE snapshotShardAssignments(snapshotId TEXT,dataShardId TEXT);
      INSERT INTO dataShards VALUES('history','DB_HISTORY');`)
    const historyDb = drizzle({ client: history, schema: historySchema })
    const context = {
      currentDb: drizzle({ client: current, schema: currentSchema }),
      historyDb,
      historyTargets: [{ bindingName: 'DB_HISTORY', db: historyDb }],
      historyBinding: createLocalExecBinding(history, 'DB_HISTORY'),
      metaDb: drizzle({ client: meta }),
      sourceDb: drizzle({ client: source, schema: sourceSchema }),
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
      )
      if (!item) throw new Error('Invalid geometry fixture')
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
        source: sourceName,
        variant: 'variant',
        releaseId: snapshotId,
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
      const unchanged = await write('reissue', 'first', [row('a'), row('b')])
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
      if (sourceName === 'hkgov-censtatd')
        expect(
          source
            .query(
              `SELECT censusYear,count(*) AS versions,max(isCurrent) AS current
               FROM hkgovCenstatdDivisionAreas WHERE sourceRecordId='a'
               GROUP BY censusYear ORDER BY censusYear`,
            )
            .all(),
        ).toEqual([
          { censusYear: '2026', versions: 2, current: 1 },
          { censusYear: '2027', versions: 1, current: 1 },
        ])
    } finally {
      current.close()
      history.close()
      source.close()
      meta.close()
    }
  })
