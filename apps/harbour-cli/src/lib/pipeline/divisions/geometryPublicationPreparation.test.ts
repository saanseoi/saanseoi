import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { join } from 'node:path'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { currentSchema, historySchema, sourceSchema } from '@repo/db'
import { normaliseDivisionAreaGeometryRow } from '@repo/core/pipeline/services/divisions/divisionGeometry'
import type { HarbourReadableDb } from '@repo/core/db/types'
import { loadMigrationSql } from '../../../../../../libs/core/src/testing/metaFixtures.ts'
import type { LocalAddressDbContext } from '../../dbCache/localDbCacheTypes.ts'
import { findIdenticalCenstatdGeometrySnapshot } from './processLocalDivisionGeometrySqlUploadPreparation.ts'
import { writeGeometryRows } from './processLocalDivisionGeometrySqlUploadRows.ts'

const version = {
  source: 'overture' as const,
  variant: 'hkgov-censtatd',
  releaseId: 'parent-release',
  releaseCode: 'parent-release',
  snapshotId: 'parent',
  snapshotLineageId: 'lineage',
  parentSnapshotId: null,
  cohortKey: '2021',
}
function row(id: string) {
  const value = normaliseDivisionAreaGeometryRow(
    {
      id,
      division_id: 'division',
      class: 'land',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [114, 22],
            [115, 22],
            [115, 23],
            [114, 22],
          ],
        ],
      },
    },
    'overture',
  )
  if (!value) throw new Error('Invalid geometry fixture')
  return value
}
function fixture() {
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
      loadMigrationSql(join(import.meta.dir, '../../../../../../libs/db/migrations'), [
        family,
      ]),
    )
  meta.exec(`CREATE TABLE snapshotLineages(id TEXT PRIMARY KEY,regionCode TEXT,variant TEXT);
    CREATE TABLE snapshots(id TEXT PRIMARY KEY,parentSnapshotId TEXT,snapshotLineageId TEXT,resourceType TEXT,cohortKey TEXT,status TEXT,revision INTEGER);
    INSERT INTO snapshotLineages VALUES('lineage','hk','hkgov-censtatd');
    INSERT INTO snapshots VALUES('parent',NULL,'lineage','divisionArea','2021','published',1);`)
  const context = {
    currentDb: drizzle({ client: current, schema: currentSchema }),
    historyDb: drizzle({ client: history, schema: historySchema }),
    sourceDb: drizzle({ client: source, schema: sourceSchema }),
  } as unknown as LocalAddressDbContext
  return {
    current,
    history,
    context,
    meta: drizzle({ client: meta }) as unknown as HarbourReadableDb,
    close() {
      for (const db of [current, history, source, meta]) db.close()
    },
  }
}

test('geometry merge and canonical reuse reject unprepared snapshots before writing, then accept completed publishing mirrors', async () => {
  const f = fixture()
  try {
    await writeGeometryRows(f.context, 'divisionArea', [row('retained')], version)
    f.current
      .query(
        "UPDATE divisionAreaPublicationState SET preparedAt=NULL WHERE snapshotId='parent'",
      )
      .run()
    const child = {
      ...version,
      snapshotId: 'child',
      releaseId: 'child-release',
      releaseCode: 'child-release',
      parentSnapshotId: 'parent',
      merge: true,
    }
    await expect(
      writeGeometryRows(f.context, 'divisionArea', [row('new')], child),
    ).rejects.toThrow('no complete divisionAreaPublicationState receipt')
    await expect(
      writeGeometryRows(f.context, 'divisionArea', [row('retained')], {
        ...version,
        skipCanonicalMaterialisation: true,
      }),
    ).rejects.toThrow('no complete divisionAreaPublicationState receipt')
    expect(
      f.current
        .query(
          "SELECT count(*) AS count FROM divisionAreaPublicationState WHERE snapshotId='child'",
        )
        .get(),
    ).toEqual({ count: 0 })
    expect(
      f.current.query("SELECT id FROM divisionAreas WHERE snapshotId='parent'").all(),
    ).toEqual([{ id: 'retained' }])
    f.current
      .query(
        "UPDATE divisionAreaPublicationState SET status='publishing',preparedAt='complete' WHERE snapshotId='parent'",
      )
      .run()
    await writeGeometryRows(f.context, 'divisionArea', [row('new')], child)
    expect(
      f.current
        .query("SELECT id FROM divisionAreas WHERE snapshotId='child' ORDER BY id")
        .all(),
    ).toEqual([{ id: 'new' }, { id: 'retained' }])
    expect(
      f.current
        .query(
          "SELECT status,preparedAt IS NOT NULL AS prepared FROM divisionAreaPublicationState WHERE snapshotId='child'",
        )
        .get(),
    ).toEqual({ status: 'publishing', prepared: 1 })
  } finally {
    f.close()
  }
})

test('identical geometry requires the matching completed receipt even when canonical rows are present', async () => {
  const f = fixture()
  try {
    const geometry = row('retained')
    await writeGeometryRows(f.context, 'divisionArea', [geometry], version)
    const plan = {
      cohortKey: '2021',
      regionCode: 'hk' as const,
      releaseCode: 'next',
      rowCount: 1,
      source: 'hkgov-censtatd' as const,
      sourceVersion: '2021',
      theme: 'divisions' as const,
      resourceType: 'divisionArea' as const,
    }
    const find = () =>
      findIdenticalCenstatdGeometrySnapshot(f.context.currentDb, f.meta, plan, [
        geometry,
      ])
    f.current
      .query(
        "UPDATE divisionAreaPublicationState SET preparedAt=NULL WHERE snapshotId='parent'",
      )
      .run()
    expect(await find()).toBeNull()
    f.current
      .query(
        "UPDATE divisionAreaPublicationState SET status='publishing',preparedAt='complete' WHERE snapshotId='parent'",
      )
      .run()
    expect(await find()).toMatchObject({ id: 'parent' })
    f.current
      .query(
        "UPDATE divisionAreaPublicationState SET scopeId='wrong-scope' WHERE snapshotId='parent'",
      )
      .run()
    expect(await find()).toBeNull()
    f.current.query('DELETE FROM divisionAreaPublicationState').run()
    expect(await find()).toBeNull()
  } finally {
    f.close()
  }
})
