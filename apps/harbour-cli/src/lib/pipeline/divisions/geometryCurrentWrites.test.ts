import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { join } from 'node:path'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { currentSchema, historySchema, sourceSchema } from '@repo/db'
import { normaliseDivisionAreaGeometryRow } from '@repo/core/pipeline/services/divisions/divisionGeometry'
import { loadMigrationSql } from '../../../../../../libs/core/src/testing/metaFixtures'
import type { LocalAddressDbContext } from '../../dbCache/localDbCacheTypes'
import { writeGeometryRows } from './processLocalDivisionGeometrySqlUploadRows'

for (const sourceName of ['overture', 'hkgov-censtatd'] as const)
  test(`${sourceName} geometry current writes skip unchanged values, retain cohorts and delete only removed records`, async () => {
    const current = new Database(':memory:')
    const history = new Database(':memory:')
    const source = new Database(':memory:')
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
    const context = {
      currentDb: drizzle({ client: current, schema: currentSchema }),
      historyDb: drizzle({ client: history, schema: historySchema }),
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
        'overture',
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
        snapshotId,
        snapshotLineageId: 'lineage',
        parentSnapshotId,
        cohortKey,
      })
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
    } finally {
      current.close()
      history.close()
      source.close()
    }
  })
