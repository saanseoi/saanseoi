import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { loadMigrationSql } from '../../../../../../libs/core/src/testing/metaFixtures.ts'
import { resolve } from 'node:path'
import { buildDivisionHistorySqlFile } from './processLocalDivisionSqlUploadRows'
import type { DivisionSqlState } from './processLocalDivisionSqlUploadTypes'

test('a returning base version keeps distinct localisation provenance versions', async () => {
  const db = new Database(':memory:')
  try {
    db.exec(
      loadMigrationSql(
        resolve(import.meta.dir, '../../../../../../libs/db/migrations'),
        ['history'],
      ),
    )
    for (const [index, inferred] of [false, true].entries()) {
      const state = {
        snapshotId: `snapshot-${index}`,
        currentRows: new Map(),
        seenIds: new Set(['division']),
        records: [
          {
            id: 'division',
            versionHash: 'same-base',
            i18nVersionHash: 'unused',
            baseChanged: true,
            currentChanged: true,
            currentExists: false,
            isSupplemental: true,
            base: {
              id: 'division',
              class: 'district',
              hierarchies: {},
              createdAt: 'now',
              updatedAt: 'now',
            },
            canonicalI18n: [
              {
                divisionId: 'division',
                locale: 'en',
                name: 'Same name',
                meta: {
                  isLocaleInferred: inferred,
                  fields: { name: { origin: inferred ? 'inferred' : 'provided' } },
                },
              },
            ],
          },
        ],
      } as unknown as DivisionSqlState
      const file = await buildDivisionHistorySqlFile(
        {
          datasetId: 'dataset',
          resourceReleaseId: 'release',
          source: 'overture',
          sourceVersion: '2026-09-23.0',
          regionCode: 'hk',
          resourceType: 'division',
        } as Parameters<typeof buildDivisionHistorySqlFile>[0],
        state,
        async () => {},
      )
      db.exec(file.sql)
    }
    const rows = db
      .query(
        "SELECT versionHash, json_extract(meta, '$.isLocaleInferred') AS isLocaleInferred FROM divisionsI18n ORDER BY isLocaleInferred",
      )
      .all() as Array<{ versionHash: string; isLocaleInferred: number }>
    expect(rows).toHaveLength(2)
    expect(rows[0]!.versionHash).not.toBe(rows[1]!.versionHash)
    expect(rows.map(row => row.isLocaleInferred)).toEqual([0, 1])
  } finally {
    db.close()
  }
})
