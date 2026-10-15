import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { getTableConfig, type SQLiteTable } from 'drizzle-orm/sqlite-core'
import { historySchema, metaSchema } from '@repo/db'
import { historyEventsSqlForTables } from '@repo/db/historyEvents'
import { createLocalHarbourDb } from '@repo/core/testing/localDb'
import {
  insertFixtureSnapshot,
  seedSnapshotProducerFixtures,
} from '../../../../../libs/core/src/testing/snapshotFixtures'
import { releaseFixtureSchemaSql } from '../../../../../libs/core/src/testing/releaseFixtures'
import {
  buildApiRecordReleaseChurn,
  assertApiRecordChangeTotals,
} from './apiRecordReleaseChurn'

function tables(db: Database, tables: SQLiteTable[]) {
  for (const table of tables) {
    const config = getTableConfig(table)
    db.exec(
      `CREATE TABLE "${config.name}" (${config.columns.map(column => `"${column.name}" ${column.getSQLType()}${column.name === 'operation' ? " DEFAULT 'upsert'" : ''}`).join(',')})`,
    )
  }
}

for (const [family, type, baseTable, localeTable, parentKey] of [
  ['places', 'place', historySchema.places, historySchema.placesI18n, 'placeId'],
  ['streets', 'street', historySchema.streets, historySchema.streetsI18n, 'streetId'],
] as const)
  test(`${family} API release counts replay independent locale edits, removals, no-op revisions and cross-year history`, async () => {
    const meta = new Database(':memory:')
    const earlier = new Database(':memory:')
    const later = new Database(':memory:')
    try {
      tables(meta, [
        metaSchema.metaApiReleaseSets,
        metaSchema.metaApiVersionReleaseSets,
        metaSchema.metaApiVersions,
        metaSchema.metaApiReleaseSetSnapshots,
        metaSchema.metaSnapshots,
        metaSchema.metaSnapshotLineages,
        metaSchema.metaSnapshotResourceReleases,
        metaSchema.metaSnapshotShardAssignments,
        metaSchema.metaDataShards,
        metaSchema.metaDatasets,
        metaSchema.metaPublishers,
      ])
      meta.exec(releaseFixtureSchemaSql())
      for (const db of [earlier, later]) {
        const history = [
          baseTable,
          localeTable,
          ...(type === 'street' ? [historySchema.streetGeometry] : []),
        ]
        tables(db, history)
        db.exec(
          `CREATE VIEW historyEvents AS ${historyEventsSqlForTables(new Set(history.map(table => getTableConfig(table).name)))}`,
        )
      }
      insertFixtureSnapshot(meta, {
        id: 'base',
        code: 'base',
        resourceType: type,
        snapshotLineageId: 'lineage',
        status: 'published',
        cohortKey: '2025-09',
      })
      insertFixtureSnapshot(meta, {
        id: 'next',
        code: 'next',
        resourceType: type,
        snapshotLineageId: 'lineage',
        status: 'published',
        cohortKey: '2026-09',
        parentSnapshotId: 'base',
      })
      insertFixtureSnapshot(meta, {
        id: 'retry',
        code: 'retry',
        resourceType: type,
        snapshotLineageId: 'lineage',
        status: 'published',
        cohortKey: '2026-09',
        parentSnapshotId: 'next',
      })
      seedSnapshotProducerFixtures(meta)
      meta.exec(`INSERT INTO dataShards(id,bindingName,shardType,status) VALUES ('old','OLD','history','active'),('new','NEW','history','active');
      INSERT INTO snapshotShardAssignments(snapshotId,dataShardId) VALUES ('base','old'),('next','new'),('retry','new');
      INSERT INTO apiVersions(id,familyType) VALUES ('version','${family}');
      INSERT INTO apiReleaseSets(id,cohortKey,revision,domainCode,regionCode) VALUES ('old-api','2025-09',0,'default','hk'),('new-api','2026-09',0,'default','hk'),('retry-api','2026-09',1,'default','hk');
      INSERT INTO apiVersionReleaseSets(apiReleaseSetId,apiVersionId,status) VALUES ('old-api','version','archived'),('new-api','version','archived'),('retry-api','version','current');
      INSERT INTO apiReleaseSetSnapshots(apiReleaseSetId,snapshotId,role) VALUES ('old-api','base','primary'),('new-api','next','primary'),('retry-api','retry','primary');`)
      const baseName = getTableConfig(baseTable).name
      const localeName = getTableConfig(localeTable).name
      for (const id of ['same', 'translated', 'removed']) {
        earlier
          .query(
            `INSERT INTO "${baseName}"(id,snapshotId,versionHash) VALUES (?,'base','base-content')`,
          )
          .run(id)
        earlier
          .query(
            `INSERT INTO "${localeName}"("${parentKey}",locale,snapshotId,versionHash) VALUES (?,'en','base','english')`,
          )
          .run(id)
      }
      later.exec(`INSERT INTO "${baseName}"(id,snapshotId,versionHash) VALUES ('added','next','new-content');
      INSERT INTO "${baseName}"(id,snapshotId,versionHash,operation) VALUES ('removed','next',NULL,'delete');
      INSERT INTO "${localeName}"("${parentKey}",locale,snapshotId,versionHash) VALUES ('translated','en','next','new-english'),('orphan','en','next','orphan');`)
      if (type === 'street') {
        earlier.exec(
          `INSERT INTO streetGeometry(streetId,snapshotId,versionHash) VALUES ('same','base','geometry-one')`,
        )
        later.exec(
          `INSERT INTO streetGeometry(streetId,snapshotId,versionHash) VALUES ('same','next','geometry-two')`,
        )
      }
      const targets = [
        { bindingName: 'OLD', db: createLocalHarbourDb(earlier) },
        { bindingName: 'NEW', db: createLocalHarbourDb(later) },
      ]
      const run = async (id: string) =>
        Object.fromEntries(
          (
            await buildApiRecordReleaseChurn(
              createLocalHarbourDb(meta),
              targets,
              id,
              family,
            )
          )
            .filter(row => row.category === 'changes' && !row.dimension)
            .map(row => [row.measure, row.value]),
        )
      expect(await run('old-api')).toEqual({
        count: 3,
        added_count: 3,
        changed_count: 0,
        removed_count: 0,
        unchanged_count: 0,
      })
      expect(await run('new-api')).toEqual({
        count: 3,
        added_count: 1,
        changed_count: type === 'street' ? 2 : 1,
        removed_count: 1,
        unchanged_count: type === 'street' ? 0 : 1,
      })
      expect(await run('retry-api')).toEqual({
        count: 3,
        added_count: 0,
        changed_count: 0,
        removed_count: 0,
        unchanged_count: 3,
      })
      expect(await run('new-api')).toEqual({
        count: 3,
        added_count: 1,
        changed_count: type === 'street' ? 2 : 1,
        removed_count: 1,
        unchanged_count: type === 'street' ? 0 : 1,
      })
      await expect(
        buildApiRecordReleaseChurn(createLocalHarbourDb(meta), [], 'new-api', family),
      ).rejects.toThrow()
    } finally {
      meta.close()
      earlier.close()
      later.close()
    }
  })

test('release stats require complete, balanced record totals independent of structural rows', () => {
  const rows = Object.entries({
    count: 3,
    added_count: 1,
    changed_count: 1,
    removed_count: 2,
    unchanged_count: 1,
  }).map(([measure, value]) => ({
    category: 'changes',
    measure,
    value,
    dimension: null as string | null,
  }))
  expect(() => assertApiRecordChangeTotals(rows)).not.toThrow()
  expect(() =>
    assertApiRecordChangeTotals(rows.map(row => ({ ...row, dimension: 'structural' }))),
  ).toThrow('aggregate record change measure')
  expect(() =>
    assertApiRecordChangeTotals(rows.filter(row => row.measure !== 'unchanged_count')),
  ).toThrow('unchanged_count')
  expect(() =>
    assertApiRecordChangeTotals(
      rows.map(row => (row.measure === 'count' ? { ...row, value: 4 } : row)),
    ),
  ).toThrow('do not balance')
  expect(() =>
    assertApiRecordChangeTotals([
      ...rows,
      { category: 'records', measure: 'count', value: 4, dimension: null },
    ]),
  ).toThrow('primary records')
  expect(() => assertApiRecordChangeTotals([...rows, rows[0]!])).toThrow('Duplicate')
})
