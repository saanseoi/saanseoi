import { defineRelations } from 'drizzle-orm'
import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { resolve } from 'node:path'
import {
  insertFixtureSnapshot as insertSnapshot,
  insertSnapshotProducerFixture,
} from '../../../../../../libs/core/src/testing/snapshotFixtures'
import { currentSchema, historySchema, metaSchema } from '@repo/db'
import { compressJsonBrotli } from '@repo/core/pipeline/services/storage/brotliJson'
import { loadMigrationSql } from '../../../../../../libs/core/src/testing/metaFixtures'
import { loadCrosswalkDivisions } from './currentGeographicCrosswalk'

const selection = {
  releaseSet: { code: 'release' },
  snapshots: [
    { snapshotResourceType: 'division', snapshotId: 'd', variant: 'planning' },
    { snapshotResourceType: 'divisionArea', snapshotId: 'a', variant: 'planning' },
    { snapshotResourceType: 'divisionArea', snapshotId: 'other', variant: 'other' },
  ],
} as Parameters<typeof loadCrosswalkDivisions>[1]
const polygon = {
  type: 'Polygon' as const,
  coordinates: [
    [
      [114, 22],
      [114.1, 22],
      [114.1, 22.1],
      [114, 22.1],
      [114, 22],
    ],
  ],
}
function fixture() {
  const sqlite = new Database(':memory:')
  sqlite.exec(
    loadMigrationSql(resolve(import.meta.dir, '../../../../../../libs/db/migrations'), [
      'current',
    ]),
  )
  sqlite.exec(`INSERT INTO divisionPublicationState(scopeId,snapshotId,status) VALUES ('ds','d','current');
    INSERT INTO divisionAreaPublicationState(scopeId,snapshotId,status) VALUES ('as','a','current');
    INSERT INTO divisions(scopeId,id,divisionCode,level,class,hierarchies) VALUES ('ds','tpu','TPU',3,'planning-tpu','{}'),('ds','ppu','PPU',1,'planning-ppu','{}');`)
  sqlite
    .query(
      `INSERT INTO divisionAreas(scopeId,id,divisionId,type,geometry) VALUES ('as','area','tpu','Polygon',?)`,
    )
    .run(compressJsonBrotli(polygon))
  return {
    sqlite,
    context: {
      currentDb: drizzle({ client: sqlite, relations: defineRelations(currentSchema) }),
    } as unknown as Parameters<typeof loadCrosswalkDivisions>[0],
  }
}
test('loads only TPUs and the exact ready geometry variant, including compressed polygons', async () => {
  const f = fixture()
  try {
    const result = await loadCrosswalkDivisions(
      f.context,
      selection,
      'planning',
      'planning-tpu',
    )
    expect(result.rows).toEqual([{ id: 'tpu', areas: [polygon] }])
    expect(result.missing).toEqual([])
    const geographic = await loadCrosswalkDivisions(
      f.context,
      selection,
      'planning',
      undefined,
    )
    expect(geographic.missing).toEqual(['ppu'])
  } finally {
    f.sqlite.close()
  }
})
test('rejects missing TPU polygons and a superseded publication receipt', async () => {
  const f = fixture()
  try {
    f.sqlite.exec("UPDATE divisions SET class='planning-tpu' WHERE id='ppu'")
    await expect(
      loadCrosswalkDivisions(f.context, selection, 'planning', 'planning-tpu'),
    ).rejects.toThrow('1 published planning-tpu divisions lack polygons')
    f.sqlite.exec("UPDATE divisionAreaPublicationState SET snapshotId='newer'")
    await expect(
      loadCrosswalkDivisions(f.context, selection, 'planning', 'planning-tpu'),
    ).rejects.toThrow('not CURRENT-ready')
  } finally {
    f.sqlite.close()
  }
})

test.each(['housing-market-area', 'planning-newtown'])(
  '%s loads native polygons and blocks missing source geometry',
  async sourceClass => {
    const f = fixture()
    try {
      f.sqlite.query("UPDATE divisions SET class=? WHERE id='tpu'").run(sourceClass)
      expect(
        (
          await loadCrosswalkDivisions(f.context, selection, 'planning', sourceClass)
        ).rows.map(row => row.id),
      ).toEqual(['tpu'])
      f.sqlite.exec('DELETE FROM divisionAreas')
      await expect(
        loadCrosswalkDivisions(f.context, selection, 'planning', sourceClass),
      ).rejects.toThrow(`published ${sourceClass} divisions lack polygons`)
    } finally {
      f.sqlite.close()
    }
  },
)

test('historical crosswalk inputs replay inherited rows and deletions without borrowing CURRENT geometry', async () => {
  const f = fixture()
  const meta = new Database(':memory:'),
    history = new Database(':memory:')
  const migrations = resolve(import.meta.dir, '../../../../../../libs/db/migrations')
  try {
    meta.exec(loadMigrationSql(migrations, ['meta']))
    history.exec(loadMigrationSql(migrations, ['history']))
    meta.exec(`INSERT INTO dataShards(id,shardType,environment,databaseName,databaseId,bindingName,status,versionHash)
      VALUES('history','history','dev','history','history','history','active','hash')`)
    for (const [root, leaf, resourceType] of [
      ['d-root', 'd', 'division'],
      ['a-root', 'a', 'divisionArea'],
    ]) {
      for (const [id, parentSnapshotId] of [
        [root, null],
        [leaf, root],
      ]) {
        insertFixtureSnapshot(meta, {
          id: id!,
          parentSnapshotId,
          code: id!,
          resourceType: resourceType!,
          cohortKey: '2006',
          status: 'archived',
        })
        meta
          .query('INSERT INTO snapshotShardAssignments VALUES (?,?)')
          .run(id!, 'history')
      }
    }
    const historyDb = drizzle({
      client: history,
      relations: defineRelations(historySchema),
    })
    for (const id of ['inherited', 'deleted']) {
      await historyDb
        .insert(historySchema.divisions)
        .values({
          id,
          snapshotId: 'd-root',
          class: 'planning-newtown',
          hierarchies: { full: [] },
          versionHash: id,
        })
        .run()
      await historyDb
        .insert(historySchema.divisionAreas)
        .values({
          id: `area-${id}`,
          divisionId: id,
          snapshotId: 'a-root',
          variant: 'planning',
          type: 'land',
          geometry: polygon,
          versionHash: id,
        })
        .run()
    }
    await historyDb
      .insert(historySchema.divisions)
      .values({ id: 'deleted', snapshotId: 'd', operation: 'delete' })
      .run()
    await historyDb
      .insert(historySchema.divisionAreas)
      .values({ id: 'area-deleted', snapshotId: 'a', operation: 'delete' })
      .run()
    f.sqlite.exec(
      "UPDATE divisionPublicationState SET snapshotId='newer'; UPDATE divisionAreaPublicationState SET snapshotId='newer'",
    )
    const context = {
      ...f.context,
      metaDb: drizzle({ client: meta, relations: defineRelations(metaSchema) }),
      historyTargets: [{ bindingName: 'history', db: historyDb }],
    } as unknown as Parameters<typeof loadCrosswalkDivisions>[0]
    const result = await loadCrosswalkDivisions(
      context,
      selection,
      'planning',
      'planning-newtown',
    )
    expect(result.rows).toEqual([{ id: 'inherited', areas: [polygon] }])
    expect(result.snapshotId).toBe('d')
    expect(result.areaSnapshotId).toBe('a')
    history.exec('DELETE FROM divisionAreas')
    await expect(
      loadCrosswalkDivisions(context, selection, 'planning', 'planning-newtown'),
    ).rejects.toThrow()
  } finally {
    f.sqlite.close()
    meta.close()
    history.close()
  }
})

function insertFixtureSnapshot(...args: Parameters<typeof insertSnapshot>) {
  insertSnapshot(...args)
  insertSnapshotProducerFixture(args[0], args[1].id)
}
