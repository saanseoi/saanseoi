import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { join } from 'node:path'
import { createLocalHarbourDb } from '../../../../../libs/core/src/testing/localDb'
import { loadMigrationSql } from '../../../../../libs/core/src/testing/metaFixtures'
import {
  insertFixtureSnapshot,
  insertSnapshotProducerFixture,
} from '../../../../../libs/core/src/testing/snapshotFixtures'
import { buildHistoricalPlaceApiReleaseSetStats } from './apiReleaseSetStats'

// No CURRENT database: historical statistics must derive solely from immutable events.
test('Places stats replay ancestors, exact introducing snapshots and base deletions', async () => {
  const meta = new Database(':memory:')
  const history = new Database(':memory:')
  const migrations = join(import.meta.dir, '../../../../../libs/db/migrations')
  meta.exec(loadMigrationSql(migrations, ['meta']))
  history.exec(loadMigrationSql(migrations, ['history']))
  try {
    meta.exec(`INSERT INTO dataShards
      (id, shardType, regionCode, year, environment, databaseName, databaseId, bindingName, status, versionHash)
      VALUES ('h','history','hk','2025','preview','h','h','DB_HISTORY','active','h')`)
    for (const [id, parent] of [
      ['old', null],
      ['new', 'old'],
    ] as const) {
      insertFixtureSnapshot(meta, {
        id,
        code: id,
        resourceType: 'place',
        cohortKey: id,
        status: 'published',
        parentSnapshotId: parent,
        snapshotLineageId: 'places',
      })
      insertSnapshotProducerFixture(meta, id)
      meta
        .query(
          'INSERT INTO snapshotShardAssignments(snapshotId,dataShardId) VALUES (?,?)',
        )
        .run(id, 'h')
    }
    for (const id of ['kept', 'deleted']) {
      history
        .query(`INSERT INTO places
        (id,snapshotId,versionHash,resourceReleaseId,geometry,firstSeenMonth,lastSeenMonth,address2dId)
        VALUES (?,'old',?,'source','{"type":"Point","coordinates":[114,22]}','2025-01','2025-01','address')`)
        .run(id, id)
      history
        .query(`INSERT INTO placesI18n(placeId,snapshotId,locale,versionHash,name,meta)
        VALUES (?,'old','en',?,'Historical name','{}')`)
        .run(id, id)
    }
    // Repeated hash in a descendant must not duplicate the inherited row.
    history.exec(`INSERT INTO placesI18n(placeId,snapshotId,locale,versionHash,name,meta)
      VALUES ('kept','new','en','kept','Historical name','{}');
      INSERT INTO places(id,snapshotId,operation) VALUES ('deleted','new','delete')`)
    const input = [{ bindingName: 'DB_HISTORY', db: createLocalHarbourDb(history) }]
    for (const [snapshot, count] of [
      ['old', 2],
      ['new', 1],
    ] as const) {
      const rows = await buildHistoricalPlaceApiReleaseSetStats(
        createLocalHarbourDb(meta),
        input,
        snapshot,
      )
      for (const category of ['records', 'localised_rows', 'address_links']) {
        expect(
          rows.find(
            row =>
              row.category === category &&
              row.dimension === null &&
              row.measure === 'count',
          )?.value,
        ).toBe(count)
      }
    }
  } finally {
    meta.close()
    history.close()
  }
})
