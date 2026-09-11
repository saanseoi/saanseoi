import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { join } from 'node:path'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import type { HarbourWritableDb } from '@repo/core/db/types'
import { loadMigrationSql } from '../../../../../../libs/core/src/testing/metaFixtures.ts'
import {
  closeSourceVersions,
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
              `SELECT versionHash, releaseId, validFromRelease, validToRelease, isCurrent
               FROM ${table} ORDER BY validFromRelease`,
            )
            .all(),
        ).toEqual([
          {
            versionHash: 'original-hash',
            releaseId: 'release-1',
            validFromRelease: firstVersion,
            validToRelease: secondVersion,
            isCurrent: 0,
          },
          {
            versionHash: 'changed-hash',
            releaseId: 'release-2',
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
