import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { join } from 'node:path'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { currentSchema, historySchema, sourceSchema } from '@repo/db'
import { normaliseDivisionAreaGeometryRow } from '@repo/core/pipeline/services/divisions/divisionGeometry'
import type { HarbourReadableDb } from '@repo/core/db/types'
import { loadMigrationSql } from '../../../../../../libs/core/src/testing/metaFixtures.ts'
import { createLocalExecBinding } from '../../dbCache/localDbCache.ts'
import type { LocalAddressDbContext } from '../../dbCache/localDbCacheTypes.ts'
import { findIdenticalCenstatdGeometrySnapshot } from './processLocalDivisionGeometrySqlUploadPreparation.ts'
import { writeGeometryRows } from './processLocalDivisionGeometrySqlUploadRows.ts'

const version = {
  source: 'overture' as const,
  variant: 'hkgov-censtatd',
  resourceReleaseId: 'parent-release',
  releaseCode: 'parent-release',
  sourceVersion: '2021',
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
  value.canonical.id = id
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
  meta.exec(`CREATE TABLE snapshotLineages (
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
    CREATE TABLE snapshots(
      id TEXT PRIMARY KEY,
      parentSnapshotId TEXT,
      snapshotLineageId TEXT NOT NULL,
      cohortKey TEXT,
      status TEXT,
      revision INTEGER
    );
    CREATE TABLE dataShards(id TEXT PRIMARY KEY,bindingName TEXT);
    CREATE TABLE snapshotShardAssignments(snapshotId TEXT,dataShardId TEXT);
    INSERT INTO dataShards VALUES('history','DB_HISTORY');
    INSERT INTO snapshotShardAssignments VALUES('parent','history');

    INSERT INTO snapshotLineages (id,regionCode,variant) VALUES('lineage','hk','hkgov-censtatd');
INSERT OR IGNORE INTO snapshotLineages (id,code,resourceType,regionCode,variant,identityMode,versionHash,createdAt,updatedAt) VALUES ('lineage','lineage','divisionArea','hk','default','persistent','fixture','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z');
UPDATE snapshotLineages SET resourceType='divisionArea' WHERE id='lineage' AND resourceType IS NULL;
INSERT INTO snapshots (id, parentSnapshotId, snapshotLineageId, cohortKey, status, revision) VALUES
('parent', NULL, 'lineage', '2021', 'published', 1);`)
  const historyDb = drizzle({ client: history, schema: historySchema })
  const context = {
    currentDb: drizzle({ client: current, schema: currentSchema }),
    historyDb,
    historyTargets: [{ bindingName: 'DB_HISTORY', db: historyDb }],
    historyBinding: createLocalExecBinding(history, 'DB_HISTORY'),
    metaDb: drizzle({ client: meta }),
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
      resourceReleaseId: 'child-release',
      releaseCode: 'child-release',
      sourceVersion: '2022',
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
      f.current
        .query('SELECT id FROM divisionAreas WHERE snapshotId=?')
        .all(JSON.stringify(['lineage', '2021'])),
    ).toEqual([{ id: 'retained' }])
    f.current
      .query(
        "UPDATE divisionAreaPublicationState SET status='publishing',preparedAt='complete' WHERE snapshotId='parent'",
      )
      .run()
    await writeGeometryRows(f.context, 'divisionArea', [row('new')], child)
    expect(
      f.current
        .query('SELECT id FROM divisionAreas WHERE snapshotId=? ORDER BY id')
        .all(JSON.stringify(['lineage', '2021'])),
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
