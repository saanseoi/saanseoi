import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'

import { buildReportRowCounts, collectCountRowsByRelease } from './reportingRows.ts'
import type { CountTarget } from './reportingTypes.ts'

function sourceDatabase(
  rows: Array<{
    sourceRecordId: string
    validFromRelease: string
    validToRelease: string | null
  }>,
) {
  const database = new Database(':memory:')
  database.exec(`
    CREATE TABLE overturePlaces (
      sourceRecordId TEXT,
      validFromRelease TEXT,
      validToRelease TEXT
    );
  `)
  const insert = database.query(
    'INSERT INTO overturePlaces (sourceRecordId, validFromRelease, validToRelease) VALUES (?, ?, ?)',
  )
  for (const row of rows)
    insert.run(row.sourceRecordId, row.validFromRelease, row.validToRelease)

  return {
    database,
    binding: {
      prepare(query: string) {
        return {
          bind(...values: string[]) {
            return {
              all: async () => ({
                results: database.query(query).all(...values),
              }),
            }
          },
        }
      },
    } as unknown as D1Database,
  }
}

test('Place reporting counts valid rows across all assigned source shards', async () => {
  const old = sourceDatabase([
    {
      sourceRecordId: 'retained',
      validFromRelease: '2025-01-01.0',
      validToRelease: null,
    },
    {
      sourceRecordId: 'retired',
      validFromRelease: '2025-01-01.0',
      validToRelease: '2026-01-01.0',
    },
  ])
  const active = sourceDatabase([
    {
      sourceRecordId: 'changed',
      validFromRelease: '2026-09-01.0',
      validToRelease: null,
    },
    {
      sourceRecordId: 'new',
      validFromRelease: '2026-09-01.0',
      validToRelease: null,
    },
  ])
  const target = {
    bindings: [old.binding, active.binding],
    kind: 'source',
    resourceReleaseId: 'place-release-2026',
    sourceVersion: '2026-09-01.0',
    specs: [
      {
        label: 'source',
        strategy: 'source-validity',
        tableName: 'overturePlaces',
      },
    ],
  } satisfies CountTarget

  try {
    const counts = await collectCountRowsByRelease([
      { history: null, resourceReleaseId: target.resourceReleaseId, source: target },
    ])
    expect(buildReportRowCounts(target, counts)).toEqual([
      {
        kind: 'source',
        label: 'source',
        rowCount: 3,
        tableName: 'overturePlaces',
      },
    ])
  } finally {
    old.database.close()
    active.database.close()
  }
})

test('SaanSeoi release reports count inherited assertions by release validity', async () => {
  const { buildReleaseCountPlans } = await import('./reportingRows')
  const { createLocalHarbourDb } = await import('@repo/core/testing/localDb')
  const { loadMigrationSql } = await import(
    '../../../../../libs/core/src/testing/metaFixtures'
  )
  const { resolve } = await import('node:path')
  const meta = new Database(':memory:')
  const source = sourceDatabase([
    {
      sourceRecordId: 'inherited',
      validFromRelease: '2026-08-01.0',
      validToRelease: null,
    },
    { sourceRecordId: 'added', validFromRelease: '2026-09-01.0', validToRelease: null },
    {
      sourceRecordId: 'retired',
      validFromRelease: '2026-08-01.0',
      validToRelease: '2026-09-01.0',
    },
  ])
  try {
    meta.exec(
      loadMigrationSql(resolve(import.meta.dir, '../../../../../libs/db/migrations'), [
        'meta',
      ]),
    )
    meta.exec(
      "INSERT INTO dataShards(id,shardType,regionCode,year,environment,databaseName,databaseId,bindingName,status,versionHash) VALUES('source','source','hk','2026','preview','source','source','DB_SOURCE_HK_2026','active','hash')",
    )
    source.database.exec(
      'ALTER TABLE overturePlaces RENAME TO ssDivision; CREATE TABLE ssDivisionArea AS SELECT * FROM ssDivision;',
    )
    const plans = await buildReleaseCountPlans(
      createLocalHarbourDb(meta),
      { DB_SOURCE_HK_2026: source.binding },
      'preview',
      [
        {
          resourceReleaseId: 'division-release',
          resourceType: 'division',
          source: 'saanseoi',
          sourceUrl: null,
          sourceVersion: '2026-09-01.0',
          cohortKey: '2026-09-01.0',
          regionCode: 'hk',
        },
        {
          resourceReleaseId: 'area-release',
          resourceType: 'divisionArea',
          source: 'saanseoi',
          sourceUrl: null,
          sourceVersion: '2026-09-01.0',
          cohortKey: '2026-09-01.0',
          regionCode: 'hk',
        },
      ],
    )
    const counts = await collectCountRowsByRelease(plans)
    expect(plans.map(plan => buildReportRowCounts(plan.source, counts))).toEqual([
      [{ kind: 'source', label: 'source', tableName: 'ssDivision', rowCount: 2 }],
      [{ kind: 'source', label: 'source', tableName: 'ssDivisionArea', rowCount: 2 }],
    ])
  } finally {
    meta.close()
    source.database.close()
  }
})
