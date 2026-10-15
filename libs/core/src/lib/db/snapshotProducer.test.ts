import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { resolve } from 'node:path'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { loadMigrationSql } from '../../testing/metaFixtures'
import {
  insertFixtureSnapshot,
  insertSnapshotProducerFixture,
} from '../../testing/snapshotFixtures'
import { upsertSnapshotSource } from './metaRegistry'
import {
  assertOwnedSnapshotProducers,
  resolveSnapshotHistoryProducers,
} from './snapshotProducer'

const migrations = resolve(import.meta.dir, '../../../../db/migrations')
test('registration rejects competing releases of one dataset while retaining distinct contributors', async () => {
  const sqlite = new Database(':memory:')
  try {
    sqlite.exec(loadMigrationSql(migrations, ['meta']))
    for (const id of ['root', 'other'])
      insertFixtureSnapshot(sqlite, {
        id,
        code: id,
        resourceType: 'divisionArea',
        cohortKey: '2026',
        status: 'draft',
      })
    const db = drizzle({ client: sqlite }) as never
    await expect(resolveSnapshotHistoryProducers(db, 'root')).rejects.toThrow(
      'requires a HISTORY producer',
    )
    insertSnapshotProducerFixture(sqlite, 'root', 'original')
    insertSnapshotProducerFixture(sqlite, 'other', 'other')
    expect((await resolveSnapshotHistoryProducers(db, 'root')).resourceReleaseId).toBe(
      'original',
    )
    await expect(upsertSnapshotSource(db, 'root', 'other', 'primary')).rejects.toThrow(
      'competing HISTORY producer',
    )
    expect((await resolveSnapshotHistoryProducers(db, 'root')).resourceReleaseId).toBe(
      'original',
    )
    await assertOwnedSnapshotProducers(db, ['root'], ['original'])
    await expect(assertOwnedSnapshotProducers(db, ['root'], ['other'])).rejects.toThrow(
      'Refusing reset',
    )
    // A lookup cannot demote the producing membership or overwrite its selection evidence.
    await upsertSnapshotSource(db, 'root', 'original', 'lookup')
    expect((await resolveSnapshotHistoryProducers(db, 'root')).resourceReleaseId).toBe(
      'original',
    )
    sqlite.exec(`INSERT INTO datasets(id,code,publisherId,regionCode,releaseType,releaseFrequency,theme,versionHash)
      VALUES('second','second','fixture-producer','hk','static','monthly','divisions','second');
      UPDATE sourceReleases SET datasetId='second' WHERE id='source-other';`)
    await upsertSnapshotSource(db, 'root', 'other', 'primary')
    await expect(
      assertOwnedSnapshotProducers(db, ['root'], ['original']),
    ).rejects.toThrow('Refusing reset')
    expect(await resolveSnapshotHistoryProducers(db, 'root')).toEqual({
      resourceReleaseId: null,
      producerReleases: {
        'fixture-producer-divisionArea': 'original',
        second: 'other',
      },
    })
    sqlite.exec(
      "UPDATE sourceReleases SET datasetId='fixture-producer-divisionArea' WHERE id='source-other'",
    )
    await expect(resolveSnapshotHistoryProducers(db, 'root')).rejects.toThrow(
      'multiple producing releases for dataset',
    )
  } finally {
    sqlite.close()
  }
})
