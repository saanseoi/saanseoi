import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { join } from 'node:path'
import type { HarbourWritableDb } from '@repo/core/db/types'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { loadMigrationSql } from '../../../../../../libs/core/src/testing/metaFixtures.ts'
import {
  closeSourceVersions,
  closeStreetOwnedVersions,
  insertHistoryI18nRows,
  insertHistoryRows,
  insertSourceRows,
} from './processLocalStreetSqlUploadRows.ts'
import type { PreparedStreet } from './processLocalStreetSqlUploadTypes.ts'

function street(sourceKind: PreparedStreet['sourceKind']): PreparedStreet {
  return {
    base: {
      id: 'publisher-record',
      districtIds: [],
      noticeType: 'declaration',
      gazetteDate: '2026-08-28',
      sources: {},
      yearBuilt: null,
    },
    application:
      sourceKind === 'baseline'
        ? null
        : {
            sourceStreetId: null,
            resultStreetId: null,
            disposition: 'apply',
            method: 'automatic',
            nameChangeScope: null,
            retainedDescriptions: null,
            correction: null,
          },
    districtCodes: ['CW'],
    i18n: [
      { locale: 'en', name: 'Example Street', description: null },
      { locale: 'zh-Hant', name: '示例街', description: null },
    ],
    deferToNotices: false,
    noticeRef: 'G.N. 123',
    effectiveDate: null,
    parserDiagnostics: null,
    previousNoticeRefs: [],
    rawExtractedText: null,
    evidenceAssets: [],
    sourceHash: 'original-hash',
    sourceKind,
    streetId: null,
  }
}

test.each(['baseline', 'notice', 'historical-notice'] as const)(
  '%s source intervals retain complete source versions for inserts, retries and closures',
  async sourceKind => {
    const sqlite = new Database(':memory:')
    try {
      sqlite.exec(
        loadMigrationSql(
          join(import.meta.dir, '../../../../../../libs/db/migrations'),
          ['source'],
        ),
      )
      const db = drizzle({ client: sqlite }) as unknown as HarbourWritableDb
      const original = street(sourceKind)
      const changed = { ...original, sourceHash: 'changed-hash' }
      const tables =
        sourceKind === 'baseline'
          ? ['hkgovLandsdStreetBaselineRecords']
          : ['hkgovLandsdStreetNotices', 'hkgovLandsdStreetNoticeApplications']
      const firstVersion = '2026-09-01.0'
      const secondVersion = '2026-09-12.1'

      await insertSourceRows(db, 'release-1', firstVersion, [original], '2026-09-01')
      // A retained-delivery retry also exercises the conflict-update assignments.
      await insertSourceRows(db, 'release-1', firstVersion, [original], '2026-09-01')
      await closeSourceVersions(db, [changed], secondVersion, '2026-09-12')
      await insertSourceRows(db, 'release-2', secondVersion, [changed], '2026-09-12')

      for (const table of tables) {
        expect(
          sqlite
            .query(
              `SELECT versionHash, resourceReleaseId, validFromRelease, validToRelease, isCurrent
               FROM ${table} ORDER BY validFromRelease`,
            )
            .all(),
        ).toEqual([
          {
            versionHash: 'original-hash',
            resourceReleaseId: 'release-1',
            validFromRelease: firstVersion,
            validToRelease: secondVersion,
            isCurrent: 0,
          },
          {
            versionHash: 'changed-hash',
            resourceReleaseId: 'release-2',
            validFromRelease: secondVersion,
            validToRelease: null,
            isCurrent: 1,
          },
        ])
        const atVersion = sqlite.query(
          `SELECT versionHash FROM ${table}
           WHERE validFromRelease <= ?
             AND (validToRelease IS NULL OR validToRelease > ?)`,
        )
        expect(atVersion.all(firstVersion, firstVersion)).toEqual([
          { versionHash: 'original-hash' },
        ])
        expect(atVersion.all(secondVersion, secondVersion)).toEqual([
          { versionHash: 'changed-hash' },
        ])
      }
    } finally {
      sqlite.close()
    }
  },
)

test('Street rollover closes source and canonical versions in their owning year and journals only the active shard', async () => {
  const old = new Database(':memory:'),
    active = new Database(':memory:')
  try {
    for (const db of [old, active])
      db.exec(
        loadMigrationSql(
          join(import.meta.dir, '../../../../../../libs/db/migrations'),
          ['source', 'history'],
        ),
      )
    const previous = drizzle({ client: old }) as unknown as HarbourWritableDb
    const next = drizzle({ client: active }) as unknown as HarbourWritableDb
    const record = street('notice')
    await insertSourceRows(previous, 'release-old', '2025-01.0', [record], 'original')
    const canonical = {
      id: 'street',
      status: 'active' as const,
      version: 1,
      districtIds: [],
      deletedAt: null,
      gazetteDate: null,
      sources: [],
      versionHash: 'original-street',
      i18n: record.i18n,
    }
    await insertHistoryRows(previous, 'old', 'release-old', [canonical], 'original')
    await insertHistoryI18nRows(previous, 'old', 'release-old', [canonical], 'original')
    await closeStreetOwnedVersions({
      sourceDb: next,
      historyDb: next,
      sourceTargets: [{ db: previous }, { db: next }],
      historyTargets: [{ db: previous }, { db: next }],
      records: [record],
      streetIds: ['street'],
      sourceVersion: '2026-01.0',
      snapshotId: 'next',
      now: 'later',
    })
    expect(
      old.query('SELECT isCurrent,validToRelease FROM hkgovLandsdStreetNotices').get(),
    ).toEqual({ isCurrent: 0, validToRelease: '2026-01.0' })
    expect(
      old
        .query(
          'SELECT isCurrent,validToRelease FROM hkgovLandsdStreetNoticeApplications',
        )
        .get(),
    ).toEqual({ isCurrent: 0, validToRelease: '2026-01.0' })
    expect(old.query('SELECT isCurrent FROM streets').get()).toEqual({ isCurrent: 1 })
    expect(old.query('SELECT DISTINCT isCurrent FROM streetsI18n').all()).toEqual([
      { isCurrent: 1 },
    ])
    expect(
      old
        .query("SELECT count(*) AS n FROM historyEvents WHERE snapshotId='next'")
        .get(),
    ).toEqual({ n: 0 })
    expect(
      active
        .query('SELECT snapshotId,recordType,recordId,operation FROM historyEvents')
        .all(),
    ).toEqual([
      {
        snapshotId: 'next',
        recordType: 'street',
        recordId: 'street',
        operation: 'delete',
      },
    ])
  } finally {
    old.close()
    active.close()
  }
})

test('deleted Street lifecycle state survives snapshot replay for restoration', async () => {
  const sqlite = new Database(':memory:')
  const meta = new Database(':memory:')
  try {
    sqlite.exec(
      loadMigrationSql(join(import.meta.dir, '../../../../../../libs/db/migrations'), [
        'history',
      ]),
    )
    meta.exec(`CREATE TABLE snapshots(id,parentSnapshotId); INSERT INTO snapshots VALUES('root',NULL),('deleted','root'),('inherited','deleted'),('sibling','root');
      CREATE TABLE dataShards(id,bindingName); INSERT INTO dataShards VALUES('h','history');
      CREATE TABLE snapshotShardAssignments(snapshotId,dataShardId); INSERT INTO snapshotShardAssignments VALUES('root','h'),('deleted','h'),('inherited','h'),('sibling','h');`)
    const db = drizzle({ client: sqlite }) as never
    const metaDb = drizzle({ client: meta }) as never
    const { readStreetSnapshot } = await import('./streetHistory')
    const original = {
      id: 'street',
      status: 'active' as const,
      version: 1,
      versionHash: 'one',
      districtIds: [],
      deletedAt: null,
      gazetteDate: null,
      sources: [],
      i18n: street('baseline').i18n,
    }
    await insertHistoryRows(db, 'root', 'release', [original], 'now')
    await insertHistoryI18nRows(db, 'root', 'release', [original], 'now')
    const deleted = {
      ...original,
      status: 'deleted' as const,
      version: 4,
      versionHash: 'four',
      deletedAt: '2026-01-02',
    }
    await insertHistoryRows(db, 'deleted', 'release', [deleted], 'later')
    await insertHistoryI18nRows(db, 'deleted', 'release', [deleted], 'later')
    const restoredParent = await readStreetSnapshot(metaDb, [db], 'inherited')
    expect(restoredParent.streets).toEqual([])
    expect(restoredParent.lifecycleStreets).toEqual(
      [{ ...deleted, versionHash: undefined }].map(({ versionHash, ...row }) => row),
    )
    expect(
      (await readStreetSnapshot(metaDb, [db], 'sibling')).lifecycleStreets,
    ).toMatchObject([{ status: 'active', version: 1 }])
    // A retry cannot change the retained deletion's counter or names.
    await insertHistoryRows(
      db,
      'deleted',
      'release',
      [{ ...deleted, version: 99 }],
      'retry',
    )
    expect(
      (await readStreetSnapshot(metaDb, [db], 'inherited')).lifecycleStreets[0]
        ?.version,
    ).toBe(4)
    expect(sqlite.query('SELECT count(*) AS n FROM streets').get()).toEqual({ n: 2 })
  } finally {
    sqlite.close()
    meta.close()
  }
})
